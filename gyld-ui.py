#!/usr/bin/env python3
"""gyld-ui — stand the whole Gyld UI composition up, check it, and tear it down.

One command for what `dev-docs/GrythGyldDemoRunbook.md` in gryth-wz walks
through by hand: grazel with the `glade-gyld` supplier behind it, the desktop in
front of it, and a check that says whether the result actually works.

    python3 gyld-ui.py start                  # the runbook's ports: 5173/8080/9099
    python3 gyld-ui.py status                 # every instance, ok/FAIL per check
    python3 gyld-ui.py start --port 5180      # a second instance, its own ports
    python3 gyld-ui.py restart --port 5180
    python3 gyld-ui.py stop --purge           # every instance, data included

Runs on the SYSTEM python3 (3.10) as well as 3.13 — nothing here is newer than
3.10, because this script is the thing you reach for before anything is set up.
The Gyld hosts the supplier runs are a different matter: they need 3.13 at
`/opt/homebrew/bin/python3.13`, which is the supplier's own default and the one
place it can be. grazel passes no interpreter through to the supplier, so this
script checks that path is there and has nothing to override it with.

The bundle root is NOT laid here. `glade-gyld` lays the stage and makes the
first build itself on an empty root, as run `boot-1`, while it goes on serving
(`glade-wz/glade-gyld/README.md`, "The first build is the supplier's own"). What
this script does is WAIT for it: the supplier's `published builds/… (N streams)`
line is the census reaching the shares, and a desk that opens before it reads as
waiting. Two surprises of the hand-driven runbook are what remains for this
script to make impossible:

* `instance already locked` from a node that had already exited. The lock is
  advisory and holds the writer's pid, so a dead pid is cleared and said so;
  a live one is a running node and is reported instead of started over.
* a page opened onto a root whose first build has not landed. `start` does not
  print the URL until the supplier says it published one.

Stdlib only, by rule: this must run in a checkout with nothing installed.
"""

import argparse
import errno
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import MISSING, dataclass, fields
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence, Tuple

# --------------------------------------------------------------------------
# The composition's fixed points
# --------------------------------------------------------------------------

#: The UI port the runbook opens, and the two grazel ports it prints. The
#: derivation below is pinned to this triple so a default start still matches
#: every command written down in the runbook and in the plugin READMEs.
DEFAULT_UI_PORT = 5173
DEFAULT_HTTP_PORT = 8080
DEFAULT_NODE_PORT = 9099

LOWEST_PORT = 1024
HIGHEST_PORT = 65535

#: grazel's `--name`, which is also the instance directory the node locks.
GRAZEL_NODE_NAME = "grazel"

#: The interpreter the Gyld hosts the supplier runs need. The system python3 is
#: 3.10 and they fail on it (glade-gyld/README.md, "Run"). This exact path is
#: `glade-gyld`'s own `DEFAULT_PYTHON` and grazel gives it no way to be told
#: another, so it is checked and never chosen: a 3.13 anywhere else is no use.
SUPPLIER_PYTHON = "/opt/homebrew/bin/python3.13"

#: The volume a build lands on, and the floor the runbook stops at.
BUILD_VOLUME = "/System/Volumes/Data"
FREE_SPACE_FLOOR_GIB = 5.0

STATE_FILENAME = "gyld-ui.json"
INSTANCES_DIRNAME = "instances"

GRAZEL_READY_TIMEOUT = 120.0
VITE_READY_TIMEOUT = 180.0
#: The supplier's first build is minutes of Python on a cold checkout.
FIRST_BUILD_TIMEOUT = 1200.0
FIRST_BUILD_TICK = 5.0
BUILT_MODE_BUILD_TIMEOUT = 1800.0
STOP_GRACE_SECONDS = 15.0
HTTP_TIMEOUT = 5.0

#: The environment the ask agent is configured through, and the ONE place that
#: says so. grazel composes `glade-gyld`'s argv itself and passes none of the
#: supplier's `--agent-*` flags (glade-wz/grazel/src/lib.rs,
#: `gyld_supplier_argv`), so a desk's endpoint and model reach it only through
#: this environment or through `<bundle-root>/agent/config.json`. The
#: environment outranks the file, exactly as the supplier resolves it
#: (glade-gyld/src/agent.rs).
AGENT_BASE_URL_ENV = "ANTHROPIC_BASE_URL"
AGENT_MODEL_ENV = "GYLD_AGENT_MODEL"
#: Key sources. Named here to be CARRIED, and never printed or logged: the
#: supplier reads one at the moment of a call and nothing else ever sees it.
AGENT_KEY_ENVS = ("ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY")
AGENT_ENVS = (AGENT_BASE_URL_ENV, AGENT_MODEL_ENV) + AGENT_KEY_ENVS

#: The supplier's own config file, relative to the bundle root.
AGENT_CONFIG_FILE = "agent/config.json"

#: Anthropic's own endpoint needs a key even to list models, so `status` only
#: asks whether its host RESOLVES. Everything else is expected to answer.
ANTHROPIC_HOST = "anthropic.com"
AGENT_MODELS_PATH = "/v1/models"

_WS_PORT = re.compile(r":(\d+)\s*$")


# --------------------------------------------------------------------------
# Run modes
# --------------------------------------------------------------------------


class RunMode:
    """How the page is served — an object rather than a string tag, so the two
    modes carry their own port rule and their own URL (AGENTS.md, "Design
    rules": semantic concepts own behaviour).

    `dev` runs `pnpm dev:gyld` in front of grazel and proxies `/gyld/` and
    `/bootstrap.json` back to it, so `--port` is vite's. `built` hands
    `dist-gyld` to grazel and there is no second server at all, so `--port` IS
    grazel's HTTP port and the page and the bundle root are one origin.
    """

    _BY_NAME: Dict[str, "RunMode"] = {}

    def __init__(self, name: str, runs_vite: bool, describe: str) -> None:
        self.name = name
        self.runs_vite = runs_vite
        self.describe = describe
        RunMode._BY_NAME[name] = self

    @classmethod
    def named(cls, name: str) -> Optional["RunMode"]:
        return cls._BY_NAME.get(name)

    @classmethod
    def names(cls) -> List[str]:
        return list(cls._BY_NAME)

    def http_port_for(self, ui_port: int) -> int:
        """grazel's HTTP port, given the port you open in the browser."""
        if not self.runs_vite:
            return ui_port
        return derived_http_port(ui_port)

    def url(self, ports: "Ports") -> str:
        if self.runs_vite:
            return "http://localhost:{}/".format(ports.ui)
        return "http://127.0.0.1:{}/".format(ports.http)

    def __repr__(self) -> str:
        return "RunMode({!r})".format(self.name)


DEV = RunMode("dev", True, "pnpm dev:gyld in front of grazel")
BUILT = RunMode("built", False, "dist-gyld served by grazel, one origin")


# --------------------------------------------------------------------------
# Ports: deterministic, per instance, never colliding
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Ports:
    ui: int
    http: int
    node: int


def _wrap_port(value: int) -> int:
    span = HIGHEST_PORT - LOWEST_PORT + 1
    return LOWEST_PORT + (value - LOWEST_PORT) % span


def derived_http_port(ui_port: int) -> int:
    """grazel's HTTP port for a dev-mode UI port. The default UI port keeps the
    runbook's 8080; every other port moves by the same offset, so two instances
    on different UI ports never share a grazel."""
    if ui_port == DEFAULT_UI_PORT:
        return DEFAULT_HTTP_PORT
    return _wrap_port(DEFAULT_HTTP_PORT + ui_port - DEFAULT_UI_PORT)


def derived_node_port(http_port: int) -> int:
    """The node's WS port for a grazel HTTP port, on the same rule."""
    if http_port == DEFAULT_HTTP_PORT:
        return DEFAULT_NODE_PORT
    return _wrap_port(DEFAULT_NODE_PORT + http_port - DEFAULT_HTTP_PORT)


def derive_ports(
    ui_port: int,
    mode: RunMode,
    http: Optional[int] = None,
    node: Optional[int] = None,
) -> Ports:
    """The three ports of one instance. An explicit `--http` / `--node-port`
    always wins; everything else is derived from the port you open."""
    http_port = mode.http_port_for(ui_port) if http is None else http
    if not mode.runs_vite and http is not None and http != ui_port:
        raise ValueError(
            "in built mode --port IS grazel's HTTP port: "
            "--port {} and --http {} cannot both hold".format(ui_port, http)
        )
    node_port = derived_node_port(http_port) if node is None else node
    return Ports(
        ui=ui_port if mode.runs_vite else http_port, http=http_port, node=node_port
    )


def instances_root() -> Path:
    return Path.home() / ".gyld-ui" / INSTANCES_DIRNAME


def default_data_dir(ui_port: int) -> Path:
    """Where an instance's data lives. NOT /tmp: a ruling made in the UI is
    written into the bundle root under this directory and has to survive a
    reboot."""
    return instances_root() / str(ui_port)


# --------------------------------------------------------------------------
# The state file
# --------------------------------------------------------------------------


@dataclass
class InstanceState:
    """`<data>/gyld-ui.json` — what `status`, `stop` and `restart` need to act
    on an instance nobody is holding a terminal for."""

    mode: str
    ui_port: int
    http_port: int
    node_port: int
    grazel_pid: Optional[int]
    vite_pid: Optional[int]
    data: str
    gyld_root: str
    glade_wz: str
    gryth_ui: str
    python: str
    grazel_log: str
    vite_log: str
    started_at: str
    url: str
    # The git-tracked folder the desk leaves a ruling in. Last only because a
    # dataclass field with a default has to be; it belongs beside `gyld_root`,
    # and the file is written sorted anyway. Defaulted because instances were
    # already running when it arrived — see `from_dict`.
    decisions_root: str = ""

    def to_dict(self) -> Dict[str, object]:
        return {field.name: getattr(self, field.name) for field in fields(self)}

    @classmethod
    def from_dict(cls, body: Dict[str, object]) -> "InstanceState":
        known = {field.name for field in fields(cls)}
        # A field with a DEFAULT is one an older state file may not carry, and a
        # file written before that field existed must still load: an instance
        # this script cannot read is one it cannot stop.
        required = {
            field.name
            for field in fields(cls)
            if field.default is MISSING and field.default_factory is MISSING
        }
        missing = required - set(body)
        if missing:
            raise ValueError("state is missing {}".format(", ".join(sorted(missing))))
        return cls(**{name: body[name] for name in known if name in body})

    def run_mode(self) -> RunMode:
        mode = RunMode.named(self.mode)
        if mode is None:
            raise ValueError("unknown mode {!r} in the state file".format(self.mode))
        return mode

    def ports(self) -> Ports:
        return Ports(ui=self.ui_port, http=self.http_port, node=self.node_port)


def state_path(data: Path) -> Path:
    return data / STATE_FILENAME


def write_state(data: Path, state: InstanceState) -> None:
    data.mkdir(parents=True, exist_ok=True)
    body = json.dumps(state.to_dict(), indent=2, sort_keys=True)
    state_path(data).write_text(body + "\n", encoding="utf-8")


def read_state(data: Path) -> Optional[InstanceState]:
    """The recorded instance, or nothing. A file that cannot be read as one is
    nothing rather than an exception: a half-written state must not stop a
    `stop` from running."""
    try:
        body = json.loads(state_path(data).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(body, dict):
        return None
    try:
        return InstanceState.from_dict(body)
    except (TypeError, ValueError):
        return None


def recorded_instances(port: Optional[int]) -> List[Path]:
    """The data directories to act on: the one for `--port`, else every
    instance under `~/.gyld-ui/instances/`.

    A directory with no state file is still an instance — a stopped one, whose
    data is being kept. `stop --purge` has to reach it, and `status` skips it
    because there is nothing running to check.
    """
    if port is not None:
        return [default_data_dir(port)]
    root = instances_root()
    if not root.is_dir():
        return []
    return [entry for entry in sorted(root.iterdir()) if entry.is_dir()]


# --------------------------------------------------------------------------
# The node's advisory instance lock
# --------------------------------------------------------------------------


def instance_lock_path(data: Path, name: str = GRAZEL_NODE_NAME) -> Path:
    """Where glade-node puts its lock: `<GLADE_HOME>/sys/<name>/instance.lock`,
    and grazel runs the node under `GLADE_HOME=<data>/sys`."""
    return data / "sys" / "sys" / name / "instance.lock"


class LockState:
    """What an `instance.lock` means right now. The file is created O_EXCL and
    removed on drop, so a crash leaves one behind holding a dead pid — that is
    exactly the `instance already locked` this script has to get past, and the
    pid in the file is what tells the two cases apart."""

    def __init__(
        self, path: Path, present: bool, pid: Optional[int], alive: bool
    ) -> None:
        self.path = path
        self.present = present
        self.pid = pid
        self.alive = alive

    @property
    def blocks_start(self) -> bool:
        """A live writer: there is a node running against this data directory."""
        return self.present and self.alive

    @property
    def should_remove(self) -> bool:
        """Stale: the writer is gone, or the file says nothing readable."""
        return self.present and not self.alive

    def describe(self) -> str:
        if not self.present:
            return "no instance.lock at {}".format(self.path)
        if self.alive:
            return "instance.lock at {} is held by running pid {}".format(
                self.path, self.pid
            )
        if self.pid is None:
            return "instance.lock at {} holds no readable pid — stale".format(self.path)
        return "instance.lock at {} holds dead pid {} — stale".format(
            self.path, self.pid
        )


def read_lock_state(path: Path, is_alive: Callable[[int], bool]) -> LockState:
    """Read the lock and decide. `is_alive` is injected so the decision is
    testable without a process to point at."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return LockState(path, present=False, pid=None, alive=False)
    try:
        pid = int(text.strip())
    except ValueError:
        return LockState(path, present=True, pid=None, alive=False)
    return LockState(path, present=True, pid=pid, alive=is_alive(pid))


# --------------------------------------------------------------------------
# Readiness: the runbook's six lines
# --------------------------------------------------------------------------


class ReadinessLine:
    """One of the six lines that say the composition came up, and the exact
    text to look for in grazel's log."""

    def __init__(self, label: str, needle: str) -> None:
        self.label = label
        self.needle = needle

    def seen_in(self, text: str) -> bool:
        return self.needle in text


def readiness_lines(node_port: int) -> List[ReadinessLine]:
    """The six, in the order grazel prints them. The listening line names THIS
    instance's node port, so a log left over from another instance cannot read
    as ready."""
    return [
        ReadinessLine("node registered app grazel", "[node] app grazel registered"),
        ReadinessLine("node registered app gyld", "[node] app gyld registered"),
        ReadinessLine("node serving ws-razel", "[node] workspace ws-razel serving"),
        ReadinessLine(
            "node listening on {}".format(node_port),
            "[node] listening {}\n".format(node_port),
        ),
        ReadinessLine("glade-gyld attaching", "[gyld] glade-gyld: attaching to"),
        ReadinessLine("glade-gyld serving", "[gyld] glade-gyld: serving"),
    ]


def missing_readiness(text: str, node_port: int) -> List[str]:
    """The labels of the lines not yet in the log."""
    padded = text if text.endswith("\n") else text + "\n"
    return [
        line.label for line in readiness_lines(node_port) if not line.seen_in(padded)
    ]


# --------------------------------------------------------------------------
# The supplier's first build and its publications
# --------------------------------------------------------------------------


#: `[gyld] glade-gyld: first build of <root> — the bundle root holds none
#: (run boot-1)`: the supplier found an empty bundle root and is building it
#: itself while it serves. The run id is READ off the line rather than assumed,
#: because it is the supplier that names it.
_FIRST_BUILD = re.compile(r"\[gyld\] glade-gyld: first build of .* \(run (\S+)\)")

#: `[gyld] glade-gyld: published builds/<stamp> (5 streams)`: the census reached
#: the value shares. The supplier logs exactly this line after a build, after
#: the first build, and once when it attaches to a root that already held one.
_PUBLISHED = re.compile(r"\[gyld\] glade-gyld: published (.+) \((\d+) streams?\)")


class PublishedBuild:
    """One publication the supplier logged: which build, and how many streams
    its `streams.json` lists — the census figure the stream manager shows."""

    def __init__(self, build: str, streams: int) -> None:
        self.build = build
        self.streams = streams

    def __repr__(self) -> str:
        return "PublishedBuild({!r}, {!r})".format(self.build, self.streams)


def latest_publication(text: str) -> Optional[PublishedBuild]:
    """The last build the supplier says it published, or nothing."""
    found = _PUBLISHED.findall(text)
    if not found:
        return None
    build, streams = found[-1]
    return PublishedBuild(build, int(streams))


def publication_of(text: str, name: str) -> Optional[PublishedBuild]:
    """The supplier's publication of ONE named build. `status` asks this of the
    build `latest.json` names: a bundle root holding a build the shares never
    heard about is a desk that reads as waiting."""
    for build, streams in reversed(_PUBLISHED.findall(text)):
        if build == name:
            return PublishedBuild(build, int(streams))
    return None


def first_build_run(text: str) -> Optional[str]:
    """The run the supplier's own first build is taking, while it is still in
    flight — `boot-1` — or nothing. A publication ends it: that is the build
    landing, and it is what the wait below is waiting for."""
    found = _FIRST_BUILD.findall(text)
    if not found or _PUBLISHED.search(text):
        return None
    return found[-1]


def build_name(bundle: Path, build: Path) -> str:
    """A build directory as the supplier's log names it: `builds/<stamp>`
    relative to the bundle root (glade-gyld `supplier.rs::named`), with the
    absolute path as the fallback for one somehow outside it."""
    try:
        return str(build.relative_to(bundle))
    except ValueError:
        return str(build)


def log_size(path: Path) -> int:
    """How much of the log is already there. grazel APPENDS to one log per
    instance, so everything before this offset belongs to an earlier run and a
    restart must not read its readiness lines as its own."""
    try:
        return path.stat().st_size
    except OSError:
        return 0


def log_since(path: Path, offset: int) -> str:
    """This run's share of the log. A byte offset can land inside a multi-byte
    character, so it is decoded with replacement rather than refused."""
    try:
        with open(str(path), "rb") as handle:
            handle.seek(offset)
            return handle.read().decode("utf-8", "replace")
    except OSError:
        return ""


# --------------------------------------------------------------------------
# grazel's /bootstrap.json
# --------------------------------------------------------------------------


class Bootstrap:
    """grazel's session-placement body: `{node_ws, mode, name}`. `node_ws` is
    authoritative for which node the page will attach to — a derived port is
    only ever a guess at it."""

    def __init__(self, node_ws: str, mode: str, name: str) -> None:
        self.node_ws = node_ws
        self.mode = mode
        self.name = name

    @property
    def node_port(self) -> Optional[int]:
        found = _WS_PORT.search(self.node_ws)
        if found is None:
            return None
        return int(found.group(1))

    def __repr__(self) -> str:
        return "Bootstrap({!r}, {!r}, {!r})".format(self.node_ws, self.mode, self.name)


def parse_bootstrap(text: str) -> Bootstrap:
    try:
        body = json.loads(text)
    except ValueError as error:
        raise ValueError("/bootstrap.json is not JSON: {}".format(error))
    if not isinstance(body, dict):
        raise ValueError("/bootstrap.json is not an object")
    return Bootstrap(
        node_ws=str(body.get("node_ws", "")),
        mode=str(body.get("mode", "")),
        name=str(body.get("name", "")),
    )


# --------------------------------------------------------------------------
# The bundle root
# --------------------------------------------------------------------------


def bundle_root(data: Path) -> Path:
    """The supplier's app-owned storage: grazel serves it at `/gyld/`."""
    return data / "files" / "gyld"


def latest_build(bundle: Path) -> Optional[Path]:
    """The latest successful build, on the supplier's own rule: `latest.json` is
    authoritative, and when it is missing or stale the newest `builds/`
    directory holding a `streams.json` answers instead."""
    try:
        body = json.loads((bundle / "latest.json").read_text(encoding="utf-8"))
        relative = body.get("output_dir") if isinstance(body, dict) else None
        if isinstance(relative, str):
            candidate = bundle / relative
            if (candidate / "streams.json").is_file():
                return candidate
    except (OSError, ValueError):
        pass
    builds = bundle / "builds"
    if not builds.is_dir():
        return None
    found = [
        entry
        for entry in sorted(builds.iterdir())
        if (entry / "streams.json").is_file()
    ]
    if not found:
        return None
    return found[-1]


def count_streams(build: Path) -> Optional[int]:
    try:
        body = json.loads((build / "streams.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    streams = body.get("streams") if isinstance(body, dict) else None
    if not isinstance(streams, list):
        return None
    return len(streams)


# --------------------------------------------------------------------------
# Checks and the verdict
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class CheckResult:
    label: str
    ok: bool
    detail: str

    def line(self) -> str:
        return "  {:<5} {} — {}".format(
            "ok" if self.ok else "FAIL", self.label, self.detail
        )

    def to_dict(self) -> Dict[str, object]:
        return {"label": self.label, "ok": self.ok, "detail": self.detail}


class Verdict:
    """The one line that answers "is it working?", and the exit code with it.
    No checks at all is NOT working: nothing was proved."""

    def __init__(self, checks: Sequence[CheckResult]) -> None:
        self.checks = list(checks)

    @property
    def working(self) -> bool:
        return bool(self.checks) and all(check.ok for check in self.checks)

    @property
    def exit_code(self) -> int:
        return 0 if self.working else 1

    def failures(self) -> List[CheckResult]:
        return [check for check in self.checks if not check.ok]

    def line(self) -> str:
        return "working" if self.working else "not working"


# --------------------------------------------------------------------------
# Processes, ports and HTTP
# --------------------------------------------------------------------------


def pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except OSError as error:
        return error.errno == errno.EPERM
    return True


def pid_command(pid: int) -> str:
    done = _run(["ps", "-p", str(pid), "-o", "command="])
    return done.stdout.strip()


def pid_is(pid: Optional[int], needle: str) -> bool:
    """Alive AND still the process we started — a pid can be reused."""
    if pid is None or not pid_alive(pid):
        return False
    return needle in pid_command(pid)


def _run(
    argv: Sequence[str], cwd: Optional[Path] = None
) -> subprocess.CompletedProcess:
    return subprocess.run(
        list(argv),
        cwd=None if cwd is None else str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        universal_newlines=True,
    )


def port_listeners(port: int) -> List[int]:
    done = _run(["lsof", "-nP", "-iTCP:{}".format(port), "-sTCP:LISTEN", "-t"])
    found = []
    for line in done.stdout.split():
        try:
            found.append(int(line))
        except ValueError:
            continue
    return found


def port_accepts(port: int, host: str = "localhost", timeout: float = 1.0) -> bool:
    """Does anything accept a TCP connection there?

    EVERY address the host resolves to is tried, not just the first. Vite binds
    `localhost`, which on this machine is `[::1]` and NOT `127.0.0.1`, so a
    v4-only probe reports a dev server that is plainly running as down — which
    it did, once, before this loop existed.
    """
    try:
        candidates = socket.getaddrinfo(host, port, 0, socket.SOCK_STREAM)
    except OSError:
        return False
    for family, kind, proto, _canonical, address in candidates:
        probe = socket.socket(family, kind, proto)
        probe.settimeout(timeout)
        try:
            probe.connect(address)
            return True
        except OSError:
            continue
        finally:
            probe.close()
    return False


class HttpAnswer:
    def __init__(self, status: int, body: str, error: str = "") -> None:
        self.status = status
        self.body = body
        self.error = error

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 300


def http_get(url: str, timeout: float = HTTP_TIMEOUT) -> HttpAnswer:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as answer:
            raw = answer.read(1024 * 256)
            return HttpAnswer(answer.getcode(), raw.decode("utf-8", "replace"))
    except urllib.error.HTTPError as error:
        return HttpAnswer(error.code, "", "HTTP {}".format(error.code))
    except (urllib.error.URLError, OSError, ValueError) as error:
        return HttpAnswer(0, "", str(error))


def free_gib(path: str) -> float:
    usage = shutil.disk_usage(path)
    return usage.free / (1024.0 * 1024.0 * 1024.0)


def tail_of(path: Path, lines: int = 25) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return "(no log at {})".format(path)
    return "\n".join(text.splitlines()[-lines:])


def now_stamp() -> str:
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


def agent_env(base: Dict[str, str]) -> Dict[str, str]:
    """The agent variables `base` actually sets, blanks dropped.

    PURE, and the only list of names in this script. grazel inherits the whole
    environment today, so this carries nothing it would not have carried — but
    it is what makes the passthrough a stated guarantee with a test behind it
    rather than an accident of `dict(os.environ)`, and a blank variable is
    treated as unset because `ANTHROPIC_BASE_URL=` in a shell is how one is
    cleared."""
    held: Dict[str, str] = {}
    for name in AGENT_ENVS:
        value = base.get(name, "")
        if value is not None and value.strip() != "":
            held[name] = value
    return held


def grazel_env(base: Dict[str, str]) -> Dict[str, str]:
    """The environment grazel is spawned with: everything, with the agent
    variables carried explicitly so a future narrowing of this cannot drop
    them in silence."""
    env = dict(base)
    env.update(agent_env(base))
    return env


def agent_env_line(passed: Dict[str, str]) -> str:
    """What to PRINT about the agent environment. The endpoint and the model by
    value; a key by name only, because a key never reaches a log, a record or a
    terminal."""
    if not passed:
        return "agent env: none set — the supplier uses {} or its defaults".format(
            AGENT_CONFIG_FILE
        )
    said = []
    for name in AGENT_ENVS:
        if name not in passed:
            continue
        if name in AGENT_KEY_ENVS:
            said.append("{}=<set>".format(name))
        else:
            said.append("{}={}".format(name, passed[name]))
    return "agent env: {}".format(" ".join(said))


def config_base_url(data: Path) -> Optional[str]:
    """The base URL `<bundle-root>/agent/config.json` names, if it names one and
    decodes at all. A file this script cannot read is not this script's problem
    to report — the supplier says so on its own log."""
    try:
        body = json.loads(
            (bundle_root(data) / AGENT_CONFIG_FILE).read_text(encoding="utf-8")
        )
    except (OSError, ValueError):
        return None
    if not isinstance(body, dict):
        return None
    held = body.get("base_url")
    return held if isinstance(held, str) and held.strip() != "" else None


def effective_base_url(data: Path, env: Dict[str, str]) -> Optional[Tuple[str, str]]:
    """The endpoint this instance's supplier will actually call, and where that
    came from — or `None` when nothing configures one and the supplier is on its
    own Anthropic default. The environment beats the file, as the supplier
    resolves it."""
    from_env = env.get(AGENT_BASE_URL_ENV, "")
    if from_env is not None and from_env.strip() != "":
        return (from_env.strip(), "environment")
    from_file = config_base_url(data)
    if from_file is not None:
        return (from_file.strip(), AGENT_CONFIG_FILE)
    return None


def host_of(url: str) -> str:
    """The host of a base URL, lowercased and without its port."""
    split = urllib.parse.urlsplit(url if "://" in url else "//" + url)
    return (split.hostname or "").lower()


def is_anthropic(url: str) -> bool:
    host = host_of(url)
    return host == ANTHROPIC_HOST or host.endswith("." + ANTHROPIC_HOST)


def host_resolves(host: str) -> bool:
    if host == "":
        return False
    try:
        socket.getaddrinfo(host, None)
        return True
    except OSError:
        return False


def agent_endpoint_check(
    base_url: str,
    whence: str,
    get: Callable[[str], HttpAnswer] = http_get,
    resolves: Callable[[str], bool] = host_resolves,
) -> CheckResult:
    """One check for the configured endpoint: is anything there?

    Two rules, because the two endpoints answer differently. Anthropic's needs a
    key even to list models, so a 401 there would be a PASS dressed as a
    failure — only the host is checked. A local endpoint (dabeest's patched
    Ollama, say) lists its models unauthenticated, so 200 is the answer and
    anything else is worth saying out loud before a reader asks a question and
    waits for a reply that will never come."""
    url = base_url.rstrip("/") + AGENT_MODELS_PATH
    if is_anthropic(base_url):
        host = host_of(base_url)
        found = resolves(host)
        return CheckResult(
            "agent endpoint",
            found,
            "{} ({}) — Anthropic's own, which needs a key to list models, so only "
            "the host is checked: {}".format(
                base_url,
                whence,
                "{} resolves".format(host)
                if found
                else "{} does NOT resolve".format(host),
            ),
        )
    answer = get(url)
    return CheckResult(
        "agent endpoint",
        answer.ok,
        "{} ({}) — {} {}".format(
            base_url,
            whence,
            url,
            "answered"
            if answer.ok
            else "did not ({})".format(answer.error or answer.status),
        ),
    )


# --------------------------------------------------------------------------
# Paths of the workzone
# --------------------------------------------------------------------------


SCRIPT_DIR = Path(__file__).resolve().parent


def default_gryth_ui() -> Path:
    return SCRIPT_DIR


def default_glade_wz() -> Path:
    return (SCRIPT_DIR / ".." / ".." / "glade-wz").resolve()


def default_gyld_root() -> Path:
    return (SCRIPT_DIR / ".." / ".." / "gyld-wz" / "gyld").resolve()


def default_decisions_root(glade_wz: Path) -> Path:
    """Where the desk leaves a ruling: a git-tracked folder in the glade
    workzone, not the instance's data directory. The owner commits it when he
    chooses; nothing here ever runs git."""
    return glade_wz / "decisions"


class Layout:
    """The roots one run needs, resolved once."""

    def __init__(
        self,
        gryth_ui: Path,
        glade_wz: Path,
        gyld_root: Path,
        decisions_root: Path,
        python: Path,
    ) -> None:
        self.gryth_ui = gryth_ui
        self.glade_wz = glade_wz
        self.gyld_root = gyld_root
        self.decisions_root = decisions_root
        self.python = python

    @property
    def grazel_dir(self) -> Path:
        return self.glade_wz / "grazel"

    @property
    def grazel_bin(self) -> Path:
        return self.grazel_dir / "target" / "debug" / "grazel"

    @property
    def node_bin(self) -> Path:
        return self.glade_wz / "glade" / "node" / "target" / "debug" / "glade-node"

    @property
    def gyld_supplier_bin(self) -> Path:
        return self.glade_wz / "glade-gyld" / "target" / "debug" / "glade-gyld"

    @property
    def dist_gyld(self) -> Path:
        return self.gryth_ui / "dist-gyld"


def supplier_python() -> Path:
    """The 3.13 the supplier will run its hosts with. Not a choice: grazel
    passes no interpreter through, so this is `glade-gyld`'s own default and the
    only path that helps. It is a prerequisite CHECK, not an option."""
    return Path(SUPPLIER_PYTHON)


# --------------------------------------------------------------------------
# Prerequisites
# --------------------------------------------------------------------------


def prerequisite_checks(layout: Layout) -> List[CheckResult]:
    """Everything that has to be true before a start is worth attempting, each
    with the fix beside it."""
    checks = []
    binaries = [
        ("glade-node", layout.node_bin, "glade/node"),
        ("grazel", layout.grazel_bin, "grazel"),
        ("glade-gyld", layout.gyld_supplier_bin, "glade-gyld"),
    ]
    for name, path, member in binaries:
        if path.is_file() and os.access(str(path), os.X_OK):
            checks.append(CheckResult(name, True, str(path)))
            continue
        checks.append(
            CheckResult(
                name,
                False,
                "missing at {} — fix: cargo build in {}/{}".format(
                    path, layout.glade_wz, member
                ),
            )
        )

    pnpm = shutil.which("pnpm")
    checks.append(
        CheckResult(
            "pnpm", pnpm is not None, pnpm or "not on PATH — fix: corepack enable pnpm"
        )
    )

    modules = layout.gryth_ui / "node_modules"
    checks.append(
        CheckResult(
            "node_modules",
            modules.is_dir(),
            str(modules)
            if modules.is_dir()
            else "absent — fix: pnpm install in {}".format(layout.gryth_ui),
        )
    )

    python_ok = layout.python.exists()
    checks.append(
        CheckResult(
            "python3.13",
            python_ok,
            str(layout.python)
            if python_ok
            else "not at {} — the supplier's own default, and grazel passes it "
            "no other — fix: brew install python@3.13".format(layout.python),
        )
    )

    gyld_ok = (layout.gyld_root / "scripts" / "emit_decision_streams.py").is_file()
    checks.append(
        CheckResult(
            "gyld checkout",
            gyld_ok,
            str(layout.gyld_root)
            if gyld_ok
            else "no scripts/emit_decision_streams.py under {} — fix: --gyld-root".format(
                layout.gyld_root
            ),
        )
    )

    free = free_gib(BUILD_VOLUME)
    checks.append(
        CheckResult(
            "free space",
            free >= FREE_SPACE_FLOOR_GIB,
            "{:.1f} GiB on {}{}".format(
                free,
                BUILD_VOLUME,
                ""
                if free >= FREE_SPACE_FLOOR_GIB
                else " — under the {:.0f} GiB floor".format(FREE_SPACE_FLOOR_GIB),
            ),
        )
    )
    return checks


# --------------------------------------------------------------------------
# Status
# --------------------------------------------------------------------------


def status_checks(state: InstanceState) -> List[CheckResult]:
    """Is this instance working? Each answer is one line, and the reason is on
    it whether it passed or not."""
    mode = state.run_mode()
    data = Path(state.data)
    checks: List[CheckResult] = []

    boot_url = "http://127.0.0.1:{}/bootstrap.json".format(state.http_port)
    answer = http_get(boot_url)
    node_port = None
    if not answer.ok:
        checks.append(
            CheckResult(
                "grazel /bootstrap.json",
                False,
                "{} did not answer ({})".format(
                    boot_url, answer.error or answer.status
                ),
            )
        )
    else:
        try:
            boot = parse_bootstrap(answer.body)
            node_port = boot.node_port
            checks.append(
                CheckResult(
                    "grazel /bootstrap.json",
                    True,
                    "node_ws {} mode {} name {}".format(
                        boot.node_ws, boot.mode, boot.name
                    ),
                )
            )
        except ValueError as error:
            checks.append(CheckResult("grazel /bootstrap.json", False, str(error)))

    # node_ws is authoritative; the recorded port is only the request we made.
    probe_port = node_port if node_port is not None else state.node_port
    # 127.0.0.1 literally: that is the host in the `node_ws` the page dials.
    accepts = port_accepts(probe_port, "127.0.0.1")
    checks.append(
        CheckResult(
            "glade-node WS",
            accepts,
            "127.0.0.1:{} {}".format(probe_port, "accepting" if accepts else "refused"),
        )
    )

    grazel_log = Path(state.grazel_log)
    alive = pid_is(state.grazel_pid, "grazel")
    log_text = ""
    try:
        log_text = grazel_log.read_text(encoding="utf-8", errors="replace")
    except OSError:
        log_text = ""
    serving = "[gyld] glade-gyld: serving" in log_text
    checks.append(
        CheckResult(
            "grazel + gyld supplier",
            alive and serving,
            "pid {} {}, log {} '[gyld] glade-gyld: serving'".format(
                state.grazel_pid,
                "alive" if alive else "gone",
                "carries" if serving else "does NOT carry",
            ),
        )
    )

    bundle = bundle_root(data)
    build = latest_build(bundle)
    if build is None:
        checks.append(
            CheckResult("bundle root built", False, "no build under {}".format(bundle))
        )
        checks.append(
            CheckResult("census published", False, "no build for the shares to carry")
        )
    else:
        count = count_streams(build)
        checks.append(
            CheckResult(
                "bundle root built",
                count is not None,
                "{} lists {} stream(s)".format(
                    build, count if count is not None else "unreadable"
                ),
            )
        )
        # A build on disk is not a census on the shares. Without the supplier's
        # own publication of THIS build, a desk that lands on the glade node
        # reads as waiting no matter what `latest.json` says.
        name = build_name(bundle, build)
        published = publication_of(log_text, name)
        checks.append(
            CheckResult(
                "census published",
                published is not None,
                "log {} '[gyld] glade-gyld: published {}'{}".format(
                    "carries" if published else "does NOT carry",
                    name,
                    " ({} streams)".format(published.streams)
                    if published
                    else " — the desk reads as waiting",
                ),
            )
        )

    # The ask agent's endpoint, when anything configures one. An instance with
    # no `base_url` anywhere is on the supplier's Anthropic default and adds no
    # line: a check nobody configured is not a check that failed.
    endpoint = effective_base_url(data, dict(os.environ))
    if endpoint is not None:
        checks.append(agent_endpoint_check(endpoint[0], endpoint[1]))

    page_url = mode.url(Ports(state.ui_port, state.http_port, state.node_port))
    page = http_get(page_url)
    is_gyld_page = (
        page.ok and "<title>gyld</title>" in page.body and 'id="root"' in page.body
    )
    checks.append(
        CheckResult(
            "gyld page",
            is_gyld_page,
            "{} {}".format(
                page_url,
                "serves the gyld entry"
                if is_gyld_page
                else "did not serve it ({})".format(page.error or page.status),
            ),
        )
    )

    if mode.runs_vite:
        for path in ("/gyld/latest.json", "/bootstrap.json"):
            proxied = "http://localhost:{}{}".format(state.ui_port, path)
            got = http_get(proxied)
            checks.append(
                CheckResult(
                    "proxy {}".format(path),
                    got.ok,
                    "{} {}".format(
                        proxied,
                        "answered"
                        if got.ok
                        else "did not ({})".format(got.error or got.status),
                    ),
                )
            )
    return checks


def notebooks_line(decisions_root: str) -> str:
    """The decisions folder and how many notebooks are in it.

    One line, because it answers the one question: rulings are files, and this
    says where they land and whether any have. An older instance recorded none,
    and then its rulings are in its own data directory.
    """
    if not decisions_root:
        return "no decisions root (rulings stay in the instance data directory)"
    root = Path(decisions_root)
    if not root.is_dir():
        return "{} (not there yet)".format(root)
    return "{} ({} notebooks)".format(root, len(list(root.glob("*.gyld.py"))))


def report_instance(state: InstanceState, checks: Sequence[CheckResult]) -> Verdict:
    mode = state.run_mode()
    verdict = Verdict(checks)
    print(
        "instance :{} — mode {} ({}), grazel http {} node {}".format(
            state.ui_port, state.mode, mode.describe, state.http_port, state.node_port
        )
    )
    for check in checks:
        print(check.line())
    print("  data: {}".format(state.data))
    print("  rulings: {}".format(notebooks_line(state.decisions_root)))
    print("  logs: {}".format(Path(state.grazel_log).parent))
    print("  {}".format(verdict.line()))
    print("URL: {}".format(state.url))
    return verdict


# --------------------------------------------------------------------------
# Starting
# --------------------------------------------------------------------------


def spawn_detached(
    argv: Sequence[str], cwd: Path, log: Path, env: Dict[str, str]
) -> int:
    """One detached child in its own process group, output to one file. The
    group is what `stop` signals: grazel's children — the node and both
    suppliers — are in it."""
    log.parent.mkdir(parents=True, exist_ok=True)
    handle = open(str(log), "ab", buffering=0)
    try:
        child = subprocess.Popen(
            list(argv),
            cwd=str(cwd),
            stdout=handle,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
            env=env,
        )
    finally:
        handle.close()
    return child.pid


def stream_command(
    argv: Sequence[str], cwd: Path, env: Dict[str, str], timeout: float
) -> int:
    """Run a command in the foreground and put its lines on our own stdout as
    they arrive — a `pnpm build:gyld` is minutes of tsc and vite, and silence is
    not a progress report."""
    child = subprocess.Popen(
        list(argv),
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL,
        universal_newlines=True,
        bufsize=1,
        env=env,
    )
    deadline = time.time() + timeout
    assert child.stdout is not None
    for line in child.stdout:
        print("    | {}".format(line.rstrip()))
        if time.time() > deadline:
            child.kill()
            print("    | (timed out after {:.0f}s)".format(timeout))
            break
    return child.wait()


def wait_for_grazel(log: Path, offset: int, node_port: int, pid: int) -> List[str]:
    """Wait for the six lines. A grazel that exits first is a failure, and the
    tail of its log is the answer to why. Only THIS run's share of the log
    counts: the file is appended to across starts."""
    deadline = time.time() + GRAZEL_READY_TIMEOUT
    missing = missing_readiness("", node_port)
    while time.time() < deadline:
        missing = missing_readiness(log_since(log, offset), node_port)
        if not missing:
            return []
        if not pid_alive(pid):
            return missing
        time.sleep(0.4)
    return missing


def wait_for_publication(
    log: Path, offset: int, pid: int, say: Callable[[str], None] = print
) -> Optional[PublishedBuild]:
    """Wait for the supplier to say it published a build onto the value shares.

    Both of the supplier's paths end here. On a root that already holds a build
    it publishes the moment it attaches and this returns at once; on an empty
    one it lays the stage and runs the first build itself as `boot-1`, which is
    minutes of Python, and the wait says so with the elapsed time rather than
    sitting silent. Nothing else is done meanwhile: the supplier owns this and a
    second copy of it here is exactly what was deleted.

    Nothing published is `None`, and the caller says which of the two reasons it
    was: grazel exited, or the timeout ran out.
    """
    started = time.time()
    deadline = started + FIRST_BUILD_TIMEOUT
    said = -FIRST_BUILD_TICK
    while time.time() < deadline:
        text = log_since(log, offset)
        published = latest_publication(text)
        if published is not None:
            return published
        if not pid_alive(pid):
            return None
        waited = time.time() - started
        run = first_build_run(text)
        if run is not None and waited - said >= FIRST_BUILD_TICK:
            said = waited
            say("  first build running (run {}) — {:.0f}s".format(run, waited))
        time.sleep(0.4)
    return None


def wait_for_port(port: int, timeout: float, pid: Optional[int] = None) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if port_accepts(port):
            return True
        if pid is not None and not pid_alive(pid):
            return False
        time.sleep(0.4)
    return False


def start_command(args: argparse.Namespace) -> int:
    ui_port = DEFAULT_UI_PORT if args.port is None else args.port
    mode = RunMode.named(args.mode)
    if mode is None:
        print("unknown --mode {}".format(args.mode), file=sys.stderr)
        return 2
    try:
        ports = derive_ports(ui_port, mode, http=args.http, node=args.node_port)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2

    data = (
        Path(args.data).expanduser().resolve()
        if args.data
        else default_data_dir(ports.ui)
    )
    glade_wz = Path(args.glade_wz).resolve() if args.glade_wz else default_glade_wz()
    layout = Layout(
        gryth_ui=Path(args.gryth_ui).resolve() if args.gryth_ui else default_gryth_ui(),
        glade_wz=glade_wz,
        gyld_root=Path(args.gyld_root).resolve()
        if args.gyld_root
        else default_gyld_root(),
        decisions_root=Path(args.decisions_root).expanduser().resolve()
        if args.decisions_root
        else default_decisions_root(glade_wz),
        python=supplier_python(),
    )

    print("gyld-ui start — mode {} ({})".format(mode.name, mode.describe))
    print(
        "  ports: ui {} · grazel http {} · node {}".format(
            ports.ui, ports.http, ports.node
        )
    )
    print("  data:  {}".format(data))

    print("prerequisites")
    prereqs = prerequisite_checks(layout)
    for check in prereqs:
        print(check.line())
    if not Verdict(prereqs).working:
        print("not working — fix the FAIL lines above and run start again")
        return 1

    existing = read_state(data)
    if existing is not None and pid_is(existing.grazel_pid, "grazel"):
        print("already running on :{} — nothing to start".format(existing.ui_port))
        return report_instance(existing, status_checks(existing)).exit_code

    holders = [pid for pid in port_listeners(ports.ui) if pid > 0]
    if holders:
        print(
            "refusing: :{} is already held by something that is not ours".format(
                ports.ui
            )
        )
        for pid in holders:
            print("  pid {}: {}".format(pid, pid_command(pid)))
        print("  fix: stop it, or start on another port with --port")
        return 1
    if mode.runs_vite and port_listeners(ports.http):
        print("refusing: grazel's http port :{} is already held".format(ports.http))
        for pid in port_listeners(ports.http):
            print("  pid {}: {}".format(pid, pid_command(pid)))
        return 1

    lock = read_lock_state(instance_lock_path(data), pid_alive)
    if lock.blocks_start:
        print("refusing: {}".format(lock.describe()))
        print("  that is a glade node already running against this data directory")
        print("  fix: python3 gyld-ui.py stop --port {}".format(ports.ui))
        return 1
    if lock.should_remove:
        print("stale lock: {}".format(lock.describe()))
        try:
            instance_lock_path(data).unlink()
            print("  removed it — the node that held it is gone")
        except OSError as error:
            print("  could not remove it: {}".format(error))
            return 1

    if not mode.runs_vite:
        index = layout.dist_gyld / "index.html"
        if args.build or not index.is_file():
            why = "--build" if args.build else "no {}".format(index)
            print("build: pnpm build:gyld ({})".format(why))
            code = stream_command(
                ["pnpm", "build:gyld"],
                cwd=layout.gryth_ui,
                env=dict(os.environ),
                timeout=BUILT_MODE_BUILD_TIMEOUT,
            )
            if code != 0:
                print("build FAILED (exit {})".format(code))
                return 1
        else:
            print("build: {} is present (pass --build to force)".format(index))

    logs = data / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    grazel_log = logs / "grazel.log"
    vite_log = logs / "vite.log"

    argv = [
        str(layout.grazel_bin),
        "--mode",
        "both",
        "--data",
        str(data),
        "--http",
        str(ports.http),
        "--node-port",
        str(ports.node),
        "--gyld-supplier-bin",
        str(layout.gyld_supplier_bin),
        "--gyld-root",
        str(layout.gyld_root),
        "--gyld-decisions-root",
        str(layout.decisions_root),
    ]
    if not mode.runs_vite:
        argv += ["--ui", str(layout.dist_gyld)]

    print("grazel: {}".format(" ".join(argv)))
    print("  log: {}".format(grazel_log))
    # The supplier is spawned by grazel with a fixed argument list, so this
    # environment is one of its only two configuration channels. It is carried
    # explicitly and SAID — by name for a key, by value for the rest.
    spawn_environment = grazel_env(dict(os.environ))
    print("  {}".format(agent_env_line(agent_env(spawn_environment))))
    # Everything already in the log belongs to an earlier start of this same
    # instance: grazel appends. Only what follows this offset is this run.
    log_offset = log_size(grazel_log)
    # cwd is the grazel checkout: its --app default (apps/grazel-app.glade) and
    # its --node-bin default are both relative to it.
    grazel_pid = spawn_detached(argv, layout.grazel_dir, grazel_log, spawn_environment)
    print("  pid {}".format(grazel_pid))

    state = InstanceState(
        mode=mode.name,
        ui_port=ports.ui,
        http_port=ports.http,
        node_port=ports.node,
        grazel_pid=grazel_pid,
        vite_pid=None,
        data=str(data),
        gyld_root=str(layout.gyld_root),
        decisions_root=str(layout.decisions_root),
        glade_wz=str(layout.glade_wz),
        gryth_ui=str(layout.gryth_ui),
        python=str(layout.python),
        grazel_log=str(grazel_log),
        vite_log=str(vite_log),
        started_at=now_stamp(),
        url=mode.url(ports),
    )
    write_state(data, state)

    missing = wait_for_grazel(grazel_log, log_offset, ports.node, grazel_pid)
    if missing:
        print("grazel did not come up. Missing: {}".format(", ".join(missing)))
        print("--- {} (tail) ---".format(grazel_log))
        print(tail_of(grazel_log))
        return 1
    print("grazel: up — all six readiness lines")

    # The supplier owns the bundle root: it publishes the build it found at
    # attach, or lays the stage and makes the first one itself. Either way the
    # page is not worth opening until the census has reached the shares.
    print("bundle root: waiting for the supplier to publish a build")
    published = wait_for_publication(grazel_log, log_offset, grazel_pid)
    if published is None:
        if not pid_alive(grazel_pid):
            print("grazel exited before a build was published")
        else:
            print(
                "no build was published within {:.0f} minutes".format(
                    FIRST_BUILD_TIMEOUT / 60.0
                )
            )
        print("--- {} (tail) ---".format(grazel_log))
        print(tail_of(grazel_log))
        return 1
    print(
        "bundle root: published {} ({} streams)".format(
            published.build, published.streams
        )
    )

    if mode.runs_vite:
        env = dict(os.environ)
        env["GRAZEL_URL"] = "http://127.0.0.1:{}".format(ports.http)
        # No `--` before the flags: pnpm forwards them, but vite's own CLI reads
        # a literal `--` as end-of-options and then never sees `--port`, so a
        # second instance would quietly take 5173 (found live, on 5180).
        vite_argv = ["pnpm", "run", "dev:gyld", "--port", str(ports.ui), "--strictPort"]
        print("vite: {} (GRAZEL_URL={})".format(" ".join(vite_argv), env["GRAZEL_URL"]))
        print("  log: {}".format(vite_log))
        vite_pid = spawn_detached(vite_argv, layout.gryth_ui, vite_log, env)
        print("  pid {}".format(vite_pid))
        state.vite_pid = vite_pid
        write_state(data, state)
        if not wait_for_port(ports.ui, VITE_READY_TIMEOUT, vite_pid):
            print("vite did not listen on :{}".format(ports.ui))
            print("--- {} (tail) ---".format(vite_log))
            print(tail_of(vite_log))
            return 1
        print("vite: listening on :{}".format(ports.ui))

    print("checks")
    return report_instance(state, status_checks(state)).exit_code


# --------------------------------------------------------------------------
# Stopping
# --------------------------------------------------------------------------


def signal_group(pid: int, sig: int) -> bool:
    try:
        os.killpg(os.getpgid(pid), sig)
        return True
    except OSError:
        pass
    try:
        os.kill(pid, sig)
        return True
    except OSError:
        return False


def stop_instance(data: Path, purge: bool) -> bool:
    """SIGTERM both groups, wait, SIGKILL what is left, then prove it is gone."""
    state = read_state(data)
    if state is None:
        if purge and data.is_dir():
            shutil.rmtree(str(data), ignore_errors=True)
            print("instance {}: already stopped — purged".format(data.name))
        else:
            print(
                "instance {}: already stopped, data kept at {}".format(data.name, data)
            )
        return True

    print("instance :{} — stopping".format(state.ui_port))
    targets = []
    if pid_is(state.grazel_pid, "grazel"):
        targets.append(("grazel", state.grazel_pid))
    if pid_is(state.vite_pid, "vite") or pid_is(state.vite_pid, "pnpm"):
        targets.append(("vite", state.vite_pid))

    for label, pid in targets:
        # The whole group: grazel's node and both suppliers are its children,
        # and pnpm's vite is pnpm's child.
        sent = signal_group(pid, signal.SIGTERM)
        print(
            "  SIGTERM {} pid {} group {}".format(
                label, pid, "sent" if sent else "failed"
            )
        )

    deadline = time.time() + STOP_GRACE_SECONDS
    while time.time() < deadline:
        if not any(pid_alive(pid) for _, pid in targets):
            break
        time.sleep(0.3)

    for label, pid in targets:
        if pid_alive(pid):
            signal_group(pid, signal.SIGKILL)
            print("  SIGKILL {} pid {} group".format(label, pid))

    lock = read_lock_state(instance_lock_path(data), pid_alive)
    if lock.should_remove:
        try:
            instance_lock_path(data).unlink()
            print("  removed the lock the node left behind")
        except OSError as error:
            print("  could not remove {}: {}".format(lock.path, error))

    try:
        state_path(data).unlink()
        print("  removed {}".format(state_path(data)))
    except OSError:
        pass

    left = _run(["pgrep", "-f", str(data)]).stdout.split()
    ports_left = [
        port
        for port in (state.ui_port, state.http_port, state.node_port)
        if port_listeners(port)
    ]
    if left or ports_left:
        print(
            "  STILL RUNNING: pids {} ports {}".format(
                " ".join(left) or "none", ports_left
            )
        )
        return False
    print(
        "  clear: no process holds {} and no port of this instance listens".format(data)
    )

    if purge:
        shutil.rmtree(str(data), ignore_errors=True)
        print("  purged {}".format(data))
    else:
        print("  kept {} (pass --purge to delete it)".format(data))
    return True


def stop_command(args: argparse.Namespace) -> int:
    found = recorded_instances(args.port)
    if not found:
        where = (
            "no instance recorded on :{}".format(args.port)
            if args.port is not None
            else "no instance recorded under {}".format(instances_root())
        )
        print(where)
        if args.port is not None and args.purge:
            data = default_data_dir(args.port)
            if data.is_dir():
                shutil.rmtree(str(data), ignore_errors=True)
                print("purged {}".format(data))
        return 0
    ok = True
    for data in found:
        ok = stop_instance(data, args.purge) and ok
    return 0 if ok else 1


# --------------------------------------------------------------------------
# Status and restart
# --------------------------------------------------------------------------


def status_command(args: argparse.Namespace) -> int:
    found = recorded_instances(args.port)
    reports = []
    for data in found:
        state = read_state(data)
        if state is None:
            continue
        reports.append((state, status_checks(state)))

    if args.json:
        body = {
            "instances": [
                dict(
                    state.to_dict(),
                    checks=[check.to_dict() for check in checks],
                    working=Verdict(checks).working,
                )
                for state, checks in reports
            ],
            "working": bool(reports) and all(Verdict(c).working for _, c in reports),
        }
        print(json.dumps(body, indent=2, sort_keys=True))
        return 0 if body["working"] else 1

    if not reports:
        where = (
            ":{}".format(args.port) if args.port is not None else str(instances_root())
        )
        print("no instance recorded at {}".format(where))
        print("not working")
        return 1

    worst = 0
    for index, (state, checks) in enumerate(reports):
        if index:
            print("")
        worst = max(worst, report_instance(state, checks).exit_code)
    return worst


def restart_command(args: argparse.Namespace) -> int:
    """Stop, then start again with what was recorded — unless this invocation
    overrode it."""
    found = recorded_instances(args.port)
    remembered = []
    for data in found:
        state = read_state(data)
        if state is not None:
            remembered.append(state)

    for data in found:
        stop_instance(data, purge=False)

    if not remembered:
        print("nothing was running; starting fresh")
        return start_command(args)

    worst = 0
    for state in remembered:
        again = argparse.Namespace(**vars(args))
        again.port = args.port if args.port is not None else state.ui_port
        again.mode = args.mode if args.mode_given else state.mode
        again.http = args.http if args.http is not None else state.http_port
        again.node_port = (
            args.node_port if args.node_port is not None else state.node_port
        )
        again.data = args.data if args.data is not None else state.data
        again.gyld_root = (
            args.gyld_root if args.gyld_root is not None else state.gyld_root
        )
        again.decisions_root = (
            args.decisions_root
            if args.decisions_root is not None
            # An older state file carries none, and then the default stands.
            else (state.decisions_root or None)
        )
        again.glade_wz = args.glade_wz if args.glade_wz is not None else state.glade_wz
        again.gryth_ui = args.gryth_ui if args.gryth_ui is not None else state.gryth_ui
        print("")
        worst = max(worst, start_command(again))
    return worst


# --------------------------------------------------------------------------
# The command line
# --------------------------------------------------------------------------


def add_common(parser: argparse.ArgumentParser, with_port_default: bool) -> None:
    hint = (
        " (default {})".format(DEFAULT_UI_PORT)
        if with_port_default
        else " (default: every recorded instance)"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="the port you open in the browser" + hint,
    )
    parser.add_argument(
        "--mode",
        choices=RunMode.names(),
        default=DEV.name,
        help="dev: pnpm dev:gyld in front of grazel. built: dist-gyld served by "
        "grazel, one origin, and --port IS grazel's http port (default: dev)",
    )
    parser.add_argument(
        "--http",
        type=int,
        default=None,
        help="grazel's HTTP port (default: derived from --port; 5173 -> 8080)",
    )
    parser.add_argument(
        "--node-port",
        type=int,
        default=None,
        help="the glade node's WS port (default: derived from --http; 8080 -> 9099)",
    )
    parser.add_argument(
        "--data",
        default=None,
        help="the instance data directory — builds and scratch live here; "
        "rulings go to --decisions-root (default: ~/.gyld-ui/instances/<port>)",
    )
    parser.add_argument("--gyld-root", default=None, help="the READ-ONLY Gyld checkout")
    parser.add_argument(
        "--decisions-root",
        default=None,
        help="the git-tracked folder the desk leaves a ruling in; nothing here "
        "ever runs git (default: <glade-wz>/decisions)",
    )
    parser.add_argument("--glade-wz", default=None, help="the glade workzone")
    parser.add_argument("--gryth-ui", default=None, help="this repository")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="gyld-ui.py",
        description=(
            "Start, check and stop the Gyld UI composition: grazel with the "
            "glade-gyld supplier behind it and the Gyld-only desktop in front. "
            "The supplier lays the bundle root and makes its first build "
            "itself (run boot-1); start waits for it to publish one."
        ),
        epilog=(
            "Instances live under ~/.gyld-ui/instances/<port>/ and survive a "
            "reboot; stop --purge is what deletes one.\n"
            "The Gyld hosts the supplier runs need Python 3.13 at {}, which is "
            "glade-gyld's own default: grazel passes it no other, so there is "
            "no option to name one and start checks that path instead.".format(
                SUPPLIER_PYTHON
            )
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    subs = parser.add_subparsers(dest="verb", metavar="{start,stop,restart,status}")

    start = subs.add_parser(
        "start", help="start an instance (idempotent), then check it"
    )
    add_common(start, with_port_default=True)
    start.add_argument(
        "--build",
        action="store_true",
        help="built mode: force pnpm build:gyld even when dist-gyld/index.html is there",
    )
    start.set_defaults(handler=start_command)

    stop = subs.add_parser("stop", help="stop an instance, or every one of them")
    add_common(stop, with_port_default=False)
    stop.add_argument(
        "--purge",
        action="store_true",
        help="also delete the data directory (rulings included)",
    )
    stop.set_defaults(handler=stop_command)

    restart = subs.add_parser(
        "restart", help="stop, then start with the recorded options"
    )
    add_common(restart, with_port_default=False)
    restart.add_argument("--build", action="store_true", help="see start --build")
    restart.set_defaults(handler=restart_command)

    status = subs.add_parser(
        "status", help="check a running system and report whether it works"
    )
    add_common(status, with_port_default=False)
    status.add_argument("--json", action="store_true", help="machine-readable report")
    status.set_defaults(handler=status_command)
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_parser()
    raw = list(sys.argv[1:] if argv is None else argv)
    args = parser.parse_args(raw)
    if getattr(args, "handler", None) is None:
        parser.print_help()
        return 2
    # `restart` keeps the recorded mode unless this invocation named one, and
    # argparse cannot tell a default from an explicit `--mode dev`.
    args.mode_given = "--mode" in raw
    try:
        return args.handler(args)
    except KeyboardInterrupt:
        print("\ninterrupted", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())

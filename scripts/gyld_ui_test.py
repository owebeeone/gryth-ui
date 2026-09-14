#!/usr/bin/env python3
"""Unit tests for the pure parts of `gyld-ui.py`.

Run them with `pnpm test:py`, or directly:

    python3 scripts/gyld_ui_test.py

They exercise only what can be decided without a running composition — port
derivation, the state file, the stale-lock decision, readiness detection over
log text, the supplier's first-build and publication lines, `/bootstrap.json`
parsing and the status verdict — so the suite needs no grazel, no node and no
Python 3.13. It runs on the system `python3` (3.10) exactly as the script does.
"""

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

# The script's name is not an importable module name (a hyphen), and it lives
# beside package.json rather than in this directory, so it is loaded by path.
SCRIPT = Path(__file__).resolve().parents[1] / "gyld-ui.py"


def _load_script():
    # Loading by path would leave a __pycache__ beside the script; the script
    # itself never writes one (it is only ever run as __main__), so the suite
    # must not either.
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location("gyld_ui", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load {}".format(SCRIPT))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


gu = _load_script()


class PortDerivationTest(unittest.TestCase):
    """Two instances must never collide, and the runbook's 5173 must keep the
    ports the runbook prints."""

    def test_the_default_port_keeps_the_runbook_ports(self):
        ports = gu.derive_ports(5173, gu.DEV)
        self.assertEqual((ports.ui, ports.http, ports.node), (5173, 8080, 9099))

    def test_a_second_ui_port_derives_its_own_pair(self):
        ports = gu.derive_ports(5180, gu.DEV)
        self.assertEqual((ports.ui, ports.http, ports.node), (5180, 8087, 9106))

    def test_distinct_ui_ports_never_share_a_derived_port(self):
        http_seen = set()
        node_seen = set()
        for ui_port in range(5100, 5300):
            ports = gu.derive_ports(ui_port, gu.DEV)
            self.assertNotIn(ports.http, http_seen)
            self.assertNotIn(ports.node, node_seen)
            http_seen.add(ports.http)
            node_seen.add(ports.node)

    def test_built_mode_opens_grazels_own_http_port(self):
        ports = gu.derive_ports(8090, gu.BUILT)
        self.assertEqual((ports.ui, ports.http, ports.node), (8090, 8090, 9109))

    def test_built_mode_refuses_a_port_that_contradicts_http(self):
        with self.assertRaises(ValueError):
            gu.derive_ports(8090, gu.BUILT, http=9000)

    def test_explicit_ports_win_over_the_derivation(self):
        ports = gu.derive_ports(5173, gu.DEV, http=18080, node=19099)
        self.assertEqual((ports.ui, ports.http, ports.node), (5173, 18080, 19099))

    def test_a_derived_port_stays_in_the_usable_range(self):
        for ui_port in (1024, 5173, 40000, 65535):
            ports = gu.derive_ports(ui_port, gu.DEV)
            for port in (ports.http, ports.node):
                self.assertGreaterEqual(port, 1024)
                self.assertLessEqual(port, 65535)

    def test_the_data_directory_is_per_port_and_outlives_a_reboot(self):
        data = gu.default_data_dir(5180)
        self.assertEqual(data.name, "5180")
        self.assertEqual(data.parent, Path.home() / ".gyld-ui" / "instances")
        self.assertNotIn("tmp", str(data).split(os.sep))


class RunModeTest(unittest.TestCase):
    def test_the_two_modes_are_named_and_resolvable(self):
        self.assertIs(gu.RunMode.named("dev"), gu.DEV)
        self.assertIs(gu.RunMode.named("built"), gu.BUILT)
        self.assertIsNone(gu.RunMode.named("nope"))

    def test_each_mode_names_the_url_you_open(self):
        dev_ports = gu.derive_ports(5173, gu.DEV)
        self.assertEqual(gu.DEV.url(dev_ports), "http://localhost:5173/")
        built_ports = gu.derive_ports(8090, gu.BUILT)
        self.assertEqual(gu.BUILT.url(built_ports), "http://127.0.0.1:8090/")

    def test_only_dev_runs_a_vite_server(self):
        self.assertTrue(gu.DEV.runs_vite)
        self.assertFalse(gu.BUILT.runs_vite)


class StateFileTest(unittest.TestCase):
    def _state(self):
        return gu.InstanceState(
            mode="dev",
            ui_port=5173,
            http_port=8080,
            node_port=9099,
            grazel_pid=4242,
            vite_pid=4243,
            data="/home/x/.gyld-ui/instances/5173",
            gyld_root="/w/gyld-wz/gyld",
            glade_wz="/w/glade-wz",
            gryth_ui="/w/gryth-wz/gryth-ui",
            python="/opt/homebrew/bin/python3.13",
            grazel_log="/home/x/.gyld-ui/instances/5173/logs/grazel.log",
            vite_log="/home/x/.gyld-ui/instances/5173/logs/vite.log",
            started_at="2026-09-14T00:00:00Z",
            url="http://localhost:5173/",
        )

    def test_a_state_round_trips_through_the_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            written = self._state()
            gu.write_state(data, written)
            read_back = gu.read_state(data)
            self.assertEqual(read_back, written)
            self.assertEqual((data / gu.STATE_FILENAME).exists(), True)

    def test_an_absent_state_reads_as_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertIsNone(gu.read_state(Path(tmp)))

    def test_a_corrupt_state_reads_as_nothing_rather_than_raising(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            (data / gu.STATE_FILENAME).write_text("{not json", encoding="utf-8")
            self.assertIsNone(gu.read_state(data))

    def test_an_unknown_field_is_ignored_so_an_older_file_still_loads(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            body = self._state().to_dict()
            body["invented_later"] = 7
            (data / gu.STATE_FILENAME).write_text(json.dumps(body), encoding="utf-8")
            self.assertEqual(gu.read_state(data), self._state())

    def test_a_state_missing_a_field_reads_as_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            body = self._state().to_dict()
            del body["node_port"]
            (data / gu.STATE_FILENAME).write_text(json.dumps(body), encoding="utf-8")
            self.assertIsNone(gu.read_state(data))

    def test_the_state_records_the_mode_as_a_mode(self):
        self.assertIs(self._state().run_mode(), gu.DEV)


class LockStateTest(unittest.TestCase):
    """Today's failure: `instance already locked` from a node that had exited.
    The pid in the file decides, and the liveness test is injected."""

    def _lock(self, tmp, text=None):
        lock = Path(tmp) / "instance.lock"
        if text is not None:
            lock.write_text(text, encoding="utf-8")
        return lock

    def test_no_lock_blocks_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = gu.read_lock_state(self._lock(tmp), lambda pid: True)
            self.assertFalse(state.present)
            self.assertFalse(state.blocks_start)
            self.assertFalse(state.should_remove)

    def test_a_dead_pid_makes_the_lock_stale_and_removable(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = gu.read_lock_state(self._lock(tmp, "4242"), lambda pid: False)
            self.assertTrue(state.present)
            self.assertEqual(state.pid, 4242)
            self.assertTrue(state.should_remove)
            self.assertFalse(state.blocks_start)
            self.assertIn("4242", state.describe())
            self.assertIn("stale", state.describe())

    def test_a_live_pid_is_a_running_node_and_blocks_the_start(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = gu.read_lock_state(self._lock(tmp, "4242"), lambda pid: True)
            self.assertTrue(state.blocks_start)
            self.assertFalse(state.should_remove)
            self.assertIn("running", state.describe())

    def test_the_pid_is_read_with_no_trailing_newline_written(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = gu.read_lock_state(self._lock(tmp, " 91 \n"), lambda pid: False)
            self.assertEqual(state.pid, 91)

    def test_an_unreadable_pid_is_stale_rather_than_a_blocker(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = gu.read_lock_state(self._lock(tmp, "rubbish"), lambda pid: True)
            self.assertIsNone(state.pid)
            self.assertTrue(state.should_remove)
            self.assertFalse(state.blocks_start)

    def test_the_lock_sits_where_the_node_puts_it_under_grazels_data(self):
        path = gu.instance_lock_path(Path("/d"), "grazel")
        self.assertEqual(path, Path("/d/sys/sys/grazel/instance.lock"))


class ReadinessTest(unittest.TestCase):
    """The runbook's six lines, read out of grazel's log."""

    SIX = "\n".join(
        [
            "[grazel] mode=both node-profile=local GLADE_HOME=/d/sys",
            "[node] app grazel registered (+11 record(s), 0 unchanged)",
            "[node] app gyld registered (+8 record(s), 1 unchanged)",
            "[node] workspace ws-razel serving",
            "[node] listening 9099",
            "[grazel] node listening on ws://127.0.0.1:9099",
            "[gyld] glade-gyld: attaching to ws://127.0.0.1:9099 as ws-razel/gyld.ops",
            "[gwz] glade-gwz: serving; SIGTERM/SIGINT to stop",
            "[gyld] glade-gyld: serving; SIGTERM/SIGINT to stop",
        ]
    )

    def test_all_six_lines_are_detected(self):
        self.assertEqual(gu.missing_readiness(self.SIX, 9099), [])

    def test_an_empty_log_is_missing_all_six(self):
        self.assertEqual(len(gu.missing_readiness("", 9099)), 6)

    def test_the_gyld_leg_alone_is_not_ready(self):
        partial = "\n".join(self.SIX.splitlines()[:6])
        missing = gu.missing_readiness(partial, 9099)
        self.assertEqual(len(missing), 2)
        self.assertTrue(any("attaching" in label for label in missing))
        self.assertTrue(any("serving" in label for label in missing))

    def test_the_listening_line_must_name_this_instances_node_port(self):
        missing = gu.missing_readiness(self.SIX, 9106)
        self.assertEqual(missing, ["node listening on 9106"])

    def test_the_gwz_leg_is_not_mistaken_for_the_gyld_one(self):
        without_gyld = self.SIX.replace(
            "[gyld] glade-gyld: serving; SIGTERM/SIGINT to stop", ""
        )
        self.assertEqual(
            gu.missing_readiness(without_gyld, 9099), ["glade-gyld serving"]
        )

    def test_a_partial_line_prefix_does_not_count(self):
        self.assertEqual(len(gu.missing_readiness("[node] listening 90", 9099)), 6)


class BootstrapTest(unittest.TestCase):
    def test_a_grazel_body_parses_and_names_the_node_port(self):
        boot = gu.parse_bootstrap(
            '{"node_ws":"ws://127.0.0.1:9106","mode":"both","name":"grazel"}'
        )
        self.assertEqual(boot.node_ws, "ws://127.0.0.1:9106")
        self.assertEqual(boot.mode, "both")
        self.assertEqual(boot.name, "grazel")
        self.assertEqual(boot.node_port, 9106)

    def test_the_node_ws_is_authoritative_over_a_derived_port(self):
        boot = gu.parse_bootstrap('{"node_ws":"ws://127.0.0.1:41000"}')
        self.assertEqual(boot.node_port, 41000)
        self.assertEqual(boot.mode, "")

    def test_a_body_with_no_node_ws_names_no_port(self):
        boot = gu.parse_bootstrap('{"mode":"both"}')
        self.assertIsNone(boot.node_port)

    def test_junk_is_refused_as_data_rather_than_crashing(self):
        for body in ("", "not json", "[]", '"a string"'):
            with self.assertRaises(ValueError):
                gu.parse_bootstrap(body)


class FirstBuildTest(unittest.TestCase):
    """The supplier lays and builds the bundle root itself now (glade-gyld
    `supplier.rs`), so what the script has to read out of grazel's log is
    whether that first build is still in flight."""

    FRESH = "\n".join(
        [
            "[node] listening 9099",
            "[gyld] glade-gyld: attaching to ws://127.0.0.1:9099 as ws-razel/gyld.ops",
            "[gyld] glade-gyld: first build of /d/files/gyld — the bundle root "
            "holds none (run boot-1)",
            "[gwz] glade-gwz: serving; SIGTERM/SIGINT to stop",
            "[gyld] glade-gyld: serving; SIGTERM/SIGINT to stop",
            "[gyld] glade-gyld: the checkout declares fork-a, stream-a, stream-b",
        ]
    )
    PUBLISHED = "[gyld] glade-gyld: published builds/build-1789363954989 (5 streams)"

    def test_a_fresh_root_names_the_run_its_first_build_took(self):
        self.assertEqual(gu.first_build_run(self.FRESH), "boot-1")

    def test_a_publication_ends_the_first_build(self):
        landed = self.FRESH + "\n" + self.PUBLISHED
        self.assertIsNone(gu.first_build_run(landed))

    def test_a_root_that_already_holds_a_build_makes_no_first_build(self):
        attached = "\n".join(
            [
                "[gyld] glade-gyld: serving; SIGTERM/SIGINT to stop",
                self.PUBLISHED,
            ]
        )
        self.assertIsNone(gu.first_build_run(attached))

    def test_an_empty_log_is_not_a_first_build_in_flight(self):
        self.assertIsNone(gu.first_build_run(""))

    def test_the_six_readiness_lines_are_still_all_there_on_a_fresh_root(self):
        ready = "\n".join(
            [
                "[node] app grazel registered (+11 record(s), 0 unchanged)",
                "[node] app gyld registered (+8 record(s), 1 unchanged)",
                "[node] workspace ws-razel serving",
                self.FRESH,
            ]
        )
        self.assertEqual(gu.missing_readiness(ready, 9099), [])


class PublicationTest(unittest.TestCase):
    """`published <build> (<n> streams)` is the supplier saying the census
    reached the value shares — which is what a desk waits for."""

    def test_a_publication_names_the_build_and_counts_its_streams(self):
        found = gu.latest_publication(
            "[gyld] glade-gyld: published builds/build-1789363954989 (5 streams)"
        )
        self.assertIsNotNone(found)
        self.assertEqual(found.build, "builds/build-1789363954989")
        self.assertEqual(found.streams, 5)

    def test_one_stream_reads_as_well_as_many(self):
        found = gu.latest_publication(
            "[gyld] glade-gyld: published builds/build-1 (1 stream)"
        )
        self.assertEqual(found.streams, 1)

    def test_the_latest_publication_wins_when_a_log_carries_several(self):
        text = "\n".join(
            [
                "[gyld] glade-gyld: published builds/build-1 (5 streams)",
                "[gyld] glade-gyld: published builds/build-2 (6 streams)",
            ]
        )
        self.assertEqual(gu.latest_publication(text).build, "builds/build-2")

    def test_a_log_with_no_publication_names_none(self):
        self.assertIsNone(gu.latest_publication("[gyld] glade-gyld: serving"))

    def test_a_sibling_suppliers_line_is_not_a_gyld_publication(self):
        self.assertIsNone(
            gu.latest_publication(
                "[gwz] glade-gwz: published builds/build-1 (5 streams)"
            )
        )

    def test_a_not_published_note_is_not_a_publication(self):
        self.assertIsNone(
            gu.latest_publication("[gyld] glade-gyld: not published: too large")
        )

    def test_the_publication_of_one_named_build_is_found_among_others(self):
        text = "\n".join(
            [
                "[gyld] glade-gyld: published builds/build-1 (5 streams)",
                "[gyld] glade-gyld: published builds/build-2 (6 streams)",
            ]
        )
        found = gu.publication_of(text, "builds/build-1")
        self.assertEqual(found.streams, 5)
        self.assertIsNone(gu.publication_of(text, "builds/build-3"))

    def test_a_build_is_named_the_way_the_suppliers_log_names_it(self):
        bundle = Path("/d/files/gyld")
        self.assertEqual(
            gu.build_name(bundle, bundle / "builds" / "build-7"), "builds/build-7"
        )

    def test_a_build_outside_the_bundle_root_keeps_its_absolute_path(self):
        self.assertEqual(
            gu.build_name(Path("/d/files/gyld"), Path("/elsewhere/build-7")),
            "/elsewhere/build-7",
        )


class LogSliceTest(unittest.TestCase):
    """grazel appends to one log per instance, so a restart's readiness and
    publication lines would otherwise be read off the previous run's."""

    def test_only_what_was_written_after_the_offset_is_read(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "grazel.log"
            log.write_text("old run\n", encoding="utf-8")
            offset = gu.log_size(log)
            with open(str(log), "a", encoding="utf-8") as handle:
                handle.write("new run\n")
            self.assertEqual(gu.log_since(log, offset), "new run\n")
            self.assertEqual(gu.log_since(log, 0), "old run\nnew run\n")

    def test_a_log_that_is_not_there_yet_has_no_size_and_reads_as_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "not-yet.log"
            self.assertEqual(gu.log_size(log), 0)
            self.assertEqual(gu.log_since(log, 0), "")

    def test_a_multibyte_line_survives_the_slice(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "grazel.log"
            log.write_text("first build of /d — none\n", encoding="utf-8")
            self.assertIn("—", gu.log_since(log, 0))


class VerdictTest(unittest.TestCase):
    def test_every_check_ok_is_working(self):
        checks = [gu.CheckResult("a", True, "fine"), gu.CheckResult("b", True, "fine")]
        verdict = gu.Verdict(checks)
        self.assertTrue(verdict.working)
        self.assertEqual(verdict.exit_code, 0)
        self.assertEqual(verdict.line(), "working")

    def test_one_failure_is_not_working(self):
        checks = [gu.CheckResult("a", True, "fine"), gu.CheckResult("b", False, "no")]
        verdict = gu.Verdict(checks)
        self.assertFalse(verdict.working)
        self.assertEqual(verdict.exit_code, 1)
        self.assertEqual(verdict.line(), "not working")
        self.assertEqual([c.label for c in verdict.failures()], ["b"])

    def test_no_checks_at_all_is_not_working(self):
        verdict = gu.Verdict([])
        self.assertFalse(verdict.working)
        self.assertEqual(verdict.exit_code, 1)

    def test_a_check_prints_its_verdict_first_and_its_reason_after(self):
        self.assertEqual(
            gu.CheckResult("grazel /bootstrap.json", True, "node_ws 9099").line(),
            "  ok    grazel /bootstrap.json — node_ws 9099",
        )
        self.assertEqual(
            gu.CheckResult("node port", False, "refused").line(),
            "  FAIL  node port — refused",
        )


class StreamCountTest(unittest.TestCase):
    def test_a_seeded_bundle_root_reports_its_build_and_its_stream_count(self):
        with tempfile.TemporaryDirectory() as tmp:
            bundle = Path(tmp)
            build = bundle / "builds" / "build-seed"
            build.mkdir(parents=True)
            streams = {"streams": [{"id": "base"}, {"id": "stream-a"}]}
            (build / "streams.json").write_text(json.dumps(streams), encoding="utf-8")
            (bundle / "latest.json").write_text(
                '{"output_dir":"builds/build-seed"}\n', encoding="utf-8"
            )
            found = gu.latest_build(bundle)
            self.assertEqual(found, build)
            self.assertEqual(gu.count_streams(found), 2)

    def test_an_unseeded_bundle_root_names_no_build(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertIsNone(gu.latest_build(Path(tmp)))

    def test_a_pointer_at_a_missing_build_falls_back_to_the_newest_real_one(self):
        with tempfile.TemporaryDirectory() as tmp:
            bundle = Path(tmp)
            real = bundle / "builds" / "build-0000000000002"
            real.mkdir(parents=True)
            (real / "streams.json").write_text('{"streams":[]}', encoding="utf-8")
            (bundle / "latest.json").write_text(
                '{"output_dir":"builds/build-gone"}\n', encoding="utf-8"
            )
            self.assertEqual(gu.latest_build(bundle), real)
            self.assertEqual(gu.count_streams(real), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2, argv=[sys.argv[0]] + sys.argv[1:])

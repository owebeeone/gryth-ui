import { BaseTap } from '@owebeeone/grip-react';
import { GRAPH_ENGINE, GRAPH_NODES } from './grips';
import type { DepEdge, GraphRenderNode, RepoInfo } from './types';

// Force-directed graph simulation kept entirely outside React — ported from
// grip-lab (src/lab/graphEngine.ts) and turned into a CLASS so every viewer
// window owns an independent sim. The view component is pure: it reads
// GRAPH_NODES (published by GraphSimTap into the viewer's tab context) and
// calls engine methods from event handlers. No useState/useEffect/useRef.

export const VBW = 1080;
export const VBH = 680;
const SPRING_LEN = 285;
const SPRING_K = 0.03;
const PADDING = 72;
const GRAVITY = 0.009;
const FRICTION = 0.84;
const REPULSION = 5200;
const SETTLE = 0.18;

interface PNode {
  id: string; repo: RepoInfo; color: string;
  x: number; y: number; vx: number; vy: number;
  width: number; height: number;
  baseW: number; baseH: number; expW: number; expH: number;
}

function statusColor(r: RepoInfo): string {
  if (r.dirty) return '#e3b341';
  if (r.behind > 0) return '#f85149';
  if (r.ahead > 0) return '#8ab4ff';
  return '#3fb950';
}

export class GraphEngine {
  private nodes: PNode[] = [];
  private links: DepEdge[] = [];
  private inputKey = '';
  private hover: string | null = null;
  private dragId: string | null = null;
  private pinned: string | null = null;
  private dragOffX = 0;
  private dragOffY = 0;
  private publishFn: ((n: GraphRenderNode[]) => void) | null = null;
  private raf = 0;
  private running = false;

  setInput(repos: RepoInfo[], edges: DepEdge[], scope = '') {
    const repoPart = repos.map((r) => `${r.path}:${r.head}:${r.dirty}:${r.ahead}:${r.behind}`).join('|');
    const edgePart = edges.map((e) => `${e.source}->${e.target}`).join('|');
    const key = `${scope}::${repoPart}::${edgePart}`;
    if (key !== this.inputKey) {
      this.inputKey = key;
      this.build(repos, edges);
      this.publishFn?.(this.snapshot());
      this.wake();
    }
  }

  current() { return this.snapshot(); }

  attach(fn: (n: GraphRenderNode[]) => void) {
    this.publishFn = fn;
    fn(this.snapshot());
    this.wake();
  }

  detach() {
    this.publishFn = null;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.running = false;
  }

  setHover(id: string | null) { if (this.hover !== id) { this.hover = id; this.wake(); } }
  pin(id: string | null) { if (this.pinned !== id) { this.pinned = id; this.wake(); } }

  startDrag(id: string, p: { x: number; y: number }) {
    this.dragId = id;
    const n = this.nodes.find((x) => x.id === id);
    if (n) { this.dragOffX = p.x - n.x; this.dragOffY = p.y - n.y; }
    this.wake();
  }

  moveDrag(p: { x: number; y: number }) {
    if (!this.dragId) return;
    const n = this.nodes.find((x) => x.id === this.dragId);
    if (n) { n.x = p.x - this.dragOffX; n.y = p.y - this.dragOffY; n.vx = 0; n.vy = 0; }
    this.wake();
  }

  endDrag() { if (this.dragId) { this.dragId = null; this.wake(); } }

  scatter() {
    this.nodes.forEach((n) => { n.vx = (Math.random() - 0.5) * 22; n.vy = (Math.random() - 0.5) * 22; });
    this.wake();
  }

  private build(repos: RepoInfo[], edges: DepEdge[]) {
    this.nodes = repos.map((r, i) => {
      const a = (i / Math.max(1, repos.length)) * Math.PI * 2;
      const radiusX = Math.min(390, Math.max(210, repos.length * 24));
      const radiusY = Math.min(250, Math.max(150, repos.length * 16));
      return {
        id: r.path || 'root', repo: r, color: statusColor(r),
        x: r.path === '' ? VBW / 2 : VBW / 2 + Math.cos(a) * radiusX,
        y: r.path === '' ? VBH / 2 : VBH / 2 + Math.sin(a) * radiusY,
        vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3,
        width: 170, height: 66, baseW: 170, baseH: 66, expW: 280, expH: 186,
      };
    });
    this.links = edges.map((e) => ({ source: e.source || 'root', target: e.target || 'root' }));
  }

  private isExpanded(id: string) {
    return this.pinned === id || this.hover === id || this.dragId === id;
  }

  private snapshot(): GraphRenderNode[] {
    return this.nodes.map((n) => ({
      id: n.id, repoPath: n.repo.path, name: n.repo.name, branch: n.repo.branch,
      head: n.repo.head, ahead: n.repo.ahead, behind: n.repo.behind, dirty: n.repo.dirty,
      color: n.color, x: n.x, y: n.y, w: n.width, h: n.height,
      expanded: this.isExpanded(n.id), changedFiles: n.repo.changedFiles,
    }));
  }

  private wake() {
    if (!this.running && this.publishFn) {
      this.running = true;
      this.raf = requestAnimationFrame(() => this.step());
    }
  }

  private step() {
    const { nodes, links, dragId } = this;
    if (!nodes.length) { this.publishFn?.([]); this.running = false; return; }
    let activity = 0;

    nodes.forEach((n) => {
      const exp = this.isExpanded(n.id);
      const tw = exp ? n.expW : n.baseW;
      const th = exp ? n.expH : n.baseH;
      n.width += (tw - n.width) * 0.16;
      n.height += (th - n.height) * 0.16;
      activity += Math.abs(tw - n.width) + Math.abs(th - n.height);
    });

    links.forEach((l) => {
      const s = nodes.find((n) => n.id === l.source);
      const t = nodes.find((n) => n.id === l.target);
      if (!s || !t) return;
      const dx = t.x - s.x; const dy = t.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
      const f = (dist - SPRING_LEN) * SPRING_K;
      const fx = (dx / dist) * f; const fy = (dy / dist) * f;
      if (s.id !== dragId) { s.vx += fx; s.vy += fy; }
      if (t.id !== dragId) { t.vx -= fx; t.vy -= fy; }
    });

    nodes.forEach((n) => {
      if (n.id === dragId) return;
      n.vx += (VBW / 2 - n.x) * GRAVITY;
      n.vy += (VBH / 2 - n.y) * GRAVITY;
    });

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]; const b = nodes[j];
        const dxRepel = b.x - a.x; const dyRepel = b.y - a.y;
        const distSq = Math.max(2400, dxRepel * dxRepel + dyRepel * dyRepel);
        const dist = Math.sqrt(distSq);
        const force = REPULSION / distSq;
        const fx = (dxRepel / dist) * force;
        const fy = (dyRepel / dist) * force;
        if (a.id !== dragId) { a.vx -= fx; a.vy -= fy; }
        if (b.id !== dragId) { b.vx += fx; b.vy += fy; }
        const minW = (a.width + b.width) / 2 + PADDING;
        const minH = (a.height + b.height) / 2 + PADDING;
        const dx = b.x - a.x; const dy = b.y - a.y;
        const ox = minW - Math.abs(dx); const oy = minH - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          if (ox < oy) {
            const push = (dx > 0 ? 1 : -1) * ox * 0.5;
            if (a.id !== dragId) { a.x -= push; a.vx -= push * 0.4; }
            if (b.id !== dragId) { b.x += push; b.vx += push * 0.4; }
          } else {
            const push = (dy > 0 ? 1 : -1) * oy * 0.5;
            if (a.id !== dragId) { a.y -= push; a.vy -= push * 0.4; }
            if (b.id !== dragId) { b.y += push; b.vy += push * 0.4; }
          }
        }
      }
    }

    nodes.forEach((n) => {
      if (n.id !== dragId) {
        n.x += n.vx; n.y += n.vy;
        activity += Math.abs(n.vx) + Math.abs(n.vy);
        n.vx *= FRICTION; n.vy *= FRICTION;
      }
      const px = n.width / 2 + 10; const py = n.height / 2 + 10;
      if (n.x < px) { n.x = px; n.vx *= -0.2; }
      if (n.x > VBW - px) { n.x = VBW - px; n.vx *= -0.2; }
      if (n.y < py) { n.y = py; n.vy *= -0.2; }
      if (n.y > VBH - py) { n.y = VBH - py; n.vy *= -0.2; }
    });

    this.publishFn?.(this.snapshot());

    if (activity < SETTLE && !dragId) {
      nodes.forEach((n) => {
        const exp = this.isExpanded(n.id);
        n.width = exp ? n.expW : n.baseW;
        n.height = exp ? n.expH : n.baseH;
        n.vx = 0; n.vy = 0;
      });
      this.publishFn?.(this.snapshot());
      this.running = false;
      return;
    }
    this.raf = requestAnimationFrame(() => this.step());
  }
}

// Per-viewer sim tap, seeded by ToolDef.tabTaps into the viewer's
// chrome-held tab context — the desktop document owns its lifetime. It
// provides the node snapshots AND the engine itself (gesture surface).
// The RAF loop runs only while a consumer is connected (the
// tap-owning-a-loop pattern): attach on first connect, detach on last.
export class GraphSimTap extends BaseTap {
  readonly graph = new GraphEngine();

  constructor() {
    super({ provides: [GRAPH_NODES, GRAPH_ENGINE] });
  }

  private publishNodes = (n: GraphRenderNode[]) => {
    this.publish(new Map([[GRAPH_NODES as never, n as never]]));
  };

  onConnect(dest: unknown, grip: unknown): void {
    super.onConnect(dest as never, grip as never);
    this.graph.attach(this.publishNodes);
  }

  onDisconnect(dest: unknown, grip: unknown): void {
    super.onDisconnect(dest as never, grip as never);
    const has = (this.producer?.getDestinations().size ?? 0) > 0;
    if (!has) this.graph.detach();
  }

  produce(opts?: { destContext?: unknown }): void {
    this.publish(
      new Map([
        [GRAPH_NODES as never, this.graph.current() as never],
        [GRAPH_ENGINE as never, this.graph as never],
      ]),
      opts?.destContext as never,
    );
  }
  produceOnParams(): void {}
  produceOnDestParams(): void {}
}

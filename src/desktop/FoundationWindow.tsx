import type { MouseEvent } from 'react';
import { useGrip } from '@owebeeone/grip-react';
import {
  DESKTOP_WINDOWS,
  WINDOW_DRAG, WINDOW_DRAG_TAP, AREA_MENU_TAP,
  type LayoutNode, type WindowRecord,
} from '../grips.desktop';
import { areaOccupants, areaRects, type Rect } from './ops';

// A foundation is pure scaffolding: no chrome at all — just dockable holes
// and splitters spanning the whole canvas. Occupant frames render separately
// as normal windows (in the frames layer above). The unlock chip on the
// desktop closes it; the sidebar does not list it.

interface SplitterSpec {
  interiorId: string;
  index: number;
  axis: 'row' | 'column';
  rect: Rect;     // hit band, canvas coords
  spanPx: number; // combined pixel span of the boundary's two children
  baseA: number;
  baseB: number;
}

function collectSplitters(node: LayoutNode, rect: Rect, out: SplitterSpec[] = []): SplitterSpec[] {
  if (!node.children || node.children.length === 0) return out;
  const total = node.children.reduce((acc, c) => acc + c.size, 0) || 1;
  let offset = 0;
  const childRects: Rect[] = node.children.map((c) => {
    const frac = c.size / total;
    const r = node.direction === 'column'
      ? { x: rect.x, y: rect.y + rect.h * offset, w: rect.w, h: rect.h * frac }
      : { x: rect.x + rect.w * offset, y: rect.y, w: rect.w * frac, h: rect.h };
    offset += frac;
    return r;
  });
  node.children.forEach((c, i) => collectSplitters(c, childRects[i], out));
  for (let i = 0; i < node.children.length - 1; i++) {
    const a = childRects[i];
    const b = childRects[i + 1];
    out.push(node.direction === 'column'
      ? {
        interiorId: node.id, index: i, axis: 'column',
        rect: { x: rect.x, y: a.y + a.h - 3, w: rect.w, h: 6 },
        spanPx: a.h + b.h, baseA: node.children[i].size, baseB: node.children[i + 1].size,
      }
      : {
        interiorId: node.id, index: i, axis: 'row',
        rect: { x: a.x + a.w - 3, y: rect.y, w: 6, h: rect.h },
        spanPx: a.w + b.w, baseA: node.children[i].size, baseB: node.children[i + 1].size,
      });
  }
  return out;
}

function canvasOrigin(e: MouseEvent): { left: number; top: number; zoom: number } {
  const el = (e.currentTarget as HTMLElement).closest('.desktop-canvas') as HTMLElement;
  const rect = el.getBoundingClientRect();
  return { left: rect.left, top: rect.top, zoom: el.offsetWidth ? rect.width / el.offsetWidth : 1 };
}

export default function FoundationWindow({ win, rect }: {
  win: WindowRecord;
  rect: Rect;
}) {
  const windows = useGrip(DESKTOP_WINDOWS) ?? [];
  const drag = useGrip(WINDOW_DRAG) ?? null;
  const dragTap = useGrip(WINDOW_DRAG_TAP);
  const areaMenuTap = useGrip(AREA_MENU_TAP);
  const def = win.foundation!;
  const rects = areaRects(def.layout, rect);
  const splitters = collectSplitters(def.layout, rect);

  const startSplitter = (e: MouseEvent, s: SplitterSpec) => {
    if (e.button !== 0) return;
    const origin = canvasOrigin(e);
    dragTap?.set({
      kind: 'splitter', id: win.id,
      interiorId: s.interiorId, index: s.index, axis: s.axis,
      baseA: s.baseA, baseB: s.baseB, spanPx: s.spanPx,
      pointerX: e.clientX, pointerY: e.clientY,
      canvasLeft: origin.left, canvasTop: origin.top, zoom: origin.zoom,
      dropTarget: null, dropDesktop: null, dropArea: null, dropSplit: null,
    });
    e.preventDefault();
    e.stopPropagation();
  };

  const openAreaMenu = (e: MouseEvent, areaId: string, hole: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    const origin = canvasOrigin(e);
    areaMenuTap?.set({
      foundationId: win.id, areaId, hole,
      x: (e.clientX - origin.left) / origin.zoom,
      y: (e.clientY - origin.top) / origin.zoom,
    });
  };

  return (
    <section
      className="gwin foundation"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      {[...rects.entries()].map(([areaId, r]) => {
        const hole = areaOccupants(windows, win.id, areaId).length === 0;
        const highlight = !!drag && drag.kind !== 'splitter'
          && drag.dropArea?.foundation === win.id && drag.dropArea.area === areaId;
        return (
          <div
            key={areaId}
            className={`area${hole ? ' hole' : ''}${highlight ? ' drop' : ''}`}
            style={{ left: r.x - rect.x, top: r.y - rect.y, width: r.w, height: r.h }}
            onContextMenu={(e) => openAreaMenu(e, areaId, hole)}
          >
            {hole && <span className="area-label">{areaId}</span>}
          </div>
        );
      })}
      {splitters.map((s) => (
        <div
          key={`${s.interiorId}:${s.index}`}
          className={`splitter ${s.axis}`}
          style={{ left: s.rect.x - rect.x, top: s.rect.y - rect.y, width: s.rect.w, height: s.rect.h }}
          onMouseDown={(e) => startSplitter(e, s)}
        />
      ))}
    </section>
  );
}

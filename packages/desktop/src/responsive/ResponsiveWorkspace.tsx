import { useGrip } from '@owebeeone/grip-react';
import { allTools, grok, GRYTH_READ_ONLY, PLUGIN_REGISTRY } from '@grythjs/plugin-api';
import { DESKTOP_WINDOWS, type LayoutNode, type TabRecord } from '../grips.desktop';
import { areaRects, type Rect } from '../ops';
import { resolveTool } from '../facets';
import { tabContextFor, wireTabSource, unwireTab } from '../tabContexts';
import { ToolBody } from '../ToolBody';
import { PanelPlacement } from './model';
import { RESPONSIVE_ACTIONS, RESPONSIVE_LAYOUT } from './runtime';
import './responsive.css';

function ViewBody({ tab }: { tab: TabRecord }) {
  const windows = useGrip(DESKTOP_WINDOWS) ?? [];
  const defs = allTools(useGrip(PLUGIN_REGISTRY));
  const def = resolveTool(defs, tab.facet);
  const context = tabContextFor(grok, tab.id, def, tab.params);
  const source = windows.flatMap(w => w.tabs).find(t => t.id === tab.source);
  if (source) {
    wireTabSource(tab.id, source.id, tabContextFor(grok, source.id, resolveTool(defs, source.facet), source.params));
  } else { unwireTab(tab.id); }
  return <ToolBody grok={grok} context={context} def={def} tabId={tab.id} params={tab.params} />;
}
interface Splitter { id: string; index: number; axis: 'row' | 'column'; a: number; b: number; span: number; rect: Rect }
function splitters(node: LayoutNode, rect: Rect): Splitter[] {
  if (!node.children || !node.direction) { return []; }
  const total = node.children.reduce((n, c) => n + c.size, 0);
  const out: Splitter[] = [];
  let offset = 0;
  node.children.forEach((child, index) => {
    const row = node.direction === 'row';
    const fraction = child.size / total;
    const r = row ? { x: rect.x + rect.w * offset, y: rect.y, w: rect.w * fraction, h: rect.h }
      : { x: rect.x, y: rect.y + rect.h * offset, w: rect.w, h: rect.h * fraction };
    out.push(...splitters(child, r));
    offset += fraction;
    const next = node.children![index + 1];
    if (next) {
      out.push({ id: node.id, index, axis: node.direction!, a: child.size, b: next.size,
        span: (row ? rect.w : rect.h) * (child.size + next.size) / total,
        rect: row ? { x: r.x + r.w - 5, y: r.y + 40, w: 10, h: Math.max(0, r.h - 40) }
          : { x: r.x, y: r.y + r.h - 5, w: r.w, h: 10 } });
    }
  });
  return out;
}
export default function ResponsiveWorkspace() {
  const state = useGrip(RESPONSIVE_LAYOUT);
  const actions = useGrip(RESPONSIVE_ACTIONS);
  const windows = useGrip(DESKTOP_WINDOWS) ?? [];
  const readOnly = useGrip(GRYTH_READ_ONLY) ?? false;
  const defs = allTools(useGrip(PLUGIN_REGISTRY));
  if (!state || !actions) { return null; }
  const tabs = windows.filter(w => !w.foundation).flatMap(w => w.tabs.map(tab => ({ tab, frame: w.id }))).sort((a, b) => a.tab.id.localeCompare(b.tab.id));
  const label = (id: string): string => {
    const tab = tabs.find(t => t.tab.id === id)?.tab;
    if (!tab) { return 'View'; }
    const peers = tabs.filter(t => t.tab.facet === tab.facet);
    return resolveTool(defs, tab.facet).label + (peers.length > 1 ? ` ${peers.findIndex(t => t.tab.id === id) + 1}` : '');
  };
  const { arrangement, rects } = state;
  const visible = new Map<string, { group: string; rect: Rect }>();
  for (const [group, rect] of rects) {
    const selected = arrangement.selected[group];
    if (selected) { visible.set(selected, { group, rect }); }
  }
  const extent = areaRects(arrangement.tree, { x: 0, y: 0, w: 1, h: 1 });
  const width = Math.max(0, ...[...rects.values()].map(r => r.x + r.w));
  const height = Math.max(0, ...[...rects.values()].map(r => r.y + r.h));
  return <div className="responsive-workspace" data-layout-variant={state.variant.id}
    onPointerMove={e => actions.pointerMove(e)} onPointerUp={e => actions.pointerUp(e)}
    onKeyDown={e => { if (e.key === 'Escape') { actions.cancelDrag(); actions.showMenu(); } }}>
    {[...rects].map(([group, rect]) => {
      const ids = arrangement.groups[group];
      const selected = arrangement.selected[group];
      const maxTabs = Math.max(1, Math.floor((rect.w - 140) / 110));
      const shown = ids.slice(0, maxTabs);
      if (selected && !shown.includes(selected)) { shown[shown.length - 1] = selected; }
      return <section key={group} className={`responsive-group${ids.includes(state.focused ?? '') ? ' focused' : ''}`}
        aria-label={`${label(selected)} view group`} style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
        <header className="responsive-header">
          <button className="responsive-handle" disabled={readOnly || !selected} aria-label={`Move ${label(selected)}`} title="Drag to move or split"
            onPointerDown={e => {
              if (e.button !== 0) { return; }
              e.preventDefault();
              actions.startDrag(selected, e, e.currentTarget, e.currentTarget.closest<HTMLElement>('.responsive-workspace')!);
            }}>⠿</button>
          <div role="tablist" aria-label="Views" className="responsive-tabs" onKeyDown={e => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) || !ids.length) { return; }
            e.preventDefault();
            const index = ids.indexOf(selected);
            const next = e.key === 'Home' ? ids[0] : e.key === 'End' ? ids[ids.length - 1] : ids[(index + (e.key === 'ArrowLeft' ? -1 : 1) + ids.length) % ids.length];
            actions.select(next);
            queueMicrotask(() => document.getElementById(`responsive-tab-${next}`)?.focus());
          }}>
            {shown.map(id => <button key={id} id={`responsive-tab-${id}`} role="tab" aria-selected={id === selected}
              aria-controls={`responsive-body-${id}`} tabIndex={id === selected ? 0 : -1}
              title={label(id)} onClick={() => actions.select(id)}>{label(id)}</button>)}
          </div>
          {ids.length > shown.length && <select aria-label="More views" title="More views" value="" onChange={e => actions.select(e.currentTarget.value)}>
            <option value="" disabled>⋯</option>{ids.map(id => <option key={id} value={id}>{label(id)}</option>)}
          </select>}
          <button disabled={!selected} aria-label={`${label(selected)} panel actions`} title="Move, split or reset layout" onClick={() => actions.showMenu(state.menu === selected ? undefined : selected)}>⋮</button>
          <button disabled={readOnly || !selected} aria-label={`Close ${label(selected)}`} title="Close view" onClick={() => actions.close(selected)}>×</button>
        </header>
        {!ids.length && <div className="responsive-empty">Drop a view here</div>}
      </section>;
    })}
    {/* Flat, sorted canonical identities: no reparenting on profile/group changes.
        Hidden views stay mounted, retaining input buffers, selection and scroll. */}
    {tabs.map(({ tab, frame }) => {
      const placement = visible.get(tab.id);
      const r = placement?.rect;
      return <div key={tab.id} id={`responsive-body-${tab.id}`} role="tabpanel"
        aria-labelledby={placement ? `responsive-tab-${tab.id}` : undefined} aria-label={label(tab.id)}
        className="responsive-body gwin-body" hidden={!placement} inert={!placement}
        data-gryth-tab={tab.id} data-gryth-tool={tab.facet} data-gryth-window={frame}
        onFocusCapture={() => actions.select(tab.id)} onPointerDownCapture={() => actions.select(tab.id)}
        style={r ? { left: r.x + 3, top: r.y + 40, width: Math.max(0, r.w - 6), height: Math.max(0, r.h - 43) } : undefined}>
        <ViewBody tab={tab} />
      </div>;
    })}
    {!readOnly && extent.size > 1 && splitters(arrangement.tree, { x: 0, y: 0, w: width, h: height }).map(s => <div
      key={`${s.id}:${s.index}`} role="separator" tabIndex={0} aria-label="Resize panels" aria-orientation={s.axis === 'row' ? 'vertical' : 'horizontal'}
      aria-valuenow={Math.round(s.a / (s.a + s.b) * 100)} className={`responsive-splitter ${s.axis}`}
      style={{ left: s.rect.x, top: s.rect.y, width: s.rect.w, height: s.rect.h }}
      onKeyDown={e => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { return; }
        e.preventDefault(); const delta = (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) * (s.a + s.b) * 0.05;
        const total = s.a + s.b;
        const minimum = s.axis === 'row' ? state.family.minimumPaneWidth ?? 180 : state.family.minimumPaneHeight ?? 140;
        const low = Math.min(0.5, minimum / s.span) * total;
        const a = Math.max(low, Math.min(total - low, s.a + delta));
        actions.resize(s.id, s.index, a, total - a);
      }} onPointerDown={e => {
        if (e.button !== 0) { return; }
        e.preventDefault();
        const canvas = e.currentTarget.closest<HTMLElement>('.responsive-workspace')!;
        actions.startResize(e, e.currentTarget, s.id, s.index, s.axis, s.a, s.b, s.span, canvas.getBoundingClientRect().width / canvas.offsetWidth);
      }} />)}
    {state.preview && <div className="responsive-drop-preview" style={{ left: state.preview.x, top: state.preview.y, width: state.preview.w, height: state.preview.h }} aria-label="Panel drop preview" />}
    {state.menu && <div className="responsive-menu" role="dialog" aria-label={`Move or split ${label(state.menu)}`}>
      <strong>{label(state.menu)}</strong><button aria-label="Close panel actions" onClick={() => actions.showMenu()}>×</button>
      {[...rects].map(([group, rect], i) => <fieldset key={group}><legend>{label(arrangement.selected[group])} · group {i + 1}</legend>
        {PanelPlacement.all.map((p, index) => <button key={index} disabled={readOnly || !p.fits(rect, state.family)
          || (arrangement.groups[group].includes(state.menu!) && (p === PanelPlacement.merge || arrangement.groups[group].length < 2))
          || !actions.canEditGroup(group)}
          onClick={() => actions.move(state.menu!, group, p)}>{p.label}</button>)}
      </fieldset>)}
      <button disabled={readOnly} onClick={() => { actions.reset(); actions.showMenu(); }}>Reset this layout</button>
    </div>}
  </div>;
}

import { BaseTap, type Grip, type GripContext, type Grok } from '@owebeeone/grip-react';
import { defineGrip, PLUGIN_REGISTRY, GRYTH_READ_ONLY, allTools } from '@grythjs/plugin-api';
import { CANVAS_SIZE, DESKTOP_CURRENT, DESKTOP_FOCUSED, DESKTOP_WINDOWS, type WindowRecord, type FoundationDef } from '../grips.desktop';
import { areaRects, closeTab, setSplitSizes, type Rect } from '../ops';
import { toolRoles } from '../facets';
import { PanelDrag, SplitDrag, type PanelPointer } from './interaction';
import { cancelPointerInteractions } from '../pointerInteraction';
import { chooseVariant, fittedArrangement, initialArrangement, readArrangement, reconcile, selectView, viewsOn,
  LayoutVariant, PanelPlacement, type Arrangement, type LayoutFamily, type ViewRecord } from './model';

export const RESPONSIVE_LAYOUT = defineGrip<ResponsiveSnapshot | null>('Desktop.Responsive.Layout', null);
export const RESPONSIVE_ACTIONS = defineGrip<ResponsiveController | null>('Desktop.Responsive.Actions', null);
export interface ResponsiveSnapshot {
  variant: LayoutVariant;
  arrangement: Arrangement;
  rects: Map<string, Rect>;
  views: ViewRecord[];
  focused?: string;
  family: LayoutFamily;
  menu?: string;
  preview?: Rect;
}
interface Ports {
  windows: { get(): WindowRecord[]; update(fn: (w: WindowRecord[]) => WindowRecord[]): void };
  focus: { set(id: string | null): void };
}
/** One instance-local controller per composition. Only canonical close uses desk ports. */
export class ResponsiveController extends BaseTap {
  private profiles: Record<string, Arrangement> = {};
  private variant?: LayoutVariant;
  private key = '';
  private focused?: string;
  private requestedView?: string;
  private externalFocus = '';
  private lastSize = '';
  private snapshot: ResponsiveSnapshot | null = null;
  private menu?: string;
  private preview?: Rect;
  private drag?: PanelDrag | SplitDrag;
  private resizePreview?: Arrangement;
  private readOnly = false;
  private roles: Partial<Record<string, string>> = {};
  private views: ViewRecord[] = [];
  private storageKey: string;
  constructor(readonly family: LayoutFamily, entry: string, private ports: Ports, private oldPreset?: FoundationDef) {
    super({ provides: [RESPONSIVE_LAYOUT, RESPONSIVE_ACTIONS], homeParamGrips: [CANVAS_SIZE, DESKTOP_CURRENT, DESKTOP_FOCUSED, DESKTOP_WINDOWS, PLUGIN_REGISTRY, GRYTH_READ_ONLY] });
    this.storageKey = `gryth.responsive.v1:${encodeURIComponent(entry)}:${encodeURIComponent(family.id)}`;
    try {
      const data = JSON.parse(globalThis.localStorage?.getItem(this.storageKey) ?? 'null');
      if (data?.version === 1 && data.profiles && typeof data.profiles === 'object') {
        for (const [key, value] of Object.entries(data.profiles).slice(0, 200)) {
          const a = readArrangement(value);
          if (a) { this.profiles[key] = a; }
        }
      }
    } catch { /* Optional storage never prevents the desk opening. */ }
  }
  private value<T>(grip: Grip<T>): T | undefined { return this.paramDrips.get(grip as Grip<unknown>)?.get() as T | undefined; }
  produce(opts?: { destContext?: GripContext }): void {
    const size = this.value(CANVAS_SIZE) ?? { w: 0, h: 0 };
    const windows = this.value(DESKTOP_WINDOWS);
    if (!windows) { return; }
    this.readOnly = this.value(GRYTH_READ_ONLY) ?? false;
    const desktop = this.value(DESKTOP_CURRENT) ?? 1;
    const nextVariant = chooseVariant(this.family, size.w, size.h, this.variant);
    const key = `${desktop}:${nextVariant.id}`;
    const dimensions = `${size.w}:${size.h}:${desktop}`;
    const resized = this.lastSize && dimensions !== this.lastSize;
    this.lastSize = dimensions;
    if (resized) {
      cancelPointerInteractions(); this.preview = undefined; this.menu = undefined;
    }

    const defs = allTools(this.value(PLUGIN_REGISTRY));
    this.roles = toolRoles(defs);
    this.views = viewsOn(windows, desktop);
    // Reconcile every previously visited profile, including inactive desktops,
    // before persisting. A closed/moved tab can never be recreated from it.
    let changed = false;
    for (const [profileKey, saved] of Object.entries(this.profiles)) {
      const divider = profileKey.indexOf(':');
      const owner = Number(profileKey.slice(0, divider));
      const variant = this.family.variants.find(v => v.id === profileKey.slice(divider + 1));
      if (!variant) { continue; }
      const clean = reconcile(saved, variant, viewsOn(windows, owner), this.roles);
      if (JSON.stringify(clean) !== JSON.stringify(saved)) { this.profiles[profileKey] = clean; changed = true; }
    }
    let a = this.profiles[key];
    if (!a) {
      a = initialArrangement(nextVariant, this.views, this.roles);
      // Preserve pre-existing user topology in the widest profile. The app's
      // unchanged default preset is replaced by its declared responsive default.
      const widest = [...this.family.variants].sort((x, y) => y.minimumWidth - x.minimumWidth)[0];
      const foundation = windows.find(w => w.desktop === desktop && w.foundation);
      if (nextVariant === widest && foundation?.foundation && this.oldPreset
        && JSON.stringify(foundation.foundation.layout) !== JSON.stringify(this.oldPreset.layout)) {
        const groups: Record<string, string[]> = {};
        for (const w of windows) {
          if (w.dock?.foundation === foundation.id) { (groups[w.dock.area] ??= []).push(...w.tabs.map(t => t.id)); }
        }
        a = reconcile({ tree: foundation.foundation.layout, groups, selected: {} }, nextVariant, this.views, this.roles);
      }
      changed = true;
    }
    const frame = windows.find(w => w.id === this.value(DESKTOP_FOCUSED));
    const external = frame ? `${frame.id}:${frame.activeTab}` : '';
    if (external !== this.externalFocus && this.views.some(v => v.id === frame?.activeTab)) {
      this.focused = frame?.activeTab; a = selectView(a, this.focused!);
    }
    this.externalFocus = external;
    if (this.requestedView && this.views.some(v => v.id === this.requestedView)) {
      this.focused = this.requestedView; a = selectView(a, this.requestedView);
      this.requestedView = undefined; changed = true;
    }
    if (!this.views.some(v => v.id === this.focused)) { this.focused = undefined; }
    if (key !== this.key && this.focused) { a = selectView(a, this.focused); }
    this.variant = nextVariant; this.key = key; this.profiles[key] = a;
    const fitted = fittedArrangement(this.resizePreview ?? a, size.w, size.h, this.family, this.focused);
    this.snapshot = { variant: nextVariant, arrangement: fitted,
      rects: areaRects(fitted.tree, { x: 0, y: 0, w: size.w, h: size.h }), views: this.views,
      focused: this.focused, family: this.family, menu: this.menu, preview: this.preview };
    if (changed) { this.save(); }
    this.publish(new Map<Grip<unknown>, unknown>([[RESPONSIVE_LAYOUT, this.snapshot], [RESPONSIVE_ACTIONS, this]]), opts?.destContext);
  }
  produceOnParams(): void { this.produce(); }
  produceOnDestParams(): void {}
  private save(): void {
    try { globalThis.localStorage?.setItem(this.storageKey, JSON.stringify({ version: 1, profiles: this.profiles })); }
    catch { /* Keep the live arrangement when browser storage is unavailable. */ }
  }
  canEditGroup(group: string): boolean { return !!this.profiles[this.key]?.groups[group]; }
  /** Explicit application reveal, including views whose canonical frame is already active. */
  reveal(id: string): void {
    this.requestedView = id; this.produce();
  }
  select(id: string): void {
    const view = this.views.find(v => v.id === id);
    if (!view || !this.profiles[this.key]) { return; }
    if (this.focused === id && Object.values(this.profiles[this.key].selected).includes(id)) { return; }
    this.focused = id;
    this.profiles[this.key] = selectView(this.profiles[this.key], id);
    const frame = this.ports.windows.get().find(w => w.id === view.frameId);
    this.externalFocus = frame ? `${frame.id}:${frame.activeTab}` : '';
    this.ports.focus.set(view.frameId);
    this.save(); this.produce();
  }
  showMenu(id?: string): void { this.menu = id; this.produce(); }
  showPreview(rect?: Rect): void { this.preview = rect; this.produce(); }
  move(id: string, target: string, placement: PanelPlacement): void {
    const r = this.snapshot?.rects.get(target);
    const a = this.profiles[this.key];
    if (this.readOnly || !r || !a || !a.groups[target] || !placement.fits(r, this.family)) { return; }
    this.profiles[this.key] = placement.apply(a, id, target);
    this.menu = undefined; this.preview = undefined;
    this.focused = id; this.save(); this.produce();
  }
  resize(interior: string, index: number, a: number, b: number): void {
    if (this.readOnly || !this.profiles[this.key]) { return; }
    this.resizePreview = undefined;
    const old = this.profiles[this.key];
    this.profiles[this.key] = { ...old, tree: setSplitSizes(old.tree, interior, index, a, b, 0.1, 0.1) };
    this.save(); this.produce();
  }
  startDrag(id: string, e: PanelPointer, element: Element, canvas: HTMLElement): void {
    if (this.readOnly) { return; }
    this.cancelDrag(); this.select(id);
    this.drag = new PanelDrag(this, id, e, element, canvas);
  }
  startResize(e: PanelPointer, element: Element, interior: string, index: number, axis: 'row' | 'column', a: number, b: number, span: number, zoom: number): void {
    if (this.readOnly) { return; }
    this.cancelDrag();
    this.drag = new SplitDrag(this, e, element, interior, index, axis, a, b, span,
      axis === 'row' ? this.family.minimumPaneWidth ?? 180 : this.family.minimumPaneHeight ?? 140, zoom);
  }
  pointerMove(e: PanelPointer): void { if (this.snapshot) { this.drag?.move(e, this.snapshot); } }
  pointerUp(e: PanelPointer): void { this.drag?.end(e); }
  cancelDrag(): void {
    const drag = this.drag; this.drag = undefined;
    drag?.cancel(); this.preview = undefined; this.resizePreview = undefined;
    if (drag) { this.produce(); }
  }
  previewResize(interior: string, index: number, a: number, b: number): void {
    const old = this.profiles[this.key];
    if (!old) { return; }
    this.resizePreview = { ...old, tree: setSplitSizes(old.tree, interior, index, a, b, 0.1, 0.1) };
    this.produce();
  }
  close(id: string): void {
    if (this.readOnly) { return; }
    this.menu = undefined;
    this.ports.windows.update(w => {
      const frame = w.find(f => f.tabs.some(t => t.id === id));
      return frame ? closeTab(w, frame.id, id) : w;
    });
  }
  reset(all = false): void {
    if (this.readOnly) { return; }
    if (all) { this.profiles = {}; }
    if (this.variant) { this.profiles[this.key] = initialArrangement(this.variant, this.views, this.roles); }
    this.save(); this.produce();
  }
}
let configured = false;
export function responsiveConfigured(): boolean { return configured; }
export function registerResponsive(grok: Grok, family: LayoutFamily | undefined, entry: string, ports: Ports, preset?: FoundationDef): ResponsiveController | undefined {
  configured = !!family;
  if (!family) { return undefined; }
  const controller = new ResponsiveController(family, entry, ports, preset);
  grok.registerTap(controller);
  return controller;
}

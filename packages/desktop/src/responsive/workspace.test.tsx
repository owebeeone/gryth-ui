// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { GripInput, GripProvider, createAtomValueTap, type AtomTapHandle, type Grip } from '@owebeeone/grip-react';
import { addEntry, defineGrip, grok, GRYTH_READ_ONLY, PluginRegistryTap, type GrythPlugin } from '@grythjs/plugin-api';
import { expect, it, vi } from 'vitest';
import { registerDesktopTaps, CanvasSizeTap, DesktopWindowsTap } from '../taps.desktop';
import { LayoutVariant, PanelPlacement } from './model';
import { RESPONSIVE_ACTIONS, RESPONSIVE_LAYOUT } from './runtime';
import ResponsiveWorkspace from './ResponsiveWorkspace';
const VALUE = defineGrip<number>('ResponsiveFixture.Value', 12);
const HANDLE = defineGrip<AtomTapHandle<number>>('ResponsiveFixture.Value.Handle');
function Editor() {
  return <GripInput aria-label="Fixture number" grip={VALUE} tapGrip={HANDLE} update="blur" parse={s => Number(s)} format={v => String(v ?? '')} />;
}
const fixture = defineGrip<GrythPlugin>('ResponsiveFixture.Plugin');
grok.registerTap(PluginRegistryTap);
grok.registerTap(createAtomValueTap(GRYTH_READ_ONLY, { initial: false }));
addEntry(fixture, { tools: {
  editor: { label: 'Editor', defaultSize: { w: 400, h: 300 }, windowComponent: Editor,
    tabTaps: () => [createAtomValueTap(VALUE, { initial: 12, handleGrip: HANDLE })] },
  help: { label: 'Help', defaultSize: { w: 300, h: 300 }, windowComponent: () => <p>Other host fixture</p> },
} });
function read<T>(grip: Grip<T>): T | undefined {
  const consumer = grok.mainPresentationContext.getOrCreateConsumer(grip);
  consumer.subscribe(() => {}); grok.flush(); return consumer.get();
}
const one = new LayoutVariant('phone', 0, { layout: { id: 'main', size: 1 }, designate: {}, fallback: 'main' });
const two = new LayoutVariant('tablet', 700, { layout: { id: 'root', size: 1, direction: 'row', children: [{ id: 'main', size: 1 }, { id: 'side', size: 1 }] }, designate: { help: 'side' }, fallback: 'main' });
it('preserves a mounted GripInput, draft and caret across layouts and custom splits without rewriting canonical records', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  registerDesktopTaps(grok, { entry: 'responsive-fixture', tools: [{ toolId: 'editor' }, { toolId: 'help' }], responsive: { id: 'fixture', variants: [one, two] } });
  CanvasSizeTap.set({ w: 1200, h: 800 });
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => { root.render(<GripProvider grok={grok}><ResponsiveWorkspace /></GripProvider>); grok.flush(); });
    await act(async () => { CanvasSizeTap.set({ w: 280, h: 800 }); grok.flush(); });
    const more = container.querySelector<HTMLButtonElement>('button[aria-label="More views"]')!;
    expect(more).not.toBeNull();
    await act(async () => { more.click(); grok.flush(); });
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('select[aria-label="More views"]')).toBeNull();
    const choices = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
    expect(choices.map(c => c.textContent?.replace('✓', ''))).toEqual(['Editor', 'Help']);
    const selectedChoice = choices.findIndex(c => c.getAttribute('aria-checked') === 'true');
    expect(document.activeElement).toBe(choices[selectedChoice]);
    choices[selectedChoice].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const nextChoice = choices[(selectedChoice + 1) % choices.length];
    expect(document.activeElement).toBe(nextChoice);
    const nextLabel = nextChoice.textContent;
    await act(async () => { nextChoice.click(); grok.flush(); });
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(nextLabel);
    await act(async () => { more.click(); grok.flush(); });
    await act(async () => { document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); grok.flush(); });
    expect(document.activeElement).toBe(more);
    expect(container.querySelector('[role="menu"]')).toBeNull();
    await act(async () => { CanvasSizeTap.set({ w: 1200, h: 800 }); grok.flush(); });
    const input = container.querySelector<HTMLInputElement>('[aria-label="Fixture number"]')!;
    expect(input).not.toBeNull();
    await act(async () => {
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '12.');
      input.setSelectionRange(1, 1);
      input.dispatchEvent(new Event('input', { bubbles: true })); grok.flush();
    });
    const canonical = JSON.stringify(DesktopWindowsTap.get());
    for (const w of [390, 844, 1200, 390, 1200]) {
      await act(async () => { CanvasSizeTap.set({ w, h: 800 }); grok.flush(); });
      expect(container.querySelector('[aria-label="Fixture number"]')).toBe(input);
      expect(input.value).toBe('12.');
      expect(input.selectionStart).toBe(1);
      expect(document.activeElement).toBe(input);
      expect(input.closest<HTMLElement>('[role="tabpanel"]')!.hidden).toBe(false);
      expect(JSON.stringify(DesktopWindowsTap.get())).toBe(canonical);
    }
    const controller = read(RESPONSIVE_ACTIONS)!;
    const help = DesktopWindowsTap.get().flatMap(w => w.tabs).find(t => t.facet === 'help')!;
    await act(async () => { CanvasSizeTap.set({ w: 390, h: 800 }); grok.flush(); });
    await act(async () => { controller.reveal(help.id); grok.flush(); });
    expect(read(RESPONSIVE_LAYOUT)!.arrangement.selected.main).toBe(help.id);
    await act(async () => { CanvasSizeTap.set({ w: 1200, h: 800 }); grok.flush(); });
    const editor = DesktopWindowsTap.get().flatMap(w => w.tabs).find(t => t.facet === 'editor')!;
    await act(async () => { controller.move(editor.id, 'side', PanelPlacement.below); grok.flush(); });
    const custom = read(RESPONSIVE_LAYOUT)!.arrangement.tree;
    const saved = JSON.parse(localStorage.getItem('gryth.responsive.v1:responsive-fixture:fixture')!);
    expect(saved.profiles['1:tablet'].tree).toEqual(custom);
    expect(read(RESPONSIVE_LAYOUT)!.rects.size).toBe(2);
    await act(async () => { CanvasSizeTap.set({ w: 390, h: 800 }); grok.flush(); });
    await act(async () => { CanvasSizeTap.set({ w: 1200, h: 800 }); grok.flush(); });
    expect(read(RESPONSIVE_LAYOUT)!.arrangement.tree).toEqual(custom);
    expect(container.querySelector('[aria-label="Fixture number"]')).toBe(input);
    expect(input.value).toBe('12.');
    expect(JSON.stringify(DesktopWindowsTap.get())).toBe(canonical);
    await act(async () => { controller.reset(); grok.flush(); });
    expect(read(RESPONSIVE_LAYOUT)!.arrangement.tree).toEqual(two.foundation.layout);
    expect(JSON.stringify(DesktopWindowsTap.get())).toBe(canonical);
    await act(async () => { controller.close(editor.id); grok.flush(); });
    expect(container.querySelector('[aria-label="Fixture number"]')).toBeNull();
    await act(async () => { CanvasSizeTap.set({ w: 390, h: 800 }); grok.flush(); });
    expect(Object.values(read(RESPONSIVE_LAYOUT)!.arrangement.groups).flat()).not.toContain(editor.id);
  } finally {
    await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
  }
});

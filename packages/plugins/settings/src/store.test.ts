import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreEngine } from '@owebeeone/glial-runtime';

// The appearance instance's store as the loader opens it (Glial appearance
// plan, Step 3.1). Each case is a fresh page: a fresh load of the module, and
// of the glial it reaches.

type Glial = typeof import('@owebeeone/glial-runtime');
type Page = typeof import('./store') & { readonly Memory: Glial['MemoryStoreEngine'] };

async function freshPage(): Promise<Page> {
  vi.resetModules();
  const glial = await import('@owebeeone/glial-runtime');
  return { ...(await import('./store')), Memory: glial.MemoryStoreEngine };
}

/** A clock the case fires by hand: how long the wait it holds is, if any. */
function manualClock() {
  let wait: { readonly fn: () => void; readonly ms: number } | undefined;
  return {
    schedule: (fn: () => void, ms: number) => {
      wait = { fn, ms };
      return () => {
        wait = undefined;
      };
    },
    held: () => wait?.ms,
    fire: () => wait?.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the appearance store', () => {
  it('is memory on a page whose loader opened none, the same one each time', async () => {
    const page = await freshPage();
    const store = page.appearanceStore();
    expect(store).toBeInstanceOf(page.Memory);
    expect(page.appearanceStore()).toBe(store);
  });

  it('is the site\'s database once it opens, and nothing waits on after', async () => {
    const page = await freshPage();
    const clock = manualClock();
    const site = new page.Memory();
    expect(await page.establishAppearanceStore({ open: () => Promise.resolve(site), schedule: clock.schedule }))
      .toBe(site);
    expect(page.appearanceStore()).toBe(site);
    expect(clock.held()).toBeUndefined();
  });

  it('is memory when the database has not opened within 1 s, and stays so when it does', async () => {
    const page = await freshPage();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const clock = manualClock();
    let late: (engine: StoreEngine) => void = () => {};
    const opening = page.establishAppearanceStore({
      open: () => new Promise((resolve) => {
        late = resolve;
      }),
      schedule: clock.schedule,
    });
    expect(clock.held()).toBe(1000);
    clock.fire();
    const store = await opening;
    expect(store).toBeInstanceOf(page.Memory);
    late(new page.Memory());
    await Promise.resolve();
    expect(page.appearanceStore()).toBe(store);
  });

  it('is memory on a page with no IndexedDB, and leaves no wait behind', async () => {
    const page = await freshPage();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const waits = vi.spyOn(globalThis, 'setTimeout');
    const cleared = vi.spyOn(globalThis, 'clearTimeout');
    expect('indexedDB' in globalThis).toBe(false);
    expect(await page.establishAppearanceStore(page.pageStoreSources())).toBeInstanceOf(page.Memory);
    const wait = waits.mock.calls.findIndex(([, ms]) => ms === 1000);
    expect(wait).toBeGreaterThanOrEqual(0);
    expect(cleared).toHaveBeenCalledWith(waits.mock.results[wait]?.value);
  });
});

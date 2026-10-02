import { describe, expect, it } from 'vitest';
import { grok } from '@grythjs/plugin-api';
import { GyldFocusTap, GyldSetTap } from './rootTaps';
import { gyldSessionFields } from './sessionState';

grok.registerTap(GyldSetTap); grok.registerTap(GyldFocusTap);
describe('SS-07 serializable Gyld session fields', () => {
  it('reads and restores roots and focus, preserving unknown plugin fields', () => {
    const fields = gyldSessionFields(grok);
    fields.seed({ future: 7, gyld: { roots: [{ kind: 'share' }, { kind: 'directory', name: 'local' }], focus: { stream: 's1', ref: 'q2' } } });
    expect(GyldSetTap.get().roots).toEqual([{ kind: 'share' }, { kind: 'directory', name: 'local' }]);
    expect(GyldFocusTap.get()).toEqual({ stream: 's1', ref: 'q2' });
    expect(fields.read()).toEqual({ future: 7, gyld: { roots: [{ kind: 'share' }, { kind: 'directory', name: 'local' }], focus: { stream: 's1', ref: 'q2' } } });
  });
  it('rejects malformed roots and never serializes a directory handle', () => {
    const fields = gyldSessionFields(grok);
    fields.seed({ gyld: { roots: [{ kind: 'directory', name: 'local', handle: { secret: true } }, { kind: 'static', baseUrl: 42 }, { kind: 'other' }], focus: { stream: 42 } } });
    expect(fields.read()).toEqual({ gyld: { roots: [{ kind: 'directory', name: 'local' }], focus: { stream: '', ref: '' } } });
  });
  it('watches changes to either shared field', async () => {
    const fields = gyldSessionFields(grok);
    let changed = 0;
    fields.watch(() => { changed += 1; }); grok.flush();
    const before = changed;
    GyldFocusTap.set({ stream: 's2', ref: 'q3' }); grok.flush();
    await expect.poll(() => changed).toBeGreaterThan(before);
  });
});

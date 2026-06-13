import { describe, it, expect } from 'vitest';
import { buildBase, createMachine, deleteBase, destroyMachine, setMachineState } from './ops';
import type { BaseRecord, MachineRecord } from './types';

const BASES: BaseRecord[] = [
  { name: 'ubuntu-base', provider: 'orbstack', providerId: 'glvm-base-ubuntu', image: 'ubuntu:24.04' },
];

const machine = (over: Partial<MachineRecord> & { name: string }): MachineRecord => ({
  provider: 'orbstack', providerId: `glvm-${over.name}`, profile: 'dev',
  image: 'ubuntu:24.04', network: 'full', state: 'stopped',
  owner: 'tester', owned: true, createdAt: 't0', ...over,
});

describe('vm ops (mirroring griplab_vm.py semantics)', () => {
  it('creates an orbstack machine as a stopped clone of a base', () => {
    const out = createMachine([], BASES, {
      name: 'glv-a', profile: 'dev', provider: 'orbstack', base: 'ubuntu-base', owner: 'tester', createdAt: 't1',
    });
    expect(out.error).toBeUndefined();
    expect(out.list[0]).toMatchObject({
      name: 'glv-a', provider: 'orbstack', base: 'ubuntu-base',
      image: 'ubuntu:24.04', state: 'stopped', providerId: 'glvm-glv-a',
    });
  });

  it('registers (not boots) a native-host machine and needs no base', () => {
    const out = createMachine([], BASES, {
      name: 'pi', profile: 'dev', provider: 'native-host', owner: 'tester', createdAt: 't1',
    });
    expect(out.list[0].state).toBe('registered');
  });

  it('rejects duplicates, baseless orbstack creates, and base/provider mismatches', () => {
    const existing = [machine({ name: 'glv-a' })];
    expect(createMachine(existing, BASES, { name: 'glv-a', profile: 'dev', provider: 'orbstack', base: 'ubuntu-base', owner: 'o', createdAt: 't' }).error)
      .toBe('machine already exists: glv-a');
    expect(createMachine([], BASES, { name: 'x', profile: 'dev', provider: 'orbstack', owner: 'o', createdAt: 't' }).error)
      .toBe('orbstack create requires a base (v1 clone mode)');
    expect(createMachine([], BASES, { name: 'x', profile: 'dev', provider: 'orbstack', base: 'nope', owner: 'o', createdAt: 't' }).error)
      .toBe('base not found: nope');
    expect(createMachine([], [{ ...BASES[0], provider: 'lima' }], { name: 'x', profile: 'dev', provider: 'orbstack', base: 'ubuntu-base', owner: 'o', createdAt: 't' }).error)
      .toBe('base provider is not orbstack: lima');
    expect(createMachine([], BASES, { name: '', profile: 'dev', provider: 'orbstack', base: 'ubuntu-base', owner: 'o', createdAt: 't' }).error)
      .toBe('machine name required');
  });

  it('start/stop/restart transition machine state', () => {
    const list = [machine({ name: 'glv-a' })];
    const started = setMachineState(list, 'glv-a', 'start');
    expect(started[0].state).toBe('running');
    expect(setMachineState(started, 'glv-a', 'restart')[0].state).toBe('running');
    expect(setMachineState(started, 'glv-a', 'stop')[0].state).toBe('stopped');
    // start is a no-op guard on already-running machines
    expect(setMachineState(started, 'glv-a', 'start')).toBe(started);
  });

  it('destroys owned machines; an unowned wsl2 machine merely detaches', () => {
    const list = [
      machine({ name: 'glv-a' }),
      machine({ name: 'win', provider: 'wsl2', owned: false }),
    ];
    const a = destroyMachine(list, 'glv-a');
    expect(a.list.map((m) => m.name)).toEqual(['win']);
    expect(a.detached).toBe(false);
    const b = destroyMachine(list, 'win');
    expect(b.list.map((m) => m.name)).toEqual(['glv-a']);
    expect(b.detached).toBe(true);
  });

  it('builds and deletes bases; duplicate base names are rejected', () => {
    const out = buildBase(BASES, { name: 'fresh', provider: 'orbstack', image: 'ubuntu:24.04' });
    expect(out.error).toBeUndefined();
    expect(out.list.map((b) => b.name)).toEqual(['ubuntu-base', 'fresh']);
    expect(buildBase(BASES, { name: 'ubuntu-base', provider: 'orbstack', image: 'x' }).error)
      .toBe('base already exists: ubuntu-base');
    expect(deleteBase(BASES, 'ubuntu-base')).toEqual([]);
  });
});

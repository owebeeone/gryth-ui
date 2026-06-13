import type { BaseRecord, MachineRecord, MachineState } from './types';

// Pure VM mutations, mirroring griplab_vm.py's command semantics: the view
// and (later) agents apply these to the machines/bases atoms; the real
// vm_manager service binds the same grips behind the matcher.

export interface CreateMachineInput {
  name: string;
  profile: string;
  provider: string;
  base?: string;
  owner: string;
  createdAt: string;
}

export function createMachine(
  machines: MachineRecord[],
  bases: BaseRecord[],
  input: CreateMachineInput,
): { list: MachineRecord[]; error?: string } {
  if (!input.name.trim()) return { list: machines, error: 'machine name required' };
  if (machines.some((m) => m.name === input.name)) {
    return { list: machines, error: `machine already exists: ${input.name}` };
  }
  let image = 'ubuntu:24.04';
  let base: BaseRecord | undefined;
  if (input.base) {
    base = bases.find((b) => b.name === input.base);
    if (!base) return { list: machines, error: `base not found: ${input.base}` };
    if (base.provider !== input.provider) {
      return { list: machines, error: `base provider is not ${input.provider}: ${base.provider}` };
    }
    image = base.image;
  } else if (input.provider === 'orbstack') {
    // v1 clone mode: an orbstack machine is always a clone of a base
    return { list: machines, error: 'orbstack create requires a base (v1 clone mode)' };
  }
  const record: MachineRecord = {
    name: input.name,
    provider: input.provider,
    providerId: input.provider === 'native-host' ? `native-host:${input.name}` : `glvm-${input.name}`,
    profile: input.profile,
    base: input.base,
    image,
    network: 'full',
    // native-host machines are REGISTERED (the host is already running);
    // provider machines arrive stopped and must be started
    state: input.provider === 'native-host' ? 'registered' : 'stopped',
    owner: input.owner,
    owned: true,
    createdAt: input.createdAt,
  };
  return { list: [...machines, record] };
}

export type MachineAction = 'start' | 'stop' | 'restart';

const TRANSITIONS: Record<MachineAction, { from: MachineState[]; to: MachineState }> = {
  start: { from: ['stopped', 'registered'], to: 'running' },
  stop: { from: ['running'], to: 'stopped' },
  restart: { from: ['running'], to: 'running' },
};

// Returns the SAME list when the action does not apply (no notify churn).
export function setMachineState(
  machines: MachineRecord[],
  name: string,
  action: MachineAction,
): MachineRecord[] {
  const t = TRANSITIONS[action];
  const machine = machines.find((m) => m.name === name);
  if (!machine || !t.from.includes(machine.state)) return machines;
  if (action !== 'restart' && machine.state === t.to) return machines;
  return machines.map((m) => (m.name === name ? { ...m, state: t.to } : m));
}

// An unowned wsl2 machine was attached, not created — destroying it only
// detaches the record; the distro lives on.
export function destroyMachine(
  machines: MachineRecord[],
  name: string,
): { list: MachineRecord[]; detached: boolean; error?: string } {
  const machine = machines.find((m) => m.name === name);
  if (!machine) return { list: machines, detached: false, error: `machine not found: ${name}` };
  const list = machines.filter((m) => m.name !== name);
  return { list, detached: machine.provider === 'wsl2' && !machine.owned };
}

export function buildBase(
  bases: BaseRecord[],
  input: { name: string; provider: string; image: string },
): { list: BaseRecord[]; error?: string } {
  if (!input.name.trim()) return { list: bases, error: 'base name required' };
  if (bases.some((b) => b.name === input.name)) {
    return { list: bases, error: `base already exists: ${input.name}` };
  }
  return {
    list: [...bases, {
      name: input.name,
      provider: input.provider,
      providerId: `glvm-base-${input.name}`,
      image: input.image,
    }],
  };
}

export function deleteBase(bases: BaseRecord[], name: string): BaseRecord[] {
  return bases.filter((b) => b.name !== name);
}

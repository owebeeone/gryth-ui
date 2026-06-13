import { createAtomValueTap } from '@owebeeone/grip-react';
import {
  VM_BASES, VM_BASES_TAP, VM_MACHINES, VM_MACHINES_TAP, VM_PROFILES, VM_PROVIDERS,
} from './grips';
import type { BaseRecord, MachineRecord, ProfileRecord, ProviderStatus } from './types';

// Mock vm_manager state — what `griplab_vm doctor/list/image list` would
// report on a mac with orbstack installed.

const PROVIDERS: ProviderStatus[] = [
  { name: 'orbstack', available: true, detail: 'orb found' },
  { name: 'lima', available: false, detail: 'missing command: limactl' },
  { name: 'qemu', available: false, detail: 'missing command: qemu-system-aarch64' },
  { name: 'wsl2', available: false, detail: 'unsupported on darwin' },
  { name: 'native-host', available: true, detail: 'always available (no isolation)' },
];

const PROFILES: ProfileRecord[] = [
  { name: 'dev', image: 'ubuntu-lts', network: 'full' },
  { name: 'ci', image: 'ubuntu-lts', network: 'none' },
];

const BASES: BaseRecord[] = [
  { name: 'ubuntu-base', provider: 'orbstack', providerId: 'glvm-base-ubuntu', image: 'ubuntu:24.04' },
];

const MACHINES: MachineRecord[] = [
  {
    name: 'glv-dev', provider: 'orbstack', providerId: 'glvm-glv-dev', profile: 'dev',
    base: 'ubuntu-base', image: 'ubuntu:24.04', network: 'full',
    state: 'running', owner: 'gianni', owned: true, createdAt: '2026-06-10T09:00:00Z',
  },
  {
    name: 'glv-ci', provider: 'orbstack', providerId: 'glvm-glv-ci', profile: 'ci',
    base: 'ubuntu-base', image: 'ubuntu:24.04', network: 'none',
    state: 'stopped', owner: 'gianni', owned: true, createdAt: '2026-06-11T10:30:00Z',
  },
  {
    name: 'pi-bench', provider: 'native-host', providerId: 'native-host:pi-bench', profile: 'dev',
    image: 'ubuntu:24.04', network: 'full',
    state: 'registered', owner: 'gianni', owned: true, createdAt: '2026-06-12T08:15:00Z',
  },
];

export const VmMachinesTap = createAtomValueTap(VM_MACHINES, {
  initial: MACHINES,
  handleGrip: VM_MACHINES_TAP,
});
export const VmBasesTap = createAtomValueTap(VM_BASES, {
  initial: BASES,
  handleGrip: VM_BASES_TAP,
});
export const VmProvidersTap = createAtomValueTap(VM_PROVIDERS, { initial: PROVIDERS });
export const VmProfilesTap = createAtomValueTap(VM_PROFILES, { initial: PROFILES });

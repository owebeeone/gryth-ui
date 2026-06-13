import type { AtomTapHandle } from '@owebeeone/grip-react';
import { defineGrip, type GrythPlugin } from '@grythjs/plugin-api';
import type { BaseRecord, MachineRecord, ProfileRecord, ProviderStatus } from './types';

// The plugin's identity grip (the registry key).
export const VM_PLUGIN = defineGrip<GrythPlugin>('Vm.Plugin');

// Doc scope: the vm_manager state store (machines + bases) and host facts
// (providers, profiles). Mock-bound today; the real vm_manager service
// binds the same grips behind the matcher and consumers don't change.
export const VM_MACHINES = defineGrip<MachineRecord[]>('Vm.Machines', []);
export const VM_MACHINES_TAP = defineGrip<AtomTapHandle<MachineRecord[]>>('Vm.Machines.Tap');
export const VM_BASES = defineGrip<BaseRecord[]>('Vm.Bases', []);
export const VM_BASES_TAP = defineGrip<AtomTapHandle<BaseRecord[]>>('Vm.Bases.Tap');
export const VM_PROVIDERS = defineGrip<ProviderStatus[]>('Vm.Providers', []);
export const VM_PROFILES = defineGrip<ProfileRecord[]>('Vm.Profiles', []);

// Per-viewer create-form draft, seeded into each manager window's
// CHROME-HELD tab context (ToolDef.tabTaps) — instance scope, never
// persisted, survives unmount/remount.
export const VM_FORM_NAME = defineGrip<string>('Vm.Form.Name', '');
export const VM_FORM_NAME_TAP = defineGrip<AtomTapHandle<string>>('Vm.Form.Name.Tap');
export const VM_FORM_PROFILE = defineGrip<string>('Vm.Form.Profile', 'dev');
export const VM_FORM_PROFILE_TAP = defineGrip<AtomTapHandle<string>>('Vm.Form.Profile.Tap');
export const VM_FORM_PROVIDER = defineGrip<string>('Vm.Form.Provider', 'orbstack');
export const VM_FORM_PROVIDER_TAP = defineGrip<AtomTapHandle<string>>('Vm.Form.Provider.Tap');
export const VM_FORM_BASE = defineGrip<string>('Vm.Form.Base', '');
export const VM_FORM_BASE_TAP = defineGrip<AtomTapHandle<string>>('Vm.Form.Base.Tap');
export const VM_FORM_BASE_NAME = defineGrip<string>('Vm.Form.BaseName', '');
export const VM_FORM_BASE_NAME_TAP = defineGrip<AtomTapHandle<string>>('Vm.Form.BaseName.Tap');
export const VM_FORM_ERROR = defineGrip<string>('Vm.Form.Error', '');
export const VM_FORM_ERROR_TAP = defineGrip<AtomTapHandle<string>>('Vm.Form.Error.Tap');

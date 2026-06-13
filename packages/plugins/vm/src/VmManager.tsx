import { useGrip } from '@owebeeone/grip-react';
import { DESKTOP_OPEN_TOOL } from '@grythjs/plugin-api';
import {
  VM_BASES, VM_BASES_TAP,
  VM_FORM_BASE, VM_FORM_BASE_NAME, VM_FORM_BASE_NAME_TAP, VM_FORM_BASE_TAP,
  VM_FORM_ERROR, VM_FORM_ERROR_TAP, VM_FORM_NAME, VM_FORM_NAME_TAP,
  VM_FORM_PROFILE, VM_FORM_PROFILE_TAP, VM_FORM_PROVIDER, VM_FORM_PROVIDER_TAP,
  VM_MACHINES, VM_MACHINES_TAP, VM_PROFILES, VM_PROVIDERS,
} from './grips';
import {
  buildBase, createMachine, deleteBase, destroyMachine, setMachineState,
  type MachineAction,
} from './ops';
import type { MachineRecord } from './types';

// Live launcher entry: running / total machines.
export function VmMenuTitle() {
  const machines = useGrip(VM_MACHINES) ?? [];
  const running = machines.filter((m) => m.state === 'running').length;
  return <>VMs ({running}/{machines.length})</>;
}

// The VM manager window — the graphical griplab_vm. Document state
// (machines, bases) lives in doc-scope grips edited through their handles;
// the create-form draft is SEEDED into this window's chrome-held tab
// context (ToolDef.tabTaps): two managers draft independently and drafts
// survive desktop switches.
export function VmManager() {
  const machines = useGrip(VM_MACHINES) ?? [];
  const machinesTap = useGrip(VM_MACHINES_TAP);
  const bases = useGrip(VM_BASES) ?? [];
  const basesTap = useGrip(VM_BASES_TAP);
  const providers = useGrip(VM_PROVIDERS) ?? [];
  const profiles = useGrip(VM_PROFILES) ?? [];
  const openTool = useGrip(DESKTOP_OPEN_TOOL);

  const nameTap = useGrip(VM_FORM_NAME_TAP);
  const profileTap = useGrip(VM_FORM_PROFILE_TAP);
  const providerTap = useGrip(VM_FORM_PROVIDER_TAP);
  const baseTap = useGrip(VM_FORM_BASE_TAP);
  const baseNameTap = useGrip(VM_FORM_BASE_NAME_TAP);
  const errorTap = useGrip(VM_FORM_ERROR_TAP);
  const name = useGrip(VM_FORM_NAME) ?? '';
  const profile = useGrip(VM_FORM_PROFILE) ?? 'dev';
  const provider = useGrip(VM_FORM_PROVIDER) ?? 'orbstack';
  const base = useGrip(VM_FORM_BASE) ?? '';
  const baseName = useGrip(VM_FORM_BASE_NAME) ?? '';
  const error = useGrip(VM_FORM_ERROR) ?? '';

  const act = (machine: string, action: MachineAction) =>
    machinesTap?.update((list) => setMachineState(list, machine, action));

  const destroy = (machine: string) =>
    machinesTap?.update((list) => destroyMachine(list, machine).list);

  const shell = (m: MachineRecord) =>
    openTool?.({ toolId: 'terminal', params: { machine: m.name, provider: m.provider } });

  const create = () => {
    const out = createMachine(machines, bases, {
      name: name.trim(), profile, provider,
      base: base || undefined,
      owner: 'you', createdAt: new Date().toISOString(),
    });
    if (out.error) {
      errorTap?.set(out.error);
      return;
    }
    machinesTap?.set(out.list);
    errorTap?.set('');
    nameTap?.set('');
  };

  const build = () => {
    const prof = profiles.find((p) => p.name === profile);
    const out = buildBase(bases, {
      name: baseName.trim(), provider, image: prof?.image === 'ubuntu-lts' ? 'ubuntu:24.04' : prof?.image ?? 'ubuntu:24.04',
    });
    if (out.error) {
      errorTap?.set(out.error);
      return;
    }
    basesTap?.set(out.list);
    errorTap?.set('');
    baseNameTap?.set('');
  };

  return (
    <div className="vm-manager">
      <section className="vm-section">
        <h3>Machines</h3>
        {machines.length === 0 && <div className="vm-empty">No machines. Create one below.</div>}
        {machines.map((m) => (
          <div key={m.name} className="vm-row">
            <span className={`vm-dot ${m.state}`} title={m.state} />
            <span className="vm-name">{m.name}</span>
            <span className="vm-chip">{m.provider}</span>
            <span className="vm-meta">{m.profile} · {m.image}{m.base ? ` · ⧉ ${m.base}` : ''}</span>
            <span className={`vm-state ${m.state}`}>{m.state}</span>
            <span className="vm-actions">
              <button title="Start" disabled={m.state === 'running'} onClick={() => act(m.name, 'start')}>▶</button>
              <button title="Stop" disabled={m.state !== 'running'} onClick={() => act(m.name, 'stop')}>■</button>
              <button title="Restart" disabled={m.state !== 'running'} onClick={() => act(m.name, 'restart')}>⟳</button>
              <button
                title="Open shell"
                disabled={m.state !== 'running' && m.provider !== 'native-host'}
                onClick={() => shell(m)}
              >&gt;_</button>
              <button title={m.provider === 'wsl2' && !m.owned ? 'Detach' : 'Destroy'} onClick={() => destroy(m.name)}>✕</button>
            </span>
          </div>
        ))}
      </section>

      <section className="vm-section">
        <h3>Create machine</h3>
        <div className="vm-form">
          <input
            placeholder="machine name"
            value={name}
            onChange={(e) => nameTap?.set(e.target.value)}
          />
          <select value={profile} onChange={(e) => profileTap?.set(e.target.value)}>
            {profiles.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          <select value={provider} onChange={(e) => providerTap?.set(e.target.value)}>
            {providers.map((p) => (
              <option key={p.name} value={p.name} disabled={!p.available}>
                {p.name}{p.available ? '' : ' (unavailable)'}
              </option>
            ))}
          </select>
          <select value={base} onChange={(e) => baseTap?.set(e.target.value)}>
            <option value="">no base</option>
            {bases.map((b) => <option key={b.name} value={b.name}>⧉ {b.name}</option>)}
          </select>
          <button onClick={create}>Create</button>
        </div>
        {error && <div className="vm-error">{error}</div>}
      </section>

      <section className="vm-section">
        <h3>Bases</h3>
        {bases.map((b) => (
          <div key={b.name} className="vm-row">
            <span className="vm-name">⧉ {b.name}</span>
            <span className="vm-chip">{b.provider}</span>
            <span className="vm-meta">{b.image}</span>
            <span className="vm-actions">
              <button title="Delete base" onClick={() => basesTap?.set(deleteBase(bases, b.name))}>✕</button>
            </span>
          </div>
        ))}
        <div className="vm-form">
          <input
            placeholder="new base name"
            value={baseName}
            onChange={(e) => baseNameTap?.set(e.target.value)}
          />
          <button onClick={build}>Build base</button>
        </div>
      </section>

      <section className="vm-section">
        <h3>Providers</h3>
        {providers.map((p) => (
          <div key={p.name} className="vm-row">
            <span className={`vm-dot ${p.available ? 'running' : 'stopped'}`} />
            <span className="vm-name">{p.name}</span>
            <span className="vm-meta">{p.detail}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

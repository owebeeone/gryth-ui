// VM manager types — the graphical model of glial-dev's
// vm_manager/griplab_vm.py (providers, reusable bases, machines).

export type MachineState = 'running' | 'stopped' | 'registered';

export interface ProviderStatus {
  name: string;       // orbstack | lima | wsl2 | qemu | native-host
  available: boolean;
  detail: string;     // detect() result, e.g. "orb found" / "missing command: limactl"
}

export interface ProfileRecord {
  name: string;       // e.g. dev
  image: string;      // OS alias, e.g. ubuntu-lts
  network: string;    // network alias, e.g. full
}

export interface BaseRecord {
  name: string;
  provider: string;
  providerId: string;
  image: string;      // resolved image, e.g. ubuntu:24.04
}

export interface MachineRecord {
  name: string;
  provider: string;
  providerId: string;
  profile: string;
  base?: string;      // reusable base it was cloned from
  image: string;
  network: string;
  state: MachineState;
  owner: string;
  owned: boolean;     // wsl2 machines may be attached, not owned
  createdAt: string;
}

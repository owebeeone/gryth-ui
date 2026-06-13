import { createAtomValueTap } from '@owebeeone/grip-react';
import { addEntry, grok } from '@grythjs/plugin-api';
import {
  VM_FORM_BASE, VM_FORM_BASE_NAME, VM_FORM_BASE_NAME_TAP, VM_FORM_BASE_TAP,
  VM_FORM_ERROR, VM_FORM_ERROR_TAP, VM_FORM_NAME, VM_FORM_NAME_TAP,
  VM_FORM_PROFILE, VM_FORM_PROFILE_TAP, VM_FORM_PROVIDER, VM_FORM_PROVIDER_TAP,
  VM_PLUGIN,
} from './grips';
import { VmBasesTap, VmMachinesTap, VmProfilesTap, VmProvidersTap } from './mock';
import { VmManager, VmMenuTitle } from './VmManager';
import './vm.css';

// @grythjs/plugin-vm — the graphical griplab_vm (see
// glial-dev/vm_manager/src/vm_manager/griplab_vm.py). Importing this
// module IS registering.

addEntry(VM_PLUGIN, {
  tools: {
    vms: {
      label: 'VMs',
      defaultSize: { w: 720, h: 560 },
      role: 'crew',
      menuTitle: VmMenuTitle,
      windowComponent: VmManager,
      // form drafts live in the chrome-held tab context: two manager
      // windows draft independently, and drafts survive desktop switches
      tabTaps: () => [
        createAtomValueTap(VM_FORM_NAME, { initial: '', handleGrip: VM_FORM_NAME_TAP }),
        createAtomValueTap(VM_FORM_PROFILE, { initial: 'dev', handleGrip: VM_FORM_PROFILE_TAP }),
        createAtomValueTap(VM_FORM_PROVIDER, { initial: 'orbstack', handleGrip: VM_FORM_PROVIDER_TAP }),
        createAtomValueTap(VM_FORM_BASE, { initial: '', handleGrip: VM_FORM_BASE_TAP }),
        createAtomValueTap(VM_FORM_BASE_NAME, { initial: '', handleGrip: VM_FORM_BASE_NAME_TAP }),
        createAtomValueTap(VM_FORM_ERROR, { initial: '', handleGrip: VM_FORM_ERROR_TAP }),
      ],
    },
  },
});
grok.registerTap(VmMachinesTap);
grok.registerTap(VmBasesTap);
grok.registerTap(VmProvidersTap);
grok.registerTap(VmProfilesTap);

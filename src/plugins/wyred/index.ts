// TEST MOUNT for the wyred plugin family (wyred-wz/dev-docs/
// GrythWyredUiDesignPlan.md §3.5b, step 0.2). The plugin body lives in the
// wyred-wz sibling workspace and is consumed via a file: dep — the same
// cross-workspace pattern @grythjs/glade uses toward glade-wz. Reversible:
// delete this directory and the package.json dep line. Permanence (flag vs
// keep vs dev-only) is decided at plan step 3.4.
import '@wyredjs/plugin-wyred';

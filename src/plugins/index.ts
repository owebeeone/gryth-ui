// Composition root for plugins: adding a plugin = adding a directory with
// an index.ts that, on init, calls addEntry(ITS_PLUGIN_GRIP, plugin) and
// registers its taps into the context graph (see
// dev-docs/GrythPluginContract.md, "Registration and discovery"). The glob
// executes every plugin module; eager keeps registration synchronous with
// bootstrap (lazy loading arrives with async view states).
const modules = import.meta.glob('./*/index.ts', { eager: true });
void modules;

// Plugin PACKAGES register the same way, by being imported here.
import '@grythjs/plugin-workspace';
import '@grythjs/plugin-code';
import '@grythjs/plugin-vm';
import '@grythjs/plugin-terminals';
import '@grythjs/plugin-settings';
import '@grythjs/plugin-chat';
import '@grythjs/plugin-gwz';

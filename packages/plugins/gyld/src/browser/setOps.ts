import type { GyldRootRef, GyldSet } from '../store/state';

// Adding a root to the set, as PURE functions over the set value. They live
// beside the picker rather than inside it so the component file exports a
// component and nothing else (the repository's fast-refresh lint), and so a
// caller that is not a picker (an agent writing Gyld.Set.Tap) applies the same
// rules the picker does.

/** A static root, refused when the set already has it. Pure. */
export function addStaticRoot(set: GyldSet, baseUrl: string): { set: GyldSet; error?: string } {
  const url = baseUrl.trim().replace(/\/+$/, '');
  if (url === '') {
    return { set, error: 'a static root needs a URL' };
  }
  if (!/^https?:\/\//i.test(url)) {
    return { set, error: `"${url}" is not an http or https URL` };
  }
  if (set.roots.some((root) => root.kind === 'static' && root.baseUrl === url)) {
    return { set, error: `${url} is already a root of this set` };
  }
  return { set: { roots: [...set.roots, { kind: 'static', baseUrl: url }] } };
}

/**
 * The glade node's published shares as a root, refused when the set already
 * has it. There is only ever one: the desktop holds one glade session, so a
 * second copy of this root would be the same mounts read twice.
 */
export function addShareRoot(set: GyldSet): { set: GyldSet; error?: string } {
  if (set.roots.some((root) => root.kind === 'share')) {
    return { set, error: 'the glade node is already a root of this set' };
  }
  return { set: { roots: [...set.roots, { kind: 'share' }] } };
}

/** What a root is CALLED in a list, from the ref alone. The store's own status
 *  line says what it turned out to be; this is what the reader typed or
 *  picked, which is all a ref carries. */
export function describeRoot(root: GyldRootRef): string {
  if (root.kind === 'static') {
    return root.baseUrl;
  }
  return root.kind === 'directory' ? root.name : 'glade node';
}

/** A directory root under a name no other root of the set has taken. The name
 *  is all that is stored: a handle cannot be serialized, so the store tap
 *  holds it as runtime state and a reloaded desk asks for the directory again. */
export function addDirectoryRoot(set: GyldSet, name: string): { set: GyldSet; name: string } {
  const taken = new Set(set.roots.filter((root) => root.kind === 'directory')
    .map((root) => (root as { name: string }).name));
  let chosen = name;
  for (let n = 2; taken.has(chosen); n += 1) {
    chosen = `${name} (${n})`;
  }
  return { set: { roots: [...set.roots, { kind: 'directory', name: chosen }] }, name: chosen };
}

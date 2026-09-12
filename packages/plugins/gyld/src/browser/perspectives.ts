import type { StreamLens } from '../contract';
import type { GyldBundle } from '../store/state';

// What the perspective picker offers, as PURE functions over what the stream
// record's own lens manifest said.
//
// Nothing here is a Gyld fact this package made. The emitted list is the
// manifest's emitted entries (or, for a record with no manifest, what the store
// could list); a perspective the host declined to emit is shown disabled with
// the host's own reason rather than filtered away (spec section 3.5); and a
// member of a parameterised FAMILY is labelled with the parameter that picked
// it, because `neighbourhood-key_custody` is one member of `neighbourhood` and
// a reader choosing between members needs to see which question each is of.

/** One perspective option: what it is called, which family it belongs to, what
 *  picked it out of that family, and why it cannot be chosen. */
export interface PerspectiveOption {
  perspective: string;
  emitted: boolean;
  family?: string;
  parameter?: Record<string, string>;
  reason?: string;
}

/** The manifest entry for one perspective, when the record carried a manifest
 *  at all. A store listing has no entries, so a listed perspective carries no
 *  family: absence of a manifest is not a family of none. */
function detail(
  manifest: readonly StreamLens[] | undefined,
  perspective: string,
): StreamLens | undefined {
  return manifest?.find((entry) => entry.perspective === perspective);
}

function optionFor(
  manifest: readonly StreamLens[] | undefined,
  perspective: string,
  emitted: boolean,
  reason?: string,
): PerspectiveOption {
  const entry = detail(manifest, perspective);
  const option: PerspectiveOption = { perspective, emitted };
  if (entry?.family !== undefined) {
    option.family = entry.family;
  }
  if (entry?.parameter !== undefined) {
    option.parameter = entry.parameter;
  }
  if (reason !== undefined) {
    option.reason = reason;
  }
  return option;
}

export function perspectiveOptions(
  bundle: GyldBundle | undefined,
  current: string,
): PerspectiveOption[] {
  const manifest = bundle?.lenses;
  const options: PerspectiveOption[] = (bundle?.perspectives ?? []).map(
    (perspective) => optionFor(manifest, perspective, true),
  );
  for (const entry of bundle?.notEmitted ?? []) {
    options.push(optionFor(manifest, entry.perspective, false, entry.reason));
  }
  // A window opened on a perspective this stream never mentioned keeps its own
  // entry, so the picker shows what the window IS on rather than silently
  // moving it somewhere else.
  if (current !== '' && !options.some((option) => option.perspective === current)) {
    options.push(optionFor(
      manifest, current, false, 'this stream does not list that perspective at all',
    ));
  }
  return options;
}

/** The parameter that picked one member, as text: `question <slot>`. Empty when
 *  the host named no parameter, which a family with one member legitimately
 *  does not have to. */
export function parameterText(parameter: Record<string, string> | undefined): string {
  return Object.entries(parameter ?? {}).map(([key, value]) => `${key} ${value}`).join(', ');
}

export function labelFor(option: PerspectiveOption): string {
  const parameter = parameterText(option.parameter);
  const member = option.family === undefined
    ? ''
    : ` (${option.family}${parameter === '' ? '' : ` of ${parameter}`})`;
  const name = `${option.perspective}${member}`;
  if (option.emitted) {
    return name;
  }
  return option.reason === undefined
    ? `${name} (not emitted)`
    : `${name} (not emitted: ${option.reason})`;
}

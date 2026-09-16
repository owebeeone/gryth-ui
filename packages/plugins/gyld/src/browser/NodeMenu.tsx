import { useGrip, type AtomTapHandle } from '@owebeeone/grip-react';
import { GYLD_DECIDE_NOW, GYLD_RECORDS, GYLD_TAB_MENU_TAP } from '../grips';
import type { SceneNode } from '../lens/scene';
import { cardFor } from './card';
import { closeMenu, menuEntries, type GyldNodeMenu } from './menu';
import { useBrowserFocus } from './useBrowserFocus';

// The node menu: the acts on a box, opened by a right-click or a shift-click
// (GyldAskAgent.md section 2, owner ruling A1 of 2026-09-16).
//
// It reads the SAME projection the hover card reads — `cardFor` over this
// window's own emitted decide-now list and its records — so the two surfaces
// can never disagree about one box. What it adds is a second way to reach the
// acts; what it decides is nothing.
//
// The menu is for ACTING and the card is for READING, which is why the window
// suppresses the card while this is open (LensView) rather than stacking two
// panels over one box. There is no React state here: the open menu is
// `Gyld.Tab.Menu`, and every entry closes it through that atom's own handle.

export function NodeMenu({ node }: { node: SceneNode }) {
  const decideNow = useGrip(GYLD_DECIDE_NOW);
  const records = useGrip(GYLD_RECORDS);
  const menuTap = useGrip(GYLD_TAB_MENU_TAP) as AtomTapHandle<GyldNodeMenu> | undefined;
  const browser = useBrowserFocus();

  const card = cardFor(
    node,
    decideNow?.status === 'ok' ? decideNow.value : undefined,
    records,
  );
  const entries = menuEntries(card, browser);

  return (
    <ul className="gyld-node-menu" data-slot={card.slot} role="menu">
      <li className="gyld-node-menu-head">
        <span className="gyld-detail-label">{card.label}</span>
        {!card.listed && (
          <span className="gyld-note">not a question this stream lists</span>
        )}
      </li>
      {entries.map((entry) => (
        <li key={entry.act.name} role="none">
          <button
            type="button"
            role="menuitem"
            className="gyld-node-menu-item"
            data-act={entry.act.name}
            disabled={!entry.enabled}
            title={entry.title}
            onClick={() => {
              entry.act.perform(browser, card.slot);
              menuTap?.set(closeMenu());
            }}
          >
            {entry.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

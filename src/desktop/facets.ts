import type { JSX } from 'react';
import type { FacetKind } from '../grips.desktop';
import { ChatFacet, DiffFacet, ExplorerFacet, GridFacet, SettingsFacet, TerminalFacet, WelcomeFacet } from './facetComponents';

// Facet registry: kind -> chrome-facing definition. The window record names
// a facet kind; the chrome resolves it here and renders the component in the
// window body. Components live in facetComponents.tsx.

export interface FacetDef {
  title: string;
  defaultSize: { w: number; h: number };
  Component: () => JSX.Element;
}

export const FACETS: Record<FacetKind, FacetDef> = {
  welcome: { title: 'Welcome', defaultSize: { w: 520, h: 280 }, Component: WelcomeFacet },
  chat: { title: 'Chat', defaultSize: { w: 380, h: 460 }, Component: ChatFacet },
  terminal: { title: 'Terminal', defaultSize: { w: 640, h: 400 }, Component: TerminalFacet },
  diff: { title: 'Diff', defaultSize: { w: 720, h: 480 }, Component: DiffFacet },
  settings: { title: 'Settings', defaultSize: { w: 460, h: 440 }, Component: SettingsFacet },
  explorer: { title: 'Explorer', defaultSize: { w: 280, h: 480 }, Component: ExplorerFacet },
  grid: { title: 'Grid', defaultSize: { w: 640, h: 480 }, Component: GridFacet },
};

export const FACET_KINDS = Object.keys(FACETS) as FacetKind[];

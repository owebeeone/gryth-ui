import type { LayoutStore } from '@grythjs/desktop';

export class DeskSession {
  constructor(
    readonly principal: string,
    readonly entry: string,
    readonly name: string,
    readonly shared: boolean,
  ) {}

  get key(): string { return `self:${this.principal}/${this.name}`; }

  link(href: string): string {
    const url = new URL(href);
    url.searchParams.set('principal', this.principal);
    url.searchParams.set('session', this.name);
    return url.href;
  }
}

export function resolveDeskSession(
  identity: { principal: string; roams: boolean; origin: string },
  entry: string,
  search: string,
  store: Pick<LayoutStore, 'getItem' | 'setItem'> | null,
  mint: () => string = () => crypto.randomUUID(),
): DeskSession {
  if (!identity.roams) {
    return new DeskSession(identity.principal, entry, identity.origin, false);
  }
  if (identity.principal.includes('/')) {
    throw new Error('A session principal must not contain /');
  }
  let name = new URLSearchParams(search).get('session');
  if (!name?.trim()) {
    const key = `gryth.session.v1.${JSON.stringify([entry, identity.principal])}`;
    try {
      name = store?.getItem(key) ?? null;
    } catch {
      // Storage denial costs only the stable browser default.
    }
    if (!name?.trim()) {
      name = mint();
      try {
        store?.setItem(key, name);
      } catch {
        // The explicit session link still works when storage is blocked.
      }
    }
  }
  return new DeskSession(identity.principal, entry, name, true);
}

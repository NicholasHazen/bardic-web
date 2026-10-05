export type TabId = 'home' | 'library' | 'settings';

export const TABS: { id: TabId; label: string; hash: string }[] = [
  { id: 'home', label: 'Home', hash: '#/' },
  { id: 'library', label: 'Library', hash: '#/library' },
  { id: 'settings', label: 'Settings', hash: '#/settings' },
];

/** The tab a hash route belongs to (A1: three tabs, nothing else is top level). */
export function tabForRoute(route: string): TabId {
  if (route.startsWith('/library') || route.startsWith('/book')) return 'library';
  if (route.startsWith('/settings')) return 'settings';
  return 'home';
}

/** Default navigation when the integrator passes no handler. */
export function goToTab(id: TabId): void {
  const tab = TABS.find((t) => t.id === id);
  if (tab) location.hash = tab.hash;
}

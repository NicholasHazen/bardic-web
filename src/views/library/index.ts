// The connected screens of W1 (Home, Library, Add a book, Manage). Each reads and writes the real API through
// src/state/library.ts and src/state/imports.ts; the presentational views (HomeView, LibraryView, ...) are
// what the design boards render from fixtures.
//
// Wiring (the integrator): put a screen inside <Shell active=...>; Shell picks the phone tab bar or the tablet
// rail at 768 px. Hash routes used: #/ Home, #/library, #/library/manage, #/book/<id> (W2), #/settings.
export { default as HomeScreen } from './HomeScreen.svelte';
export { default as LibraryScreen } from './LibraryScreen.svelte';
export { default as AddBookSheet } from './AddBookSheet.svelte';
export { default as ManageScreen } from './ManageScreen.svelte';
export { default as Shell } from '../shell/Shell.svelte';
export { default as PhoneShell } from '../shell/PhoneShell.svelte';
export { default as TabletShell } from '../shell/TabletShell.svelte';
export { tabForRoute, TABS, type TabId } from '../shell/tabs';
export { isTablet } from '../shell/viewport';
export { importer } from './importer';

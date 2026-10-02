import { writable } from 'svelte/store';
import { browserStorage } from '../lib/clock';
import { loadAppearance, loadExtras, normalizeAppearance, normalizeExtras, saveAppearance, saveExtras, type ReaderAppearanceValue, type ReaderExtras } from '../views/sheets/appearance';

const storage = browserStorage();

/** Reader choices belong to this browser, shared by Settings and Now Playing. */
export const readerPreferences = writable({ appearance: loadAppearance(storage), extras: loadExtras(storage) });

export const readerActions = {
  setAppearance(value: ReaderAppearanceValue) {
    const appearance = normalizeAppearance(value);
    saveAppearance(storage, appearance);
    readerPreferences.update((s) => ({ ...s, appearance }));
  },
  setExtras(value: ReaderExtras) {
    const extras = normalizeExtras(value);
    saveExtras(storage, extras);
    readerPreferences.update((s) => ({ ...s, extras }));
  },
};

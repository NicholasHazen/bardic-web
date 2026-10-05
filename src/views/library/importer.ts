import { get } from 'svelte/store';
import { ImportController, realImportDeps } from '../../state/imports';
import { homeList, libraryList, manageList } from '../../state/library';
import { listenerStore } from '../../state/listener';

/** The one add-a-book flow of the app. The sheet renders it; Home and Library open it. */
export const importer = new ImportController(realImportDeps(() => get(listenerStore).currentId ?? undefined));

// A book that was added or restored shows up in every list without waiting for the event stream.
importer.onbookchanged = () => {
  for (const l of [homeList, libraryList, manageList]) l.refreshSoon(0);
};

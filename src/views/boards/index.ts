import type { Component } from 'svelte';
import B1Palette from './B1Palette.svelte';
import Components from './Components.svelte';
import { bookBoards } from './book';
import { libraryBoards } from './library';
import { listenerBoards } from './listeners';
import { playerBoards } from './player';
import { sheetsBoards } from './sheets';
import { voiceBoards } from './voices';

/** Board name (as the product spec cites it) to the view that renders it from fixtures. */
export const boards: Record<string, Component> = {
  B1Palette,
  Components,
  ...listenerBoards,
  ...libraryBoards,
  ...bookBoards,
  ...voiceBoards,
  ...playerBoards,
  ...sheetsBoards,
};

import type { Component } from 'svelte';
import B1Palette from './B1Palette.svelte';
import Components from './Components.svelte';
import { libraryBoards } from './library';
import { listenerBoards } from './listeners';

/** Board name (as the product spec cites it) to the view that renders it from fixtures. */
export const boards: Record<string, Component> = {
  B1Palette,
  Components,
  ...listenerBoards,
  ...libraryBoards,
};

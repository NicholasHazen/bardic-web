import type { Component } from 'svelte';
import Components from './Components.svelte';
import B1Palette from './B1Palette.svelte';

/** Board name (as the product spec cites it) to the view that renders it from fixtures. */
export const boards: Record<string, Component> = {
  Components,
  B1Palette,
};

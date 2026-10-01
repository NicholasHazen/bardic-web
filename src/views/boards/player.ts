import type { Component } from 'svelte';
import B1ListenBoard from '../player/boards/B1ListenBoard.svelte';
import B1ReadBoard from '../player/boards/B1ReadBoard.svelte';
import B1ReadControlsBoard from '../player/boards/B1ReadControlsBoard.svelte';
import B1TabletBoard from '../player/boards/B1TabletBoard.svelte';
import B1TabletListenBoard from '../player/boards/B1TabletListenBoard.svelte';
import B1TabletReadBoard from '../player/boards/B1TabletReadBoard.svelte';
import BarExpandedBoard from '../player/boards/BarExpandedBoard.svelte';
import PlayerDemoBoard from '../player/boards/PlayerDemoBoard.svelte';
import ReadAwayBoard from '../player/boards/ReadAwayBoard.svelte';

/** W3 player boards. */
export const playerBoards: Record<string, Component> = {
  B1Listen: B1ListenBoard,
  B1Read: B1ReadBoard,
  B1ReadControls: B1ReadControlsBoard,
  BarExpanded: BarExpandedBoard,
  ReadAway: ReadAwayBoard,
  B1Tablet: B1TabletBoard,
  B1TabletListen: B1TabletListenBoard,
  B1TabletRead: B1TabletReadBoard,
  /** not a design board: the screen with a stand-in engine, to try by hand and in tests */
  PlayerDemo: PlayerDemoBoard,
};

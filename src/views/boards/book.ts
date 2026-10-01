import type { Component } from 'svelte';
import BookChaptersBoard from '../book/boards/BookChaptersBoard.svelte';
import BookRunningBoard from '../book/boards/BookRunningBoard.svelte';
import BookTabletBoard from '../book/boards/BookTabletBoard.svelte';
import BookTopBoard from '../book/boards/BookTopBoard.svelte';
import PlanFreeBoard from '../book/boards/PlanFreeBoard.svelte';

/** W2 book boards: BookTop, BookChapters, BookRunning, BookTablet, PlanFree. */
export const bookBoards: Record<string, Component> = {
  BookTop: BookTopBoard,
  BookChapters: BookChaptersBoard,
  BookRunning: BookRunningBoard,
  BookTablet: BookTabletBoard,
  PlanFree: PlanFreeBoard,
};

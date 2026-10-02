import type { Component } from 'svelte';
import BookMenu from '../manage/boards/BookMenu.svelte';
import DeleteConfirm from '../manage/boards/DeleteConfirm.svelte';
import DeleteUndo from '../manage/boards/DeleteUndo.svelte';
import FreeSpace from '../manage/boards/FreeSpace.svelte';
import ServerName from '../manage/boards/ServerName.svelte';

/** W6 boards: BookMenu, FreeSpace, DeleteConfirm, DeleteUndo, ServerName. */
export const manageBoards: Record<string, Component> = { BookMenu, FreeSpace, DeleteConfirm, DeleteUndo, ServerName };

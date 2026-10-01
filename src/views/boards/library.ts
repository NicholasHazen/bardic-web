import type { Component } from 'svelte';
import HomeBoard from '../library/boards/HomeBoard.svelte';
import HomeEmptyBoard from '../library/boards/HomeEmptyBoard.svelte';
import HomeTabletBoard from '../library/boards/HomeTabletBoard.svelte';
import ImportBoard from '../library/boards/ImportBoard.svelte';
import LibraryBoard from '../library/boards/LibraryBoard.svelte';
import LibraryDuplicateBoard from '../library/boards/LibraryDuplicateBoard.svelte';
import LibraryTabletBoard from '../library/boards/LibraryTabletBoard.svelte';
import ManageBoard from '../library/boards/ManageBoard.svelte';

/** W1 library boards: HomeEmpty, Home, HomeTablet, Library, LibraryDuplicate, LibraryTablet, Import, Manage. */
export const libraryBoards: Record<string, Component> = {
  Home: HomeBoard,
  HomeEmpty: HomeEmptyBoard,
  HomeTablet: HomeTabletBoard,
  Library: LibraryBoard,
  LibraryDuplicate: LibraryDuplicateBoard,
  LibraryTablet: LibraryTabletBoard,
  Import: ImportBoard,
  Manage: ManageBoard,
};

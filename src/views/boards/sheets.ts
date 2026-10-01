import type { Component } from 'svelte';
import BookSearch from '../sheets/boards/BookSearch.svelte';
import ChaptersSheet from '../sheets/boards/ChaptersSheet.svelte';
import EndOfBook from '../sheets/boards/EndOfBook.svelte';
import FirstPlay from '../sheets/boards/FirstPlay.svelte';
import NoVoice from '../sheets/boards/NoVoice.svelte';
import PlaceConflict from '../sheets/boards/PlaceConflict.svelte';
import ReaderAppearance from '../sheets/boards/ReaderAppearance.svelte';
import ReaderAppearanceTablet from '../sheets/boards/ReaderAppearanceTablet.svelte';
import SearchEmpty from '../sheets/boards/SearchEmpty.svelte';
import SleepTimer from '../sheets/boards/SleepTimer.svelte';
import SpeedSheet from '../sheets/boards/SpeedSheet.svelte';

/** W3 sheets boards: ReaderAppearance, ReaderAppearanceTablet, SleepTimer, ChaptersSheet, SpeedSheet, BookSearch, SearchEmpty, PlaceConflict, EndOfBook, FirstPlay, NoVoice. */
export const sheetsBoards: Record<string, Component> = {
  ReaderAppearance,
  ReaderAppearanceTablet,
  SleepTimer,
  ChaptersSheet,
  SpeedSheet,
  BookSearch,
  SearchEmpty,
  PlaceConflict,
  EndOfBook,
  FirstPlay,
  NoVoice,
};

// The book page (W2): the presentational views the boards render, and the connected screen.
//
// Wiring (the integrator): hash route `#/book/<id>` -> `<BookScreen bookId={id} onswitchlistener={...} />`.
// BookScreen draws its own app frame (Shell, active tab Library) because the page takes its colours from
// the book's cover; do not wrap it in another Shell. Listen / Continue listening goes to `#/listen/<id>` (W3).
export { default as BookScreen } from './BookScreen.svelte';
export { default as BookView } from './BookView.svelte';
export { default as AudiobookCard } from './AudiobookCard.svelte';
export { default as ChapterList } from './ChapterList.svelte';
export { default as MakeReadySheet } from './MakeReadySheet.svelte';
export type { AudiobookCardModel, BookHeaderModel, ChaptersModel, MakeSheetModel, OtherAudiobookModel } from './types';

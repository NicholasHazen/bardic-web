/** A chapter shown in the audio scope picker; text and identifiers come directly from the server. */
export interface ChapterSelectionItem {
  id: string;
  title: string;
  ready: boolean;
  matter?: boolean;
}

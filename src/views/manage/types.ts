import type { Money } from '../../lib/money';

/** What making an audiobook again would cost, as getAudiobookSpace reports it (null: a free voice). */
export interface RemakeEstimate {
  low: Money;
  likely: Money;
  high: Money;
  basis: 'provider' | 'manual' | 'unknown';
}

/** One audiobook in the Free up space sheet and in the delete list. */
export interface SpaceRow {
  id: string;
  name: string;
  premium: boolean;
  chaptersReady: number;
  chaptersTotal: number;
  /** Bytes of audio on the server; null while it is not known. */
  bytes: number | null;
  /** Only for a premium voice. */
  remake?: RemakeEstimate | null;
}

export interface WarningText {
  title: string;
  body: string;
}

export interface DeleteRow {
  title: string;
  detail: string;
}

export interface PendingDeletion {
  bookId: string;
  /** The title as the listener last saw it; empty when this device only learned of the deletion. */
  title: string;
  executesAt: string;
  /** The length of the wait the server set (60 s): the countdown never shows more than this. */
  totalSeconds?: number;
}

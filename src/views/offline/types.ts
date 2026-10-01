// View models of the offline screens that OfflineState does not carry.

/** A chapter the listener can pick in the Download sheet: only chapters that are ready on the Bardic computer can be downloaded. */
export interface PickChapter {
  id: string;
  /** the number shown, from 1 */
  number: number;
  title: string;
  bytes: number | null;
  /** already on this device */
  onDevice: boolean;
  /** ready on the Bardic computer (a chapter that is not ready cannot be chosen) */
  ready: boolean;
}

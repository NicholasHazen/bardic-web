/** What a listener screen needs to draw one listener. Built from the API's Listener by the connected wrappers. */
export interface ListenerRow {
  id: string;
  name: string;
  /** Avatar hue 0 to 359. */
  hue: number;
  /** "Listened today", "Not started yet". */
  detail: string;
}

/** A book on the stand-in Home drawn behind the switcher on the SwitchListener boards. */
export interface ShelfBook {
  title: string;
  second: string;
  color: string;
  onDevice?: boolean;
  progress?: number;
}

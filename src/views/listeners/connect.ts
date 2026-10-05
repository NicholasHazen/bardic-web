import { avatarHue, listenedLabel } from '../../lib/listenerText';
import type { ActionError, Listener } from '../../state/listener';
import type { ListenerRow } from './types';

/** The rows the screens draw, from the API's listeners. The avatar colour comes from the id (L3). */
export function rowsOf(listeners: readonly Listener[], now: Date = new Date()): ListenerRow[] {
  return listeners.map((l) => ({
    id: l.id,
    name: l.name,
    hue: avatarHue(l.id),
    detail: listenedLabel(l.last_listened_at, now),
  }));
}

/** What to tell the listener when saving a name failed. Says what was kept when the server was not reached. */
export function saveErrorText(e: ActionError): string {
  switch (e.code) {
    case 'name_taken':
      return 'Another listener already has that name.';
    case 'network':
      return 'Could not reach your Bardic computer. Nothing was saved.';
    case 'listener_not_found':
      return 'This listener was deleted on another device. Nothing was saved.';
    default:
      return e.detail;
  }
}

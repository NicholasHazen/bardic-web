// The name of the listener selected on this device, kept so the app can greet them when the Bardic computer cannot be reached
// (the list of listeners lives on the server).
const key = (listenerId: string) => `bardic.listenername.${listenerId}`;

export function rememberListenerName(storage: Pick<Storage, 'setItem'>, listenerId: string, name: string): void {
  try {
    storage.setItem(key(listenerId), name);
  } catch {
    /* the name is then blank away from home */
  }
}

export function listenerName(storage: Pick<Storage, 'getItem'>, listenerId: string): string {
  try {
    return storage.getItem(key(listenerId)) ?? '';
  } catch {
    return '';
  }
}

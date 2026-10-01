// Listener names and the words shown about listeners. Pure functions; no DOM, no network.
// The server is the authority (docs: names are 1 to 40 characters, unique ignoring case); these
// mirror its rules so the client can say so before asking: trim, count code points, no control
// characters, compare lower-cased.

export const NAME_MAX = 40;

export type NameProblem = 'empty' | 'too_long' | 'control';

/** The name as the server will store it. */
export function cleanName(raw: string): string {
  return raw.trim();
}

/** Length in Unicode code points of the trimmed name (not UTF-16 units). */
export function nameLength(raw: string): number {
  return [...cleanName(raw)].length;
}

/** Why a name cannot be sent, or null when it is acceptable. */
export function nameProblem(raw: string): NameProblem | null {
  const n = nameLength(raw);
  if (n === 0) return 'empty';
  if (n > NAME_MAX) return 'too_long';
  if (/\p{Cc}/u.test(cleanName(raw))) return 'control';
  return null;
}

export function nameProblemText(p: NameProblem): string {
  switch (p) {
    case 'empty':
      return 'Enter a name.';
    case 'too_long':
      return `Use ${NAME_MAX} characters or fewer.`;
    case 'control':
      return 'Names cannot contain line breaks or control characters.';
  }
}

/** The key names are compared by: trimmed and lower-cased, as the server does. */
export function nameKey(raw: string): string {
  return cleanName(raw).toLowerCase();
}

/** The other listener that already has this name (ignoring case), if any. `exceptId` is the one being renamed. */
export function findNameTaken<T extends { id: string; name: string }>(raw: string, listeners: readonly T[], exceptId?: string): T | undefined {
  const key = nameKey(raw);
  if (!key) return undefined;
  return listeners.find((l) => l.id !== exceptId && nameKey(l.name) === key);
}

/** First code point, upper-cased: the avatar letter. */
export function initialOf(name: string): string {
  const first = [...cleanName(name)][0];
  return first ? first.toUpperCase() : '?';
}

/** A stable hue 0 to 359 from a seed (the listener id, or the typed name while adding). */
export function avatarHue(seed: string): number {
  let h = 2166136261;
  for (const ch of seed) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 360;
}

const DAY = 86_400_000;

/** "Listened today", "Listened 3 days ago", "Not started yet". Calendar days in the local time zone. */
export function listenedLabel(iso: string | null, now: Date): string {
  if (!iso) return 'Not started yet';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return 'Not started yet';
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(then)) / DAY);
  if (days <= 0) return 'Listened today';
  if (days === 1) return 'Listened yesterday';
  if (days < 14) return `Listened ${days} days ago`;
  if (days < 30) return `Listened ${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return 'Listened last month';
  if (days < 365) return `Listened ${Math.floor(days / 30)} months ago`;
  return 'Listened over a year ago';
}

/** "Nick", "Nick and Riley", "Nick, Riley and Jo". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function booksStartedText(n: number): string {
  return n === 0 ? 'No books started.' : n === 1 ? '1 book started.' : `${n} books started.`;
}

/**
 * The message under a name field, or null. A name another listener has is reported first, then a
 * rule the name breaks. An empty field is not an error (the save button just waits).
 */
export function nameFeedback<T extends { id: string; name: string }>(raw: string, listeners: readonly T[], exceptId?: string): string | null {
  const taken = findNameTaken(raw, listeners, exceptId);
  if (taken) return `A listener called ${taken.name} already exists.`;
  const p = nameProblem(raw);
  if (p && p !== 'empty') return nameProblemText(p);
  return null;
}

// "When" text for a place: "3 min ago", "Today, 9:14 pm", "Yesterday, 9:40 pm", "Mon, 9:40 pm", "12 Mar, 9:40 pm".
// Local time of the device; `now` is passed in so tests use a fake clock.
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "9:40 pm" (12 hour clock, lower case). */
export function clockText(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

function dayNumber(d: Date): number {
  // whole local days, so a change of clock (summer time) cannot skew the count
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/** `then` and `now` are epoch milliseconds. A time in the future (clocks differ between devices) reads as "Just now". */
export function formatPlaceTime(then: number, now: number): string {
  const diff = now - then;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  const t = new Date(then);
  const n = new Date(now);
  const days = dayNumber(n) - dayNumber(t);
  const at = clockText(t);
  if (days <= 0) return `Today, ${at}`;
  if (days === 1) return `Yesterday, ${at}`;
  if (days < 7) return `${DAYS[t.getDay()]}, ${at}`;
  const date = `${t.getDate()} ${MONTHS[t.getMonth()]}`;
  return t.getFullYear() === n.getFullYear() ? `${date}, ${at}` : `${date} ${t.getFullYear()}, ${at}`;
}

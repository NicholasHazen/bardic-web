/** Arrow keys inside a radiogroup of buttons: move to the neighbour, choose it and focus it (Home and End too). */
export function radioKeydown(e: KeyboardEvent, choose: (index: number) => void): void {
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  const el = e.currentTarget as HTMLElement;
  const group = el.closest('[role="radiogroup"]');
  if (!group) return;
  const items = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]:not([disabled])'));
  const at = items.indexOf(el);
  if (at < 0) return;
  e.preventDefault();
  let to = at;
  if (e.key === 'Home') to = 0;
  else if (e.key === 'End') to = items.length - 1;
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = (at + 1) % items.length;
  else to = (at - 1 + items.length) % items.length;
  choose(to);
  items[to]!.focus();
}

/** Which radio takes the tab stop: the chosen one, otherwise the first. */
export const tabStop = (index: number, chosen: number): 0 | -1 => (chosen >= 0 ? (index === chosen ? 0 : -1) : index === 0 ? 0 : -1);

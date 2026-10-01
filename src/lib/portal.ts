/**
 * Svelte action: move the node to <body> while it is mounted, so a sheet drawn by a screen that sits inside the Shell is
 * above the tab bar. The node is put back (and removed with its component) when the component is destroyed.
 */
export function portal(node: HTMLElement): { destroy(): void } {
  document.body.appendChild(node);
  return { destroy: () => node.remove() };
}

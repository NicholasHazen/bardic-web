<script lang="ts" module>
  /** Icon bodies, 24x24 grid, stroke 1.75 (copied from the design canvas). Static, trusted markup. */
  const bodies = {
    play: '<path d="m8 5 11 7-11 7z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
    'back-15':
      '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 3.5v3.7h3.7"/><text x="12.2" y="15.4" text-anchor="middle" font-size="9" font-weight="600" font-family="-apple-system, sans-serif" stroke="none" fill="currentColor">15</text>',
    'forward-15':
      '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 3.5v3.7h-3.7"/><text x="11.8" y="15.4" text-anchor="middle" font-size="9" font-weight="600" font-family="-apple-system, sans-serif" stroke="none" fill="currentColor">15</text>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'skip-back': '<path d="M5 5v14M19 5v14L8 12z"/>',
    'skip-forward': '<path d="M19 5v14M5 5v14l11-7z"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="5" cy="6" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="5" cy="18" r="1.5"/>',
  } as const;

  export type IconName = keyof typeof bodies;
  const filled: ReadonlySet<string> = new Set(['play', 'pause']);
</script>

<script lang="ts">
  interface Props {
    name: IconName;
    size?: number;
    /** Accessible name. Leave out when a button around the icon already has one. */
    label?: string;
  }
  let { name, size = 22, label }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={filled.has(name) ? 'currentColor' : 'none'}
  stroke="currentColor"
  stroke-width="1.75"
  stroke-linecap="round"
  stroke-linejoin="round"
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
  style="flex-shrink: 0"
>
  {@html bodies[name]}
</svg>

<script lang="ts" module>
  /** Interface glyphs for the voice and settings screens (24 grid, stroke 1.75), copied from the design canvas. */
  const bodies = {
    play: '<path d="m8 5 11 7-11 7z"/>',
    stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    next: '<path d="m9 6 6 6-6 6"/>',
    sparkle: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 2v4M18 4h4"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
    server: '<path d="M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01"/>',
    wave: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>',
    headphones: '<path d="M4 14v-3a8 8 0 0 1 16 0v3M4 12h3v8H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2ZM20 12h-3v8h3a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z"/>',
    wallet: '<path d="M4 7h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 7l1-2h11M16 13h2"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    textsize: '<path d="M3 18 8 6l5 12M4.8 14h6.4M14 18l3.5-8 3.5 8M15.2 15.4h4.6"/>',
  } as const;
  export type GlyphName = keyof typeof bodies;
</script>

<script lang="ts">
  interface Props {
    name: GlyphName;
    size?: number;
    /** Stroke colour; defaults to the surrounding text colour. */
    color?: string;
    filled?: boolean;
  }
  let { name, size = 22, color = 'currentColor', filled = false }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={filled ? 'currentColor' : 'none'}
  stroke={color}
  stroke-width="1.75"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  style="flex-shrink: 0"
>
  {@html bodies[name]}
</svg>

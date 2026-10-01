<script lang="ts" module>
  /** Interface glyphs used by the listener screens (24 grid, stroke 1.75), copied from the design canvas. */
  const bodies = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="m9 6 6 6-6 6"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    book: '<path d="M3 4.5c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2zM12 6.5v15"/>',
    home: '<path d="M4 11l8-7 8 7M6 10v10h12V10M10 20v-6h4v6"/>',
    library: '<path d="M4 4h3v16H4zM10 4h3v16h-3zM16.5 5l3-.8 3.5 15-3 .8z"/>',
    settings: '<path d="M4 7h16M4 17h16M8 4v6M16 14v6"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    play: '<path d="m8 5 11 7-11 7z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
  } as const;
  export type GlyphName = keyof typeof bodies;
</script>

<script lang="ts">
  interface Props {
    name: GlyphName;
    size?: number;
    fill?: boolean;
  }
  let { name, size = 22, fill = false }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={fill ? 'currentColor' : 'none'}
  stroke="currentColor"
  stroke-width="1.75"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  style="flex-shrink: 0; display: block"
>
  {@html bodies[name]}
</svg>

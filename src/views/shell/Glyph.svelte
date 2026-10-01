<script lang="ts" module>
  /** Extra icon bodies for the shell and library screens (24 x 24 grid, stroke 1.75, copied from the design canvas). */
  const bodies = {
    home: '<path d="M4 11l8-7 8 7M6 10v10h12V10M10 20v-6h4v6"/>',
    library: '<path d="M4 4h3v16H4zM10 4h3v16h-3zM16.5 5l3-.8 3.5 15-3 .8z"/>',
    settings: '<path d="M4 7h16M4 17h16M8 4v6M16 14v6"/>',
    book: '<path d="M3 4.5c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2zM12 6.5v15"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    upload: '<path d="M12 16V3M7 8l5-5 5 5M4 16v5h16v-5"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    file: '<path d="M6 3h8l5 5v13H6zM14 3v5h5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    leaf: '<path d="M20 3C9 3 3 7 3 13a7 7 0 0 0 7 7c6 0 10-6 10-17ZM3 21 15 9"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    play: '<path d="m8 5 11 7-11 7z"/>',
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
    label?: string;
  }
  let { name, size = 22, color = 'currentColor', filled = false, label }: Props = $props();
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
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
  style="flex-shrink: 0"
>
  {@html bodies[name]}
</svg>

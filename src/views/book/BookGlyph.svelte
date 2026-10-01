<script lang="ts" module>
  /** Icons only the book page uses (24 x 24 grid, stroke 1.75, copied from the design canvas). */
  const bodies = {
    sparkle: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 2v4M18 4h4"/>',
    headphones: '<path d="M4 14v-3a8 8 0 0 1 16 0v3M4 12h3v8H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2ZM20 12h-3v8h3a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z"/>',
    next: '<path d="m9 6 6 6-6 6"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
  } as const;
  export type BookGlyphName = keyof typeof bodies;
</script>

<script lang="ts">
  interface Props {
    name: BookGlyphName;
    size?: number;
    color?: string;
  }
  let { name, size = 18, color = 'currentColor' }: Props = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink: 0">
  {@html bodies[name]}
</svg>

<script lang="ts" module>
  /** The two glyphs the Now Playing screens need beyond Icon.svelte (24 grid, stroke 1.75, copied from the design canvas). */
  const bodies = {
    'text-size': '<path d="M3 18 8 6l5 12M4.8 14h6.4M14 18l3.5-8 3.5 8M15.2 15.4h4.6"/>',
    voice: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>',
  } as const;
  export type GlyphName = keyof typeof bodies;
</script>

<script lang="ts">
  interface Props {
    name: GlyphName;
    size?: number;
  }
  let { name, size = 22 }: Props = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink: 0">
  {@html bodies[name]}
</svg>

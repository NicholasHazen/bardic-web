<script lang="ts" module>
  /** Icon bodies for the offline screens (24 x 24 grid, stroke 1.75, copied from the design canvas). */
  const bodies = {
    'wifi-off': '<path d="M3 3l18 18M7 18a4 4 0 0 1-.6-7.9M9.5 6.3A6 6 0 0 1 18 10a4 4 0 0 1 2 7.3"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
  } as const;
  export type OfflineGlyphName = keyof typeof bodies;
</script>

<script lang="ts">
  interface Props {
    name: OfflineGlyphName;
    size?: number;
    /** Stroke colour; defaults to the surrounding text colour. */
    color?: string;
  }
  let { name, size = 18, color = 'currentColor' }: Props = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink: 0">
  {@html bodies[name]}
</svg>

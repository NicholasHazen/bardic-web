<script lang="ts" module>
  /** Glyphs of the management screens that the shared sets do not have (24 grid, stroke 1.75, from the design canvas). */
  const bodies = {
    check: '<path d="m5 12 4 4L19 6"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
  } as const;
  export type ManageGlyphName = keyof typeof bodies;
</script>

<script lang="ts">
  interface Props {
    name: ManageGlyphName;
    size?: number;
    color?: string;
  }
  let { name, size = 18, color = 'currentColor' }: Props = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink: 0">
  {@html bodies[name]}
</svg>

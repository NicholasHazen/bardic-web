<script lang="ts" module>
  const bodies = {
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="5" cy="6" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="5" cy="18" r="1.5"/>',
    wallet: '<path d="M4 7h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 7l1-2h11M16 13h2"/>',
    warning: '<path d="M12 4 3 20h18zM12 10v4.5M12 17.3v.4"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    headphones: '<path d="M4 14v-3a8 8 0 0 1 16 0v3M4 12h3v8H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2ZM20 12h-3v8h3a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="m8 5 11 7-11 7z"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.5"/>',
  } as const;
  export type PlanGlyphName = keyof typeof bodies;
</script>

<script lang="ts">
  interface Props {
    name: PlanGlyphName;
    size?: number;
    color?: string;
  }
  let { name, size = 18, color = 'currentColor' }: Props = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink: 0">
  {@html bodies[name]}
</svg>

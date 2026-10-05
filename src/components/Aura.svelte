<script lang="ts" module>
  export interface Glow {
    x: number;
    y: number;
    size: number;
    color: string;
    opacity: number;
    blur: number;
  }
  /** The three coral/amber glows used on phone screens (390 x 844). */
  export const PHONE_GLOWS: Glow[] = [
    { x: -90, y: -80, size: 380, color: 'var(--glow)', opacity: 0.55, blur: 90 },
    { x: 195, y: 506, size: 360, color: 'var(--glow2)', opacity: 0.42, blur: 100 },
    { x: -60, y: 658, size: 280, color: 'var(--glow)', opacity: 0.22, blur: 90 },
  ];
</script>

<script lang="ts">
  interface Props {
    glows?: Glow[];
  }
  let { glows = PHONE_GLOWS }: Props = $props();
</script>

<!-- Blurred circles over the base colour. The parent must be position: relative with overflow hidden. -->
{#each glows as g}
  <div
    class="glow"
    aria-hidden="true"
    style:left="{g.x}px"
    style:top="{g.y}px"
    style:width="{g.size}px"
    style:height="{g.size}px"
    style:background={g.color}
    style:opacity={g.opacity}
    style:filter="blur({g.blur}px)"
  ></div>
{/each}

<style>
  .glow { position: absolute; border-radius: 50%; pointer-events: none; }
</style>

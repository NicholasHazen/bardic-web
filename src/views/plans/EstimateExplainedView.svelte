<script lang="ts">
  import Badge from '../../components/Badge.svelte';
  import Button from '../../components/Button.svelte';
  import Glass from '../../components/Glass.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import PlanGlyph, { type PlanGlyphName } from './PlanGlyph.svelte';
  import type { ExplainedModel } from './types';

  /**
   * How an estimate works ([EstimateExplained], PL1): what Bardic knows, what it assumes, what can differ and what is
   * unknown. Opened from "Why a range?" on the plan sheet; "Got it" goes back to the plan.
   */
  interface Props {
    model: ExplainedModel;
    onclose?: () => void;
    placement?: 'bottom' | 'popover';
    fixed?: boolean;
    scrim?: number;
  }
  let { model, onclose, placement = 'bottom', fixed = false, scrim }: Props = $props();

  const icons: Record<string, PlanGlyphName> = { knows: 'list', assumes: 'wallet', differ: 'warning', unknown: 'check' };
</script>

<Sheet title="How this estimate works" eyebrow="Make ready" {onclose} {placement} {fixed} {scrim}>
  <div class="top">
    <div class="range">
      <span class="cost">{model.cost}</span>
      <span class="likely">{model.likely}</span>
    </div>
    <Badge tone="paid">Estimate</Badge>
  </div>
  <Glass radius={16} style="overflow: hidden; flex-shrink: 0">
    <ul>
      {#each model.points as p (p.id)}
        <li>
          <div class="icon"><PlanGlyph name={icons[p.id] ?? 'list'} color="var(--ink)" /></div>
          <div class="text">
            <span class="head">{p.title}</span>
            <span class="body">{p.text}</span>
          </div>
        </li>
      {/each}
    </ul>
  </Glass>
  <Button size={52} style="width: 100%" onclick={() => onclose?.()}>Got it</Button>
</Sheet>

<style>
  span { line-height: 1.35; }
  .top { display: flex; align-items: center; gap: 10px; }
  .range { display: flex; flex-direction: column; gap: 2px; flex: 1; }
  .cost { font-size: 26px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; }
  .likely { font-size: 13px; font-weight: 400; color: var(--muted); }
  ul { list-style: none; margin: 0; padding: 0; }
  li { min-height: 78px; display: flex; align-items: center; gap: 12px; padding: 10px 14px; box-sizing: border-box; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  li:last-child { border-bottom: 0; }
  .icon { width: 34px; height: 34px; border-radius: 10px; background: rgba(255, 255, 255, 0.1); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .head { font-size: 14px; font-weight: 700; color: var(--ink); }
  .body { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.45; }
</style>

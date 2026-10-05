<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import Slider from '../../components/Slider.svelte';
  import { radioKeydown, tabStop } from './radioNav';
  import { SPEED_CHOICES, SPEED_MAX, SPEED_MIN, SPEED_STEP, clampSpeed, nudgeSpeed, speedText } from './speed';

  /**
   * Playback speed ([SpeedSheet]): the speed in large type, a fine adjust (slider and plus or minus, steps of 0.05)
   * and eight quick choices. Controlled by `speed`; each change calls `onchange(speed)`.
   */
  interface Props {
    speed: number;
    placement?: 'bottom' | 'popover';
    fixed?: boolean;
    onchange?: (speed: number) => void;
    onclose?: () => void;
  }
  let { speed, placement = 'bottom', fixed = false, onchange, onclose }: Props = $props();

  const chosen = $derived(SPEED_CHOICES.findIndex((c) => Math.abs(c - speed) < 1e-9));
  const pick = (v: number) => onchange?.(clampSpeed(v));
</script>

<Sheet title="Playback speed" eyebrow="Listen" {placement} {fixed} scrim={fixed ? 0.3 : undefined} {onclose}>
  <div class="dial">
    <span class="big" aria-live="polite">{speedText(speed)}</span>
    <div class="fine">
      <Button variant="glass" aria-label="Slower" disabled={speed <= SPEED_MIN} style="height:48px;border-radius:24px;width:56px;padding:0;font-size:22px" onclick={() => pick(nudgeSpeed(speed, -1))}>&minus;</Button>
      <Slider value={speed} min={SPEED_MIN} max={SPEED_MAX} step={SPEED_STEP} label="Playback speed" valueText="{Number(speed.toFixed(2))} times" onchange={pick} />
      <Button variant="glass" aria-label="Faster" disabled={speed >= SPEED_MAX} style="height:48px;border-radius:24px;width:56px;padding:0;font-size:22px" onclick={() => pick(nudgeSpeed(speed, 1))}>+</Button>
    </div>
  </div>
  <div class="chips" role="radiogroup" aria-label="Quick speeds">
    {#each SPEED_CHOICES as c, i (c)}
      <button
        type="button"
        role="radio"
        aria-checked={i === chosen}
        tabindex={tabStop(i, chosen)}
        class:on={i === chosen}
        onclick={() => pick(c)}
        onkeydown={(e) => radioKeydown(e, (n) => pick(SPEED_CHOICES[n]!))}>{speedText(c)}</button
      >
    {/each}
  </div>
  <span class="note">Applies to every book on this device. Audio already made stays.</span>
  <Button size={52} style="width:100%" onclick={() => onclose?.()}>Done</Button>
</Sheet>

<style>
  .dial { display: flex; flex-direction: column; gap: 12px; }
  .big { font-size: 44px; font-weight: 700; color: var(--ink); line-height: 1.35; text-align: center; letter-spacing: -0.02em; }
  .fine { display: flex; align-items: center; gap: 12px; }
  .chips { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .chips button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: content-box; /* as the design: 48px plus the 1px edge */
    height: 48px;
    padding: 0;
    border-radius: 24px;
    font-family: var(--font-ui);
    font-size: 15px;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.09);
    color: var(--ink);
    border: 1px solid var(--edge);
    cursor: pointer;
  }
  .chips button.on { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); border: 1.5px solid var(--accent); }
  .chips button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .note { font-size: 13px; font-weight: 400; color: var(--muted); line-height: 1.35; text-align: center; }
</style>

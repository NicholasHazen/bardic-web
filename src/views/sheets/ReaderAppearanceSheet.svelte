<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Popover from '../../components/Popover.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import Slider from '../../components/Slider.svelte';
  import {
    PAGE_WIDTHS,
    PAGE_WIDTH_LABELS,
    SIZE_MAX,
    SIZE_MIN,
    SPACING_CHOICES,
    THEME_CHOICES,
    clampSize,
    nearestSpacing,
    stepSize,
    type PageWidth,
    type ReaderAppearanceValue,
    type ReaderExtras,
    type ReaderTheme,
  } from './appearance';
  import { radioKeydown, tabStop } from './radioNav';
  import Seg from './Seg.svelte';
  import SwitchRow from './SwitchRow.svelte';

  /**
   * Reader appearance ([ReaderAppearance], [ReaderAppearanceTablet]): colour, text size, font, line spacing and the
   * reading switches. Controlled: it shows `value` and `extras` and reports each change; the owner keeps them (and
   * saves them per device with `saveAppearance`). A bottom sheet on a phone, a floating card beside the reader on a
   * tablet (`placement="popover"`, which also offers the page width).
   */
  interface Props {
    value: ReaderAppearanceValue;
    extras: ReaderExtras;
    placement?: 'bottom' | 'popover';
    /** CSS position of the popover, e.g. "right:40px;top:96px;width:380px". */
    popoverStyle?: string;
    /** Position against the viewport (the app) instead of the nearest positioned parent (design boards). */
    fixed?: boolean;
    /** Offer "Dim the aura" (ReaderAppearance.dimAura). The boards do not show it, so it is off by default. */
    showDimAura?: boolean;
    onchange?: (value: ReaderAppearanceValue) => void;
    onextras?: (extras: ReaderExtras) => void;
    onclose?: () => void;
  }
  let { value, extras, placement = 'bottom', popoverStyle = 'right:40px;top:96px;width:380px', fixed = false, showDimAura = false, onchange, onextras, onclose }: Props = $props();

  const popover = $derived(placement === 'popover');
  const spacing = $derived(nearestSpacing(value.spacing));
  const themeAt = $derived(THEME_CHOICES.findIndex((t) => t.id === value.theme));

  const set = (patch: Partial<ReaderAppearanceValue>) => onchange?.({ ...value, ...patch });
  const setExtras = (patch: Partial<ReaderExtras>) => onextras?.({ ...extras, ...patch });
  const pickTheme = (i: number) => set({ theme: THEME_CHOICES[i]!.id as ReaderTheme });
</script>

{#snippet label(text: string)}<span class="label">{text}</span>{/snippet}

{#snippet body()}
  <div class="stack" class:pop={popover}>
    <div class="section">
      {@render label('Colour')}
      <div class="swatches" role="radiogroup" aria-label="Colour">
        {#each THEME_CHOICES as t, i (t.id)}
          <button
            type="button"
            class="swatch"
            role="radio"
            aria-checked={t.id === value.theme}
            aria-label={t.label}
            tabindex={tabStop(i, themeAt)}
            onclick={() => set({ theme: t.id })}
            onkeydown={(e) => radioKeydown(e, pickTheme)}
          >
            <span class="chip" class:on={t.id === value.theme} style:background={t.background}>
              {#if t.id === 'dark'}<span class="glow"></span>{/if}
              <span class="aa" style:color={t.ink}>Aa</span>
            </span>
            <span class="name" class:on={t.id === value.theme}>{t.label}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="section">
      {@render label(`Text size · ${value.size}`)}
      <div class="sizer">
        <Button variant="glass" aria-label="Smaller text" disabled={value.size <= SIZE_MIN} style="width:{popover ? 52 : 56}px;padding:0;font-size:14px" onclick={() => set({ size: stepSize(value.size, -1) })}>A&minus;</Button>
        <Slider
          value={value.size}
          min={SIZE_MIN}
          max={SIZE_MAX}
          step={1}
          label="Text size"
          valueText="{value.size} pixels"
          onchange={(n) => set({ size: clampSize(n) })}
        />
        <Button variant="glass" aria-label="Larger text" disabled={value.size >= SIZE_MAX} style="width:{popover ? 52 : 56}px;padding:0;font-size:{popover ? 14 : 19}px" onclick={() => set({ size: stepSize(value.size, 1) })}>A+</Button>
      </div>
    </div>

    <div class="section">
      {@render label('Font')}
      <Seg
        label="Font"
        raised
        value={value.font}
        options={[
          { value: 'serif', label: 'Serif' },
          { value: 'sans', label: 'Sans' },
        ]}
        onchange={(v) => set({ font: v === 'sans' ? 'sans' : 'serif' })}
      />
    </div>

    <div class="section">
      {@render label('Line spacing')}
      <Seg
        label="Line spacing"
        raised
        value={spacing.label}
        options={SPACING_CHOICES.map((c) => ({ value: c.label, label: c.label }))}
        onchange={(v) => set({ spacing: SPACING_CHOICES.find((c) => c.label === v)?.value ?? value.spacing })}
      />
    </div>

    {#if popover}
      <div class="section">
        {@render label('Page width')}
        <Seg
          label="Page width"
          raised
          fontSize={12}
          value={extras.pageWidth}
          options={PAGE_WIDTHS.map((w) => ({ value: w, label: PAGE_WIDTH_LABELS[w] }))}
          onchange={(v) => setExtras({ pageWidth: v as PageWidth })}
        />
      </div>
    {/if}

    <div class="toggles">
      <SwitchRow label="Follow the narration" detail={popover ? undefined : 'The page scrolls to the passage being read'} checked={extras.followNarration} onchange={(c) => setExtras({ followNarration: c })} />
      <SwitchRow label="Keep the screen on while listening" detail={popover ? undefined : 'Only while the reader is open'} checked={extras.keepScreenOn} onchange={(c) => setExtras({ keepScreenOn: c })} />
      {#if showDimAura}
        <SwitchRow label="Dim the aura" detail={popover ? undefined : 'Quieter colour behind the text'} checked={value.dimAura} onchange={(c) => set({ dimAura: c })} />
      {/if}
    </div>
  </div>
{/snippet}

{#if popover}
  <Popover title="Text and colour" eyebrow="Reader" style={popoverStyle} {fixed} {onclose}>
    {@render body()}
  </Popover>
{:else}
  <Sheet title="Text and colour" eyebrow="Reader" {fixed} {onclose}>
    {@render body()}
    <Button size={52} style="width:100%" onclick={() => onclose?.()}>Done</Button>
  </Sheet>
{/if}

<style>
  .stack { display: flex; flex-direction: column; gap: 18px; }
  /* In the floating card the sections share the card's own 16 px rhythm. */
  .stack.pop { display: contents; }
  .section { display: flex; flex-direction: column; gap: 8px; }
  .label { font-size: 12px; font-weight: 700; color: var(--muted); line-height: 1.35; letter-spacing: 0.1em; text-transform: uppercase; }
  .swatches { display: flex; align-items: center; gap: 8px; }
  .swatch { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; padding: 0; border: 0; background: none; cursor: pointer; font-family: var(--font-ui); }
  .chip { width: 100%; height: 58px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.22); display: flex; align-items: center; justify-content: center; box-sizing: border-box; position: relative; overflow: hidden; }
  .chip.on { border: 2px solid var(--accent); }
  .glow { position: absolute; left: -10px; top: -10px; width: 40px; height: 40px; border-radius: 50%; background: var(--glow); opacity: 0.6; filter: blur(10px); }
  .aa { font-family: var(--font-book); font-size: 22px; font-weight: 600; position: relative; }
  .name { font-size: 11px; font-weight: 500; color: var(--muted); line-height: 1.35; text-align: center; }
  .name.on { font-weight: 700; color: var(--ink); }
  .swatch:focus-visible .chip { outline: 2px solid var(--accent); outline-offset: 2px; }
  .sizer { display: flex; align-items: center; gap: 12px; }
  .toggles { display: flex; flex-direction: column; gap: 14px; }
  .stack.pop .toggles { display: contents; }
</style>

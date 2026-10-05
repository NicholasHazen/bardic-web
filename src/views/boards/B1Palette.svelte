<script lang="ts">
  import { derivePalette } from '../../theme/derive';

  // The four covers the board shows. Hue is taken from the cover colour.
  const hueOf = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  const covers = [
    { title: 'The Ash Ledger', hex: '#c65a43' },
    { title: 'Lanternfall', hex: '#3f6f8f' },
    { title: 'Hollow Tide', hex: '#4c7a5a' },
    { title: 'Winterhouse', hex: '#6b5a8c' },
  ].map((c) => ({
    ...c,
    p: derivePalette({ hex: c.hex, hue: hueOf(c.hex), saturation: 0.5, lightness: 0.5, vivid: true }),
  }));
  const rules = [
    ['1 · Hue', 'The cover’s dominant hue, sampled once and stored with the cover.'],
    ['2 · Base and glows', 'Base at 7.5% lightness. Glows at 55% and, shifted +40° in hue, 50%. Both blurred.'],
    ['3 · Accent', 'The hue lifted in lightness until it reaches 7:1 against the base.'],
    ['4 · Fallback', 'Covers with no usable colour use the default coral. Text stays warm white; Read mode dims the aura further.'],
  ];
</script>

<div class="board">
  <div class="wash"></div>
  <div class="content">
    <div class="head">
      <span class="title">Palette comes from the cover</span>
      <span class="sub">Four covers run through the same rules. The numbers are computed, not chosen by hand.</span>
    </div>
    <div class="covers">
      {#each covers as c}
        <div class="cover">
          <span class="name">{c.title}</span>
          <div class="aura" style:background={c.p.base}>
            <div class="g1" style:background={c.p.glow}></div>
            <div class="g2" style:background={c.p.glow2}></div>
            <div class="center">
              <div class="art" style:background={c.hex}></div>
              <div class="dot" style:background={c.p.accent} style:box-shadow="0 0 22px {c.p.accent}88"></div>
            </div>
          </div>
          <div class="swatches">
            {#each [['base', c.p.base], ['glow', c.p.glow], ['glow 2', c.p.glow2], ['accent', c.p.accent]] as [label, hex]}
              <div class="sw">
                <div class="chip" style:background={hex}></div>
                <span class="lab">{label}</span>
                <span class="hex">{hex}</span>
              </div>
            {/each}
          </div>
          <span class="ratio">Accent on base: {c.p.accentRatio.toFixed(1)}:1</span>
        </div>
      {/each}
    </div>
    <div class="rules">
      {#each rules as [h, t]}
        <div class="rule"><span class="rh">{h}</span><span class="rt">{t}</span></div>
      {/each}
    </div>
  </div>
</div>

<style>
  .board { box-sizing: border-box; width: 1280px; height: 860px; position: relative; overflow: hidden; background: #0e0c16; font-family: var(--font-ui); }
  .wash { position: absolute; left: -100px; top: -100px; width: 420px; height: 420px; border-radius: 50%; background: #6a4cff; opacity: 0.25; filter: blur(110px); }
  .content { box-sizing: border-box; padding: 48px; height: 860px; position: relative; display: flex; flex-direction: column; gap: 28px; }
  .head { display: flex; flex-direction: column; gap: 6px; }
  .title { font-size: 38px; font-weight: 700; letter-spacing: -0.02em; color: var(--ink); }
  .sub { font-size: 14px; color: var(--muted); }
  .covers { display: flex; align-items: flex-start; gap: 40px; }
  .cover { display: flex; flex-direction: column; gap: 14px; width: 270px; }
  .name { font-size: 16px; font-weight: 700; color: var(--ink); }
  .aura { width: 180px; height: 260px; border-radius: 20px; position: relative; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.14); flex-shrink: 0; }
  .g1 { position: absolute; left: -40px; top: -40px; width: 170px; height: 170px; border-radius: 50%; opacity: 0.6; filter: blur(40px); }
  .g2 { position: absolute; left: 70px; top: 130px; width: 150px; height: 150px; border-radius: 50%; opacity: 0.45; filter: blur(40px); }
  .center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; }
  .art { width: 80px; height: 120px; border-radius: 8px; box-shadow: 0 12px 24px rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.18); }
  .dot { width: 44px; height: 44px; border-radius: 22px; }
  .swatches { display: flex; align-items: center; gap: 10px; }
  .sw { display: flex; flex-direction: column; gap: 4px; }
  .chip { width: 56px; height: 56px; border-radius: 14px; border: 1px solid rgba(255, 255, 255, 0.2); }
  .lab { font-size: 12px; font-weight: 600; color: var(--ink); }
  .hex { font-size: 11px; color: var(--muted); }
  .ratio { font-size: 13px; color: var(--muted); }
  .rules { display: flex; align-items: flex-start; gap: 28px; border-top: 1px solid rgba(255, 255, 255, 0.14); padding-top: 24px; }
  .rule { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
  .rh { font-size: 13px; font-weight: 700; color: #f68f79; }
  .rt { font-size: 14px; line-height: 1.45; color: var(--ink); }
</style>

<script lang="ts">
  import Aura, { type Glow } from '../../../components/Aura.svelte';
  import Cover from '../../../components/Cover.svelte';
  import IconButton from '../../../components/IconButton.svelte';
  import { book, readerLines, reader } from '../../../fixtures/sheets';

  /**
   * Now Playing in tablet landscape behind the reader appearance card: Listen on the left, Read on the right. A stand-in
   * drawn from fixtures for the design boards, not the real Now Playing screen (built separately).
   */
  const glows: Glow[] = [
    { x: -127, y: -113, size: 537, color: 'var(--glow)', opacity: 0.55, blur: 90 },
    { x: 597, y: 500, size: 509, color: 'var(--glow2)', opacity: 0.42, blur: 100 },
    { x: -84, y: 650, size: 396, color: 'var(--glow)', opacity: 0.22, blur: 90 },
  ];
  const tools = [
    { label: 'Sleep', icon: 'moon' },
    { label: 'Chapters', icon: 'list' },
  ] as const;
</script>

<Aura {glows} />
<div class="screen">
  <div class="listen">
    <div class="top"><IconButton label="Minimise" icon="chevron-down" /></div>
    <div class="mid">
      <Cover color={book.color} width={250} height={375} radius={10} pad={31} shadowY={26} shadowBlur={50} title={book.title} titleSize={32} />
      <div class="titles">
        <span class="t">{book.title}</span>
        <span class="c">Chapter 4 · {reader.title}</span>
      </div>
    </div>
    <div class="bottom">
      <div class="state"><span class="pill"><span class="dot"></span>Playing</span><span class="ahead">6 min ahead</span></div>
      <div class="scrub">
        <div class="track"><div class="fill"></div><div class="thumb"></div></div>
        <div class="times"><span class="l">4:12</span><span>~12:20 · 34% of book</span></div>
      </div>
      <div class="transport">
        <IconButton label="Previous chapter" icon="skip-back" size={52} />
        <IconButton label="Back 15 seconds" icon="back-15" size={52} />
        <IconButton label="Pause" icon="pause" tone="accent" size={76} iconSize={31} />
        <IconButton label="Forward 15 seconds" icon="forward-15" size={52} />
        <IconButton label="Next chapter" icon="skip-forward" size={52} />
      </div>
      <div class="tools">
        <div class="tool"><button type="button" class="speed" aria-label="Speed">1.25×</button><span>Speed</span></div>
        {#each tools as t}
          <div class="tool"><IconButton label={t.label} icon={t.icon} size={52} /><span>{t.label}</span></div>
        {/each}
        <div class="tool">
          <IconButton label="Samantha" icon="more" size={52} />
          <span>Samantha</span>
        </div>
      </div>
    </div>
  </div>
  <div class="read">
    <div class="rtop">
      <span class="eyebrow">{reader.eyebrow}</span>
      <button type="button" class="aa" aria-label="Text settings"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 18 8 6l5 12M4.8 14h6.4M14 18l3.5-8 3.5 8M15.2 15.4h4.6" /></svg></button>
    </div>
    <span class="rtitle">{reader.title}</span>
    {#each readerLines as line, i}
      <p><span class:now={i === 1} class:last={i === 3}>{line}</span></p>
    {/each}
  </div>
</div>

<style>
  .screen { position: relative; display: flex; align-items: stretch; height: 100%; font-family: var(--font-ui); color: var(--ink); }
  .listen { width: 480px; flex-shrink: 0; height: 100%; display: flex; flex-direction: column; box-sizing: border-box; }
  .top { padding: 14px 20px 0; }
  .mid { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; min-height: 0; }
  .titles { display: flex; flex-direction: column; gap: 6px; align-items: center; text-align: center; }
  .t { font-size: 32px; font-weight: 700; letter-spacing: -0.02em; color: var(--ink); }
  .c { font-family: var(--font-book); font-size: 19px; color: var(--muted); }
  .bottom { display: flex; flex-direction: column; gap: 14px; padding-bottom: 28px; }
  .state { display: flex; align-items: center; gap: 8px; justify-content: center; }
  .pill { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 12px; background: rgba(255, 255, 255, 0.12); color: var(--ink); font-size: 12px; font-weight: 600; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); display: inline-block; }
  .ahead { font-size: 12px; color: var(--muted); }
  .scrub { display: flex; flex-direction: column; gap: 6px; padding: 0 28px; }
  .track { height: 5px; border-radius: 3px; background: rgba(255, 255, 255, 0.2); position: relative; }
  .fill { position: absolute; left: 0; top: 0; bottom: 0; width: 34%; border-radius: 3px; background: var(--accent); }
  .thumb { position: absolute; left: 34%; top: -6px; width: 17px; height: 17px; margin-left: -8px; border-radius: 50%; background: #fff; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45); }
  .times { display: flex; align-items: center; }
  .times span { font-size: 12px; color: var(--muted); }
  .times .l { flex: 1; }
  .transport { display: flex; align-items: center; justify-content: space-between; padding: 0 24px; }
  .tools { display: flex; align-items: center; padding: 0 20px; }
  .tool { display: flex; flex-direction: column; gap: 6px; align-items: center; flex: 1; }
  .tool span { font-size: 12px; color: var(--muted); }
  .speed { width: 56px; height: 52px; border-radius: 26px; background: var(--glass-control); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); border: 1px solid var(--edge); color: var(--ink); padding: 0; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 6px 18px rgba(0, 0, 0, 0.25); font-family: var(--font-ui); font-size: 14px; font-weight: 700; }
  .read { background: rgba(14, 12, 22, 0.5); -webkit-backdrop-filter: blur(34px) saturate(1.7); backdrop-filter: blur(34px) saturate(1.7); border: 1px solid var(--edge); border-radius: 20px; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 20px 50px rgba(0, 0, 0, 0.4); box-sizing: border-box; flex: 1; min-width: 0; margin: 20px; padding: 28px 40px; overflow: hidden; display: flex; flex-direction: column; gap: 16px; }
  .rtop { display: flex; align-items: center; gap: 8px; }
  .eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); flex: 1; }
  .aa { width: 44px; height: 44px; border-radius: 22px; background: var(--glass-control); -webkit-backdrop-filter: blur(20px) saturate(1.7); backdrop-filter: blur(20px) saturate(1.7); border: 1px solid var(--edge); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 6px 18px rgba(0, 0, 0, 0.25); color: var(--ink); display: inline-flex; align-items: center; justify-content: center; padding: 0; }
  .rtitle { font-size: 35px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; color: var(--ink); }
  p { margin: 0; font-family: var(--font-book); font-size: 23px; line-height: 1.7; color: var(--ink); }
  p span { border-radius: 4px; -webkit-box-decoration-break: clone; box-decoration-break: clone; line-height: inherit; }
  .now { background: color-mix(in srgb, var(--accent) 18%, transparent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent); }
  .last { text-decoration: underline dotted var(--accent); text-underline-offset: 5px; }
</style>

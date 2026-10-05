<script lang="ts">
  import Aura from '../../components/Aura.svelte';
  import Avatar from '../../components/Avatar.svelte';
  import Button from '../../components/Button.svelte';
  import Cover from '../../components/Cover.svelte';
  import Glass from '../../components/Glass.svelte';
  import IconButton from '../../components/IconButton.svelte';
  import MiniPlayer from '../../components/MiniPlayer.svelte';
  import ProgressBar from '../../components/ProgressBar.svelte';
  import Glyph from './Glyph.svelte';
  import BackdropShelf from './BackdropShelf.svelte';
  import type { ShelfBook } from './types';
  import TabBar from './TabBar.svelte';
  import type { Glow } from '../../components/Aura.svelte';

  interface Props {
    layout: 'phone' | 'tablet';
    listenerName: string;
    listenerHue: number;
    onDevice: ShelfBook[];
    recent: ShelfBook[];
  }
  let { layout, listenerName, listenerHue, onDevice, recent }: Props = $props();

  const tabletGlows: Glow[] = [
    { x: -127, y: -113, size: 537, color: 'var(--glow)', opacity: 0.55, blur: 90 },
    { x: 597, y: 500, size: 509, color: 'var(--glow2)', opacity: 0.42, blur: 100 },
    { x: -84, y: 650, size: 396, color: 'var(--glow)', opacity: 0.22, blur: 90 },
  ];
  const rail = [
    { label: 'Home', icon: 'home', on: true },
    { label: 'Library', icon: 'library', on: false },
    { label: 'Settings', icon: 'settings', on: false },
  ] as const;
</script>

<!-- Home as it sits behind the listener switcher on the SwitchListener and SwitchTablet boards. A stand-in drawn from fixtures,
     not the real Home screen (built separately). -->
<div class="screen">
  {#if layout === 'phone'}
    <Aura />
    <div class="phone">
      <div class="top">
        <h1>Home</h1>
        <button type="button" class="who" aria-label="Listening as {listenerName}. Change listener" aria-haspopup="dialog">
          <Avatar name={listenerName} hue={listenerHue} size={40} />
        </button>
      </div>
      <Glass radius={20} style="margin:0 20px;padding:16px">
        <div class="cont">
          <Cover color="#c65a43" width={104} height={156} pad={13} title="The Ash Ledger" />
          <div class="info">
            <span class="eyebrow">Continue</span>
            <span class="ct">The Ash Ledger</span>
            <span class="cs">Chapter 4 · The Ferryman&rsquo;s Ledger</span>
            <ProgressBar value={0.34} height={4} />
            <div class="play">
              <IconButton label="Continue listening" icon="play" tone="accent" size={52} iconSize={22} />
              <span class="cs">34% · 6 min ahead</span>
            </div>
          </div>
        </div>
      </Glass>
      <BackdropShelf heading="On this device" count="{onDevice.length} books" books={onDevice} width={100} gap={14} pad={12} titleSize={13} inset={20} />
      <BackdropShelf heading="Recently added" books={recent} width={100} gap={14} pad={12} titleSize={13} inset={20} />
    </div>
    <div class="mini" style="position:absolute;left:14px;right:14px;bottom:96px">
      <MiniPlayer title="The Ash Ledger" detail="Ch. 4 · 6 min ahead" progress={0.34} speed="1.25×" />
    </div>
    <TabBar active="home" />
  {:else}
    <Aura glows={tabletGlows} />
    <div class="tablet">
      <nav class="rail" aria-label="Main">
        <div class="logo"><span style="color:#1a1206"><Glyph name="book" size={22} /></span></div>
        {#each rail as t}
          <div class="rt">
            <div class="rb" class:on={t.on} style:color={t.on ? 'var(--accent)' : 'var(--muted)'}><Glyph name={t.icon} size={22} /></div>
            <span style:color={t.on ? 'var(--accent)' : 'var(--muted)'}>{t.label}</span>
          </div>
        {/each}
      </nav>
      <div class="main">
        <div class="ttop">
          <h1 class="big">Home</h1>
          <div style="flex:1"></div>
          <Button><Glyph name="plus" size={18} />Add a book</Button>
        </div>
        <Glass radius={20} style="margin:0 40px;padding:24px">
          <div class="tcont">
            <Cover color="#c65a43" width={112} height={168} pad={14} shadowY={14} shadowBlur={28} title="The Ash Ledger" titleSize={14} />
            <div class="tinfo">
              <span class="eyebrow">Continue</span>
              <span class="tct">The Ash Ledger</span>
              <span class="tcs">Chapter 4 · The Ferryman&rsquo;s Ledger</span>
              <div class="prog">
                <ProgressBar value={0.34} height={4} />
                <span class="pt">34% · 6 min ahead</span>
              </div>
              <div class="btns">
                <Button size={44} style="height:48px;border-radius:24px"><Glyph name="play" size={18} fill />Continue listening</Button>
                <Button variant="glass" style="height:48px;border-radius:24px">Open book</Button>
              </div>
            </div>
          </div>
        </Glass>
        <div class="shelves">
          <BackdropShelf heading="On this device" count="{onDevice.length} books" books={onDevice} width={118} gap={16} pad={14} titleSize={15} inset={0} />
          <BackdropShelf heading="Recently added" books={recent} width={118} gap={16} pad={14} titleSize={15} inset={0} />
        </div>
      </div>
    </div>
    <div style="position:absolute;left:365px;bottom:20px;width:560px">
      <MiniPlayer title="The Ash Ledger" detail="Ch. 4 · 6 min ahead" progress={0.34} speed="1.25×" />
    </div>
    <div class="railwho">
      <Avatar name={listenerName} hue={listenerHue} size={44} selected />
    </div>
  {/if}
</div>

<style>
  span { line-height: 1.35; }
  .screen { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--base); font-family: var(--font-ui); color: var(--ink); }
  .phone { position: relative; display: flex; flex-direction: column; gap: 16px; height: 100%; overflow: hidden; }
  .top { display: flex; align-items: center; gap: 8px; padding: 16px 20px 0; }
  h1 { line-height: 1.35; margin: 0; flex: 1; font-size: 32px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; }
  .who { width: 44px; height: 44px; border-radius: 50%; padding: 0; border: 0; background: transparent; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .cont { display: flex; align-items: flex-end; gap: 16px; }
  .info { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 0; }
  .eyebrow { font-size: 11px; font-weight: 700; color: var(--accent); letter-spacing: 0.14em; text-transform: uppercase; }
  .ct { font-size: 18px; font-weight: 700; color: var(--ink); letter-spacing: -0.01em; }
  .cs { font-size: 13px; color: var(--muted); }
  .play { display: flex; align-items: center; gap: 12px; }
  .tablet { position: relative; display: flex; align-items: stretch; height: 100%; }
  .rail { width: 96px; height: 100%; flex-shrink: 0; background: rgba(14, 12, 22, 0.45); -webkit-backdrop-filter: blur(30px); backdrop-filter: blur(30px); border-right: 1px solid rgba(255, 255, 255, 0.1); display: flex; flex-direction: column; align-items: center; gap: 18px; padding-top: 28px; box-sizing: border-box; }
  .logo { width: 40px; height: 40px; border-radius: 12px; background: var(--accent); display: flex; align-items: center; justify-content: center; margin-bottom: 10px; }
  .rt { display: flex; flex-direction: column; gap: 4px; align-items: center; }
  .rb { width: 48px; height: 48px; border-radius: 16px; display: flex; align-items: center; justify-content: center; }
  .rb.on { background: rgba(255, 255, 255, 0.14); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35); }
  .rt span { font-size: 11px; font-weight: 500; }
  .main { display: flex; flex-direction: column; gap: 20px; flex: 1; min-width: 0; height: 100%; overflow: hidden; }
  .ttop { display: flex; align-items: center; gap: 12px; padding: 28px 40px 0; }
  .big { flex: none; font-size: 36px; letter-spacing: -0.025em; }
  .tcont { display: flex; align-items: center; gap: 28px; }
  .tinfo { display: flex; flex-direction: column; gap: 10px; flex: 1; min-width: 0; }
  .tct { font-size: 30px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; }
  .tcs { font-size: 14px; color: var(--muted); }
  .prog { display: flex; align-items: center; gap: 12px; }
  .pt { font-size: 13px; color: var(--muted); white-space: nowrap; }
  .btns { display: flex; align-items: center; gap: 12px; }
  .shelves { display: flex; align-items: flex-start; gap: 56px; padding: 0 40px; }
  .railwho { position: absolute; left: 24px; bottom: 28px; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; }
</style>

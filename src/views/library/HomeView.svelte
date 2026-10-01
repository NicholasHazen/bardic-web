<script lang="ts">
  import BookCard from '../../components/BookCard.svelte';
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import Cover from '../../components/Cover.svelte';
  import Glass from '../../components/Glass.svelte';
  import IconButton from '../../components/IconButton.svelte';
  import ProgressBar from '../../components/ProgressBar.svelte';
  import Glyph from '../shell/Glyph.svelte';
  import OfflineNotice from '../offline/OfflineNotice.svelte';
  import UnavailableBookCard from '../offline/UnavailableBookCard.svelte';
  import ListenerButton from './ListenerButton.svelte';
  import type { BookCardModel, ContinueModel, ListenerModel } from './types';

  interface Props {
    layout?: 'phone' | 'tablet';
    listener: ListenerModel;
    /** The book to carry on with; a finished book leaves Continue (A8). */
    continueItem?: ContinueModel | null;
    onDevice?: BookCardModel[];
    recent?: BookCardModel[];
    /** No books at all: shows the first-run screen (A6). */
    empty?: boolean;
    /** Shows a message instead of the sections (the server could not be reached). */
    error?: string;
    sampleBusy?: boolean;
    /** Away from home (phone): says so at the top, and `unavailable` books are shown dimmed instead of Recently added (O4). */
    offline?: boolean;
    /** Books that need the Bardic computer (only drawn while `offline`). */
    unavailable?: BookCardModel[];
    onswitchlistener?: () => void;
    /** Opens the Add a book sheet. */
    onaddbook?: () => void;
    /** A file picked from the first-run card. */
    onchoosefile?: (file: File) => void;
    onsample?: () => void;
    oncontinue?: () => void;
    onretry?: () => void;
  }
  let {
    layout = 'phone',
    listener,
    continueItem = null,
    onDevice = [],
    recent = [],
    empty = false,
    error,
    sampleBusy = false,
    offline = false,
    unavailable = [],
    onswitchlistener,
    onaddbook,
    onchoosefile,
    onsample,
    oncontinue,
    onretry,
  }: Props = $props();

  const tablet = $derived(layout === 'tablet');
  let picker: HTMLInputElement | undefined = $state();

  function picked() {
    const f = picker?.files?.[0];
    if (f) onchoosefile?.(f);
    if (picker) picker.value = '';
  }
</script>

{#if empty && !error}
  <div class="page empty" class:wide={tablet}>
    <div class="top">
      <h1>Home</h1>
      {#if !tablet}<ListenerButton {listener} onclick={onswitchlistener} />{/if}
    </div>
    <div class="hero">
      <h2>Add your first book</h2>
      <p>Press play on any book you own. No setup needed to start with a free voice.</p>
    </div>
    <Glass radius={16} style="margin: 0 20px; padding: 20px">
      <div class="how">
        <div class="badge"><Glyph name="upload" size={22} color="var(--accent)" /></div>
        <div class="copy">
          <h3>Import a book</h3>
          <p>A DRM-free EPUB or a UTF-8 text file. The words are kept exactly as written.</p>
        </div>
        <div class="act">
          <Button size={44} style="width: 100%; height: 48px; border-radius: 24px" onclick={() => picker?.click()}>
            <Glyph name="upload" size={18} />Choose a file
          </Button>
        </div>
      </div>
    </Glass>
    <Glass radius={16} style="margin: 0 20px; padding: 20px">
      <div class="how">
        <div class="badge"><Glyph name="book" size={22} color="var(--accent)" /></div>
        <div class="copy">
          <h3>Try a sample</h3>
          <p>A short original story, so you can hear how it reads first.</p>
        </div>
        <div class="act">
          <Button variant="glass" style="width: 100%; height: 48px; border-radius: 24px" disabled={sampleBusy} onclick={onsample}>
            {sampleBusy ? 'Adding the sample' : 'Open the sample'}
            {#if !sampleBusy}<Glyph name="arrow" size={16} />{/if}
          </Button>
        </div>
      </div>
    </Glass>
    <div class="note">
      <Glyph name="leaf" size={16} color="var(--muted)" />
      <span>Everything stays on your own computer. Paid voices are used only when you turn them on.</span>
    </div>
    <input bind:this={picker} class="file" type="file" accept=".epub,.txt,application/epub+zip,text/plain" tabindex="-1" aria-hidden="true" onchange={picked} />
  </div>
{:else if tablet}
  <div class="page wide">
    <div class="top t">
      <h1>Home</h1>
      <div class="grow"></div>
      <Button onclick={onaddbook}><Glyph name="plus" size={18} />Add a book</Button>
    </div>
    {#if error}
      <div class="msg">
        <Callout tone="error" title="Couldn’t load your books">
          {error}
          {#snippet actions()}<Button variant="glass" onclick={onretry}>Try again</Button>{/snippet}
        </Callout>
      </div>
    {/if}
    {#if continueItem}
      <Glass radius={20} style="margin: 0 40px; padding: 24px">
        <div class="hero-t">
          <Cover color={continueItem.color} src={continueItem.coverSrc} width={112} height={168} pad={14} shadowY={14} shadowBlur={28} title={continueItem.title} titleSize={14} />
          <div class="info">
            <span class="eyebrow">Continue</span>
            <span class="book-t">{continueItem.title}</span>
            {#if continueItem.chapterLine}<span class="chapter-t">{continueItem.chapterLine}</span>{/if}
            <div class="prog">
              <ProgressBar value={continueItem.progress} height={4} />
              <span class="detail nowrap">{continueItem.detail}</span>
            </div>
            <div class="btns">
              <Button style="height: 48px; border-radius: 24px" onclick={oncontinue}><Glyph name="play" size={18} filled />Continue listening</Button>
              <a class="linkbtn" href={continueItem.href}>Open book</a>
            </div>
          </div>
        </div>
      </Glass>
    {/if}
    <div class="shelves">
      {#if onDevice.length}
        <section>
          <div class="sh"><h2>On this device</h2><span class="count">{onDevice.length} {onDevice.length === 1 ? 'book' : 'books'}</span></div>
          <div class="row t">{#each onDevice as b (b.id)}<BookCard title={b.title} subtitle={b.subtitle} color={b.color} coverSrc={b.coverSrc} progress={b.progress} onDevice={b.onDevice} href={b.href} width={118} />{/each}</div>
        </section>
      {/if}
      {#if recent.length}
        <section>
          <div class="sh"><h2>Recently added</h2></div>
          <div class="row t">{#each recent as b (b.id)}<BookCard title={b.title} subtitle={b.subtitle} color={b.color} coverSrc={b.coverSrc} progress={b.progress} onDevice={b.onDevice} href={b.href} width={118} />{/each}</div>
        </section>
      {/if}
    </div>
  </div>
{:else}
  <div class="page">
    <div class="top">
      <h1>Home</h1>
      <ListenerButton {listener} onclick={onswitchlistener} />
    </div>
    {#if offline}<OfflineNotice />{/if}
    {#if error}
      <div class="msg">
        <Callout tone="error" title="Couldn’t load your books">
          {error}
          {#snippet actions()}<Button variant="glass" onclick={onretry}>Try again</Button>{/snippet}
        </Callout>
      </div>
    {/if}
    {#if continueItem}
      <Glass radius={20} style="margin: 0 20px; padding: 16px">
        <div class="hero-p">
          <Cover color={continueItem.color} src={continueItem.coverSrc} width={104} height={156} pad={13} shadowY={13} shadowBlur={26} title={continueItem.title} />
          <div class="info p">
            <span class="eyebrow">Continue</span>
            <a class="book-p" href={continueItem.href}>{continueItem.title}</a>
            {#if continueItem.chapterLine}<span class="chapter-p">{continueItem.chapterLine}</span>{/if}
            <ProgressBar value={continueItem.progress} height={4} />
            <div class="play">
              <IconButton label="Continue listening" icon="play" tone="accent" size={52} onclick={oncontinue} />
              <span class="detail">{continueItem.detail}</span>
            </div>
          </div>
        </div>
      </Glass>
    {/if}
    {#if onDevice.length}
      <section>
        <div class="sh p"><h2>On this device</h2><span class="count">{onDevice.length} {onDevice.length === 1 ? 'book' : 'books'}</span></div>
        <div class="row p">{#each onDevice as b (b.id)}<BookCard title={b.title} subtitle={b.subtitle} color={b.color} coverSrc={b.coverSrc} progress={b.progress} onDevice={b.onDevice} href={b.href} width={100} />{/each}</div>
      </section>
    {/if}
    {#if offline}
      {#if unavailable.length}
        <section>
          <div class="sh p"><h2>Needs your Bardic computer</h2><span class="count">Reconnect to open</span></div>
          <div class="row p">{#each unavailable as b (b.id)}<UnavailableBookCard title={b.title} subtitle={b.subtitle} color={b.color} coverSrc={b.coverSrc} width={100} />{/each}</div>
        </section>
      {/if}
    {:else if recent.length}
      <section>
        <div class="sh p"><h2>Recently added</h2></div>
        <div class="row p">{#each recent as b (b.id)}<BookCard title={b.title} subtitle={b.subtitle} color={b.color} coverSrc={b.coverSrc} progress={b.progress} onDevice={b.onDevice} href={b.href} width={100} />{/each}</div>
      </section>
    {/if}
  </div>
{/if}

<style>
  .page { display: flex; flex-direction: column; gap: 16px; font-family: var(--font-ui); }
  .page.empty { gap: 20px; }
  .page.wide { gap: 20px; }
  h1, h2, h3, p { margin: 0; }
  .top { display: flex; align-items: center; gap: 8px; padding: 16px 20px 0; }
  .top.t { gap: 12px; padding: 28px 40px 0; }
  h1 { font-size: 32px; font-weight: 700; color: var(--ink); line-height: 1.35; letter-spacing: -0.02em; flex: 1; }
  .top.t h1 { font-size: 36px; letter-spacing: -0.025em; flex: none; }
  .grow { flex: 1; }
  .msg { margin: 0 20px; }
  .hero { display: flex; flex-direction: column; gap: 10px; padding: 8px 20px 4px; }
  .hero h2 { font-size: 34px; font-weight: 700; color: var(--ink); letter-spacing: -0.025em; line-height: 1.08; }
  .hero p { font-size: 15px; font-weight: 400; color: var(--muted); line-height: 1.5; }
  .how { display: flex; flex-direction: column; gap: 12px; }
  .badge { width: 44px; height: 44px; border-radius: 22px; background: color-mix(in srgb, var(--accent) 18%, transparent); display: flex; align-items: center; justify-content: center; }
  .copy { display: flex; flex-direction: column; gap: 4px; }
  .copy h3 { font-size: 17px; font-weight: 700; color: var(--ink); line-height: 1.35; }
  .copy p { font-size: 14px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .act { margin-top: 4px; }
  .note { display: flex; align-items: flex-start; gap: 8px; padding: 0 24px; }
  .note span { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .file { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }

  .hero-p { display: flex; align-items: flex-end; gap: 16px; }
  .hero-t { display: flex; align-items: center; gap: 28px; }
  .info { display: flex; flex-direction: column; gap: 10px; flex: 1; min-width: 0; }
  .info.p { gap: 8px; }
  .eyebrow { font-size: 11px; font-weight: 700; color: var(--accent); line-height: 1.35; letter-spacing: 0.14em; text-transform: uppercase; }
  .book-p { font-size: 18px; font-weight: 700; color: var(--ink); line-height: 1.35; letter-spacing: -0.01em; text-decoration: none; }
  .book-t { font-size: 30px; font-weight: 700; color: var(--ink); line-height: 1.35; letter-spacing: -0.02em; }
  .chapter-p { font-size: 13px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .chapter-t { font-size: 14px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .play { display: flex; align-items: center; gap: 12px; }
  .prog { display: flex; align-items: center; gap: 12px; }
  .detail { font-size: 13px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .nowrap { white-space: nowrap; }
  .btns { display: flex; align-items: center; gap: 12px; }
  .linkbtn { display: inline-flex; align-items: center; justify-content: center; height: 48px; padding: 0 20px; border-radius: 24px; box-sizing: border-box; font-size: 14px; font-weight: 600; white-space: nowrap; text-decoration: none; background: rgba(255, 255, 255, 0.1); color: var(--ink); border: 1px solid var(--edge); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 6px 18px rgba(0, 0, 0, 0.25); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }

  section { display: flex; flex-direction: column; gap: 10px; }
  .sh { display: flex; align-items: center; gap: 8px; }
  .sh.p { padding: 0 20px; }
  .sh h2 { font-size: 17px; font-weight: 700; color: var(--ink); line-height: 1.35; }
  .count { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .row { display: flex; align-items: flex-start; }
  .row.p { gap: 14px; padding: 0 20px; overflow-x: auto; scrollbar-width: none; }
  .row.t { gap: 16px; }
  .shelves { display: flex; align-items: flex-start; gap: 56px; padding: 0 40px; }
</style>

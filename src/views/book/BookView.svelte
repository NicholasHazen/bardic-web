<script lang="ts">
  import Badge from '../../components/Badge.svelte';
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import Cover from '../../components/Cover.svelte';
  import Glass from '../../components/Glass.svelte';
  import RoundButton from '../shell/RoundButton.svelte';
  import AudiobookCard from './AudiobookCard.svelte';
  import ChapterList from './ChapterList.svelte';
  import OtherAudiobooks from './OtherAudiobooks.svelte';
  import SectionLabelMuted from './SectionLabelMuted.svelte';
  import type { AudiobookCardModel, BookHeaderModel, ChaptersModel, OtherAudiobookModel } from './types';

  /**
   * The book page ([BookTop], [BookChapters], [BookRunning], [BookTablet]): the book, the primary action, the
   * current audiobook, the other audiobooks and the chapters (B1 to B6). Presentational: the connected screen
   * is BookScreen.
   */
  interface Props {
    layout?: 'phone' | 'tablet';
    header: BookHeaderModel;
    /** "Continue listening" once the listener has a place in the book, otherwise "Listen". */
    primaryLabel: string;
    /** The current audiobook; null when the book has none yet. */
    audiobook?: AudiobookCardModel | null;
    others?: OtherAudiobookModel[];
    /** Offer "Add another voice" under the other audiobooks. */
    addRow?: boolean;
    chapters: ChaptersModel;
    /** A request is in flight (disables the audiobook actions). */
    busy?: boolean;
    /** Why a premium audiobook cannot be made ready from here yet. */
    premiumNote?: string;
    /** A problem to tell the listener first (what is kept, then what went wrong). */
    problem?: { title: string; text: string };
    onback?: () => void;
    onmore?: () => void;
    onplay?: () => void;
    /** What is happening with playback (Getting ready, Needs you) shown under the primary action. */
    playback?: import('svelte').Snippet;
    onchangevoice?: () => void;
    onmakeready?: () => void;
    ondownload?: () => void;
    onpause?: () => void;
    onresume?: () => void;
    onstop?: () => void;
    onchoose?: (audiobookId: string) => void;
    onshowall?: () => void;
    onfilter?: (storyOnly: boolean) => void;
    ondismissproblem?: () => void;
  }
  let {
    layout = 'phone',
    header,
    primaryLabel,
    audiobook = null,
    others = [],
    addRow = true,
    chapters,
    busy = false,
    premiumNote,
    problem,
    onback,
    onmore,
    onplay,
    playback,
    onchangevoice,
    onmakeready,
    ondownload,
    onpause,
    onresume,
    onstop,
    onchoose,
    onshowall,
    onfilter,
    ondismissproblem,
  }: Props = $props();

  const tablet = $derived(layout === 'tablet');
</script>

{#snippet topbar()}
  <RoundButton label="Back to library" icon="back" onclick={onback} />
  {#if tablet}<span class="crumb">Library</span>{/if}
  <div class="grow"></div>
  <RoundButton label="Edit this book" icon="more" onclick={onmore} />
{/snippet}

{#snippet cover()}
  {#if tablet}
    <Cover color={header.color} src={header.coverSrc} width={190} height={285} radius={10} pad={23} shadowY={23} shadowBlur={47} title={header.title} titleSize={24} />
  {:else}
    <Cover color={header.color} src={header.coverSrc} width={116} height={174} radius={8} pad={14} shadowY={14} shadowBlur={29} title={header.title} titleSize={15} />
  {/if}
{/snippet}

{#snippet series()}
  {#if header.seriesLine}<div class="series"><Badge tone="here">{header.seriesLine}</Badge></div>{/if}
{/snippet}

{#snippet play()}
  <Button size={52} icon="play" style="width: 100%" onclick={onplay}>{primaryLabel}</Button>
  {@render playback?.()}
{/snippet}

{#snippet audiobookSection()}
  <section class="block" data-section="audiobook">
    <SectionLabelMuted>Audiobook</SectionLabelMuted>
    {#if audiobook}
      <AudiobookCard model={audiobook} onchange={onchangevoice} {onmakeready} {ondownload} {onpause} {onresume} {onstop} {busy} note={audiobook.tier === 'premium' ? premiumNote : undefined} />
    {:else}
      <Glass radius={16} style="margin: var(--card-margin, 0 20px); padding: 14px">
        <div class="none">
          <div class="nonetext">
            <span class="voice">No audiobook yet</span>
            <span class="sub">Choose a voice to make this book ready.</span>
          </div>
          <Button variant="glass" onclick={onchangevoice}>Choose a voice</Button>
        </div>
      </Glass>
    {/if}
  </section>
{/snippet}

{#snippet problemBox()}
  {#if problem}
    <div class="problem">
      <Callout tone="error" title={problem.title}>
        {problem.text}
        {#snippet actions()}<Button variant="glass" onclick={ondismissproblem}>Dismiss</Button>{/snippet}
      </Callout>
    </div>
  {/if}
{/snippet}

{#snippet othersSection()}
  {#if others.length}
    <div data-section="other"><OtherAudiobooks items={others} {addRow} {onchoose} onadd={onchangevoice} /></div>
  {/if}
{/snippet}

{#if tablet}
  <div class="page tablet">
    <div class="bar tabletbar">{@render topbar()}</div>
    <div class="body">
      <div class="left">
        {@render cover()}
        <div class="titles">
          {@render series()}
          <h1 class="title big">{header.title}</h1>
          <span class="meta wide">{header.author} · {header.meta}</span>
        </div>
        {@render play()}
      </div>
      <div class="center">
        <ChapterList model={chapters} {onshowall} {onfilter} />
      </div>
      <div class="right">
        {@render problemBox()}
        {@render audiobookSection()}
        {@render othersSection()}
      </div>
    </div>
  </div>
{:else}
  <div class="page phone">
    <div class="bar">{@render topbar()}</div>
    <div class="hero">
      <div class="head">
        {@render cover()}
        <div class="titles flow">
          {@render series()}
          <h1 class="title">{header.title}</h1>
          <span class="author">{header.author}</span>
          <span class="meta">{header.meta}</span>
        </div>
      </div>
      <div class="cta">{@render play()}</div>
    </div>
    {@render problemBox()}
    {@render audiobookSection()}
    {@render othersSection()}
    <ChapterList model={chapters} {onshowall} {onfilter} />
  </div>
{/if}

<style>
  .page { font-family: var(--font-ui); color: var(--ink); }
  .phone { display: flex; flex-direction: column; gap: var(--page-gap, 16px); }
  .bar { display: flex; align-items: center; gap: 0; padding: 8px 12px 0; }
  .tabletbar { gap: 8px; padding: 16px 32px 0; }
  .crumb { font-size: 13px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .grow { flex: 1; }
  .hero { display: flex; flex-direction: column; gap: 14px; }
  .head { display: flex; align-items: flex-start; gap: 16px; padding: 0 20px; }
  .titles { display: flex; flex-direction: column; gap: 6px; }
  .flow { min-width: 0; flex: 1; }
  .series { align-self: flex-start; font-family: serif; line-height: normal; }
  .title { margin: 0; font-size: 27px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; line-height: 1.1; }
  .title.big { font-size: 34px; line-height: 1.05; }
  .author { font-size: 14px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .meta { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .meta.wide { font-size: 13px; }
  .cta { padding: 0 20px; }
  .block { display: flex; flex-direction: column; gap: var(--section-gap, 10px); }
  .none { display: flex; align-items: center; gap: 12px; }
  .nonetext { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .voice { font-size: 15px; font-weight: 700; color: var(--ink); line-height: 1.35; }
  .sub { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .problem { padding: 0 20px; }

  .tablet { display: flex; flex-direction: column; gap: 20px; height: 100%; --card-margin: 0; --label-pad: 0; --section-gap: 14px; }
  .body { display: flex; align-items: flex-start; gap: 32px; padding: 0 32px; flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: none; }
  .body::-webkit-scrollbar { display: none; }
  .left { display: flex; flex-direction: column; gap: 18px; width: 320px; flex-shrink: 0; }
  .center { display: flex; flex-direction: column; gap: 10px; flex: 1; min-width: 0; }
  .right { display: flex; flex-direction: column; gap: 14px; width: 340px; flex-shrink: 0; }
</style>

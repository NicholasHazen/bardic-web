<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Cover from '../../components/Cover.svelte';
  import Glass from '../../components/Glass.svelte';
  import IconButton from '../../components/IconButton.svelte';
  import OfflineGlyph from './OfflineGlyph.svelte';
  import type { PlayableBook } from './logic';

  /**
   * Away from home ([ServerOffline], G5, O4): your Bardic computer can't be reached. Says what is still available
   * (the books on this device, with a play button), what to check, and offers to try again. Checking sends nothing and
   * changes nothing. Queued work is never lost. `playable` comes from `playableBooks(state.books, places)`.
   */
  interface Props {
    playable: PlayableBook[];
    /** A check is running. */
    checking?: boolean;
    onplay?: (bookId: string) => void;
    onretry?: () => void;
    /** Extra space under the button; the design leaves room for the tab bar when the view fills the screen. */
    inset?: number;
  }
  let { playable, checking = false, onplay, onretry, inset = 0 }: Props = $props();

  const steps = ['Is your computer awake and Bardic running?', 'Are you on the same network, or connected to it?', 'Try again below.'];
</script>

<div class="page">
  <div class="gap"></div>
  <div class="hero" role="status">
    <div class="disc"><OfflineGlyph name="wifi-off" size={30} color="#ffd493" /></div>
    <h1>Can’t reach Bardic</h1>
    <p>Your computer isn’t answering. Books are stored there and haven’t changed. Downloaded chapters still play.</p>
  </div>
  <div class="section">
    <span class="label">Play from this device</span>
    {#if playable.length}
      <Glass radius={16} style="margin: 0 20px; overflow: hidden">
        {#each playable as b, i (b.audiobookId)}
          <div class="book" class:last={i === playable.length - 1}>
            <Cover color={b.color} src={b.coverSrc} width={40} height={60} radius={6} pad={5} shadowY={5} shadowBlur={10} />
            <div class="words">
              <span class="name">{b.title}</span>
              <span class="sub">{b.line}</span>
            </div>
            <IconButton label="Play {b.title}" icon="play" tone={b.current ? 'accent' : 'glass'} onclick={() => onplay?.(b.bookId)} />
          </div>
        {/each}
      </Glass>
    {:else}
      <span class="note">Nothing is on this device yet. While you are on your network, download a book from its page to listen away from home.</span>
    {/if}
  </div>
  <div class="pad">
    <Glass radius={16} style="overflow: hidden">
      {#each steps as s, i}
        <div class="step" class:last={i === steps.length - 1}>
          <div class="n">{i + 1}</div>
          <span class="t">{s}</span>
        </div>
      {/each}
    </Glass>
  </div>
  <div class="grow"></div>
  <div class="foot" style:padding-bottom="{inset}px">
    <Button size={52} style="width: 100%" disabled={checking} aria-busy={checking} onclick={onretry}>{checking ? 'Checking…' : 'Try again'}</Button>
    <span class="cap">Checking again sends nothing and changes nothing.</span>
  </div>
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 18px; min-height: 100%; font-family: var(--font-ui); }
  .gap { height: 84px; flex-shrink: 0; }
  .hero { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 0 32px; text-align: center; }
  .disc { width: 64px; height: 64px; border-radius: 32px; background: rgba(246, 185, 92, 0.2); display: flex; align-items: center; justify-content: center; }
  h1 { margin: 0; font-size: 26px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; line-height: 1.15; }
  p { margin: 0; font-size: 15px; font-weight: 400; color: var(--muted); line-height: 1.5; }
  .section { display: flex; flex-direction: column; gap: 8px; }
  .label { font-size: 12px; font-weight: 700; color: var(--muted); line-height: 1.35; letter-spacing: 0.1em; text-transform: uppercase; padding: 0 24px; }
  .note { font-size: 13px; font-weight: 400; color: var(--muted); line-height: 1.45; padding: 0 24px; }
  .book { min-height: 68px; display: flex; align-items: center; gap: 12px; padding: 0 10px 0 12px; box-sizing: border-box; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  .book.last, .step.last { border-bottom: 0; }
  .words { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .name { font-size: 15px; font-weight: 600; color: var(--ink); line-height: 1.35; }
  .sub { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .pad { padding: 0 20px; }
  .step { min-height: 46px; display: flex; align-items: center; gap: 12px; padding: 0 14px; box-sizing: border-box; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  .n { width: 24px; height: 24px; border-radius: 12px; background: rgba(255, 255, 255, 0.12); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: var(--ink); flex-shrink: 0; }
  .t { font-size: 14px; font-weight: 400; color: var(--ink); line-height: 1.35; flex: 1; }
  .grow { flex: 1; }
  .foot { display: flex; flex-direction: column; gap: 8px; padding: 0 20px; }
  .cap { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; text-align: center; }
</style>

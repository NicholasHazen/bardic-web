<script lang="ts">
  import Chip from '../../../components/Chip.svelte';
  import Cover from '../../../components/Cover.svelte';
  import Glass from '../../../components/Glass.svelte';
  import IconButton from '../../../components/IconButton.svelte';
  import ProgressBar from '../../../components/ProgressBar.svelte';
  import Glyph from '../../shell/Glyph.svelte';
  import PhoneShell from '../../shell/PhoneShell.svelte';

  // What sits behind the expanded bar on the board: the Library screen with a Continue card. A stand-in for
  // whatever screen is underneath; in the app the expanded bar opens over the real screen.
</script>

<PhoneShell active="library">
  <div class="page">
    <div class="top">
      <h1>Library</h1>
      <IconButton label="Search" icon="search" />
      <button type="button" class="add" aria-label="Add a book"><Glyph name="plus" /></button>
    </div>
    <Glass radius={20} style="margin: 0 20px; padding: 18px">
      <div class="hero">
        <Cover color="#c65a43" width={104} height={156} pad={13} title="The Ash Ledger" />
        <div class="info">
          <span class="eyebrow">Continue</span>
          <span class="ch">Chapter 4<br />The Ferryman’s Ledger</span>
          <ProgressBar value={0.34} height={4} track="rgba(255,255,255,.18)" />
          <div class="play">
            <IconButton label="Continue listening" icon="play" tone="accent" size={56} iconSize={22} />
            <span class="detail">34% · Samantha</span>
          </div>
        </div>
      </div>
    </Glass>
    <div class="chips">
      <Chip selected>All</Chip><Chip>In progress</Chip><Chip>Series</Chip><Chip>Not started</Chip>
    </div>
  </div>
</PhoneShell>

<style>
  .page { display: flex; flex-direction: column; gap: 18px; height: 100%; overflow: hidden; font-family: var(--font-ui); }
  .top { display: flex; align-items: center; gap: 8px; padding: 16px 20px 0; }
  h1 { margin: 0; flex: 1; font-size: 32px; font-weight: 700; color: var(--ink); line-height: 1.35; letter-spacing: -0.02em; }
  .add { width: 44px; height: 44px; border-radius: 22px; padding: 0; display: inline-flex; align-items: center; justify-content: center; background: var(--accent); border: 1px solid rgba(255, 255, 255, 0.45); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 6px 18px rgba(0, 0, 0, 0.25); color: #1a1206; }
  .hero { display: flex; align-items: flex-end; gap: 16px; }
  .info { display: flex; flex-direction: column; gap: 10px; flex: 1; min-width: 0; }
  .eyebrow { font-size: 11px; font-weight: 700; color: var(--accent); line-height: 1.35; letter-spacing: 0.14em; text-transform: uppercase; }
  .ch { font-family: var(--font-book); font-size: 17px; font-weight: 500; color: var(--ink); line-height: 1.35; }
  .play { display: flex; align-items: center; gap: 12px; }
  .detail { font-size: 13px; color: var(--muted); line-height: 1.35; }
  .chips { display: flex; align-items: center; gap: 8px; padding: 0 20px; overflow: hidden; flex-shrink: 0; }
</style>

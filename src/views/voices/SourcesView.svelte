<script lang="ts">
  import Badge from '../../components/Badge.svelte';
  import Button from '../../components/Button.svelte';
  import Glass from '../../components/Glass.svelte';
  import { SOURCE_BLURB, SOURCE_KIND_LINE, sourceProblem, sourceStatus, visibleSources, type SourceKind, type VoiceSource } from '../../lib/voiceText';
  import Glyph, { type GlyphName } from './Glyph.svelte';
  import ScreenHead from './ScreenHead.svelte';

  /** Settings > Voices (V5): one card per source, with its status. */
  interface Props {
    sources: VoiceSource[];
    loading?: boolean;
    error?: string;
    onback?: () => void;
    onmanagebreeze?: () => void;
    onmanagekey?: () => void;
    onvoices?: () => void;
    onretry?: () => void;
  }
  let { sources, loading = false, error = '', onback, onmanagebreeze, onmanagekey, onvoices, onretry }: Props = $props();

  const icons: Record<SourceKind, GlyphName> = { breeze: 'server', gemini: 'key', local: 'wave' };
  const cards = $derived(visibleSources(sources));
</script>

<div class="col">
  <ScreenHead title="Voices" {onback} />
  <div class="pad strut"><span class="desc">Where Bardic gets its voices. Add any of these; you need at least one.</span></div>
  {#if error}
    <div class="pad" role="alert">
      <span class="problem">{error}</span>
      {#if onretry}<Button variant="glass" onclick={() => onretry?.()}>Try again</Button>{/if}
    </div>
  {:else if loading && cards.length === 0}
    <div class="pad"><span class="desc">Looking at your voice sources…</span></div>
  {/if}
  {#each cards as s (s.kind)}
    {@const st = sourceStatus(s)}
    {@const problem = sourceProblem(s)}
    <Glass radius={16} style="margin:0 20px;padding:14px" aria-label={s.name}>
      <div class="card">
        <div class="top">
          <div class="icon"><Glyph name={icons[s.kind]} size={20} color="var(--ink)" /></div>
          <div class="text">
            <span class="name">{s.name}</span>
            <span class="sub">{SOURCE_KIND_LINE[s.kind]}</span>
          </div>
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
        <span class="blurb">{SOURCE_BLURB[s.kind]}</span>
        {#if problem}<span class="blurb bad">{problem.title}. {problem.body}</span>{/if}
        {#if s.kind === 'breeze'}
          <Button variant="glass" onclick={() => onmanagebreeze?.()}>{s.state === 'not_set_up' ? 'Set up Breeze' : 'Manage server'}</Button>
        {:else if s.kind === 'gemini'}
          <div class="buttons">
            {#if s.state === 'not_set_up'}
              <Button variant="glass" onclick={() => onmanagekey?.()}>Add a Google key</Button>
            {:else}
              <Button variant="glass" onclick={() => onmanagekey?.()}>Manage key</Button>
              {#if s.state === 'connected'}<Button variant="glass" onclick={() => onvoices?.()}>Voices</Button>{/if}
            {/if}
          </div>
        {/if}
      </div>
    </Glass>
  {/each}
</div>

<style>
  span { line-height: 1.35; font-family: var(--font-ui); }
  .col { display: flex; flex-direction: column; gap: 14px; }
  .pad { padding: 0 24px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .pad.strut { display: block; }
  .desc { font-size: 14px; color: var(--muted); line-height: 1.5; }
  /* The design draws this text inline in a plain block, so the line box also holds the default text strut. */
  .strut { font-family: serif; line-height: normal; }
  .problem { font-size: 14px; color: #ffbcae; }
  .card { display: flex; flex-direction: column; gap: 12px; }
  .top { display: flex; align-items: center; gap: 12px; }
  .icon { width: 40px; height: 40px; border-radius: 12px; background: rgba(255, 255, 255, 0.1); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .name { font-size: 16px; font-weight: 700; color: var(--ink); }
  .sub { font-size: 12px; font-weight: 400; color: var(--muted); }
  .blurb { font-size: 13px; font-weight: 400; color: var(--muted); line-height: 1.5; }
  .blurb.bad { color: #ffbcae; }
  .buttons { display: flex; align-items: center; gap: 10px; }
</style>

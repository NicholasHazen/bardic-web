<script lang="ts">
  import Badge from '../../components/Badge.svelte';
  import Button from '../../components/Button.svelte';
  import Glass from '../../components/Glass.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import { setupBlurb, visibleSources, type SourceKind, type VoiceSource } from '../../lib/voiceText';
  import Glyph, { type GlyphName } from './Glyph.svelte';

  /** First-time set up (V8, D13): the three sources, what each is, its tier and one action each. */
  interface Props {
    sources: VoiceSource[];
    /** Which action is running. */
    busy?: SourceKind | null;
    error?: string;
    placement?: 'bottom' | 'popover';
    fixed?: boolean;
    onclose?: () => void;
    onbreeze?: () => void;
    ongemini?: () => void;
    onlocal?: () => void;
  }
  let { sources, busy = null, error = '', placement = 'bottom', fixed = false, onclose, onbreeze, ongemini, onlocal }: Props = $props();

  const icons: Record<SourceKind, GlyphName> = { breeze: 'server', gemini: 'key', local: 'wave' };
  const actions: Record<SourceKind, string> = { breeze: 'Set up Breeze', gemini: 'Add a Google key', local: 'Use these voices' };
  const go = (k: SourceKind) => (k === 'breeze' ? onbreeze : k === 'gemini' ? ongemini : onlocal)?.();
  const cards = $derived(visibleSources(sources));
</script>

<Sheet title="Set up a voice" eyebrow="First time" {onclose} {placement} {fixed}>
  <p class="intro">Bardic needs somewhere to get a voice. Choose what you have; you can add more later in Settings › Voices.</p>
  {#each cards as s (s.kind)}
    <Glass radius={16} style="padding:14px;flex-shrink:0">
      <div class="card">
        <div class="top">
          <div class="icon"><Glyph name={icons[s.kind]} size={20} color="var(--ink)" /></div>
          <div class="text">
            <span class="name">{s.name}</span>
            <span class="blurb">{setupBlurb(s)}</span>
          </div>
          <Badge tone={s.tier === 'premium' ? 'paid' : 'ready'}>{s.tier === 'premium' ? 'Premium' : 'Free'}</Badge>
        </div>
        <Button variant="glass" style="width:100%" disabled={busy !== null} onclick={() => go(s.kind)}>{busy === s.kind ? 'Setting up…' : actions[s.kind]}</Button>
      </div>
    </Glass>
  {/each}
  {#if error}<p class="problem" role="alert">{error}</p>{/if}
</Sheet>

<style>
  .intro { margin: 0; font-family: var(--font-ui); font-size: 14px; font-weight: 400; color: var(--muted); line-height: 1.5; }
  .card { display: flex; flex-direction: column; gap: 10px; }
  .top { display: flex; align-items: center; gap: 12px; }
  .icon { width: 40px; height: 40px; border-radius: 12px; background: rgba(255, 255, 255, 0.1); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .name { font-family: var(--font-ui); font-size: 15px; font-weight: 700; color: var(--ink); line-height: 1.35; }
  .blurb { font-family: var(--font-ui); font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.4; }
  .problem { margin: 0; font-family: var(--font-ui); font-size: 13px; color: #ffbcae; line-height: 1.35; }
</style>

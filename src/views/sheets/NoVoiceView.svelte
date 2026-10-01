<script lang="ts">
  import Glass from '../../components/Glass.svelte';
  import Glyph from '../shell/Glyph.svelte';
  import LinkButton from './LinkButton.svelte';

  /**
   * First play, no voice set up ([NoVoice], V8): "Needs you". Nothing was sent anywhere and nothing is spent. The
   * buttons are links: set up a voice (`#/settings/voices`) or add a Gemini key (`#/settings/premium`).
   */
  interface Props {
    setupHref?: string;
    keyHref?: string;
    /** Called as the link is followed (the screen can close itself). */
    onnavigate?: () => void;
  }
  let { setupHref = '#/settings/voices', keyHref = '#/settings/premium', onnavigate }: Props = $props();
</script>

<Glass radius={16} style="margin:0 20px;padding:14px">
  <div class="col" role="status">
    <div class="row">
      <div class="disc" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffbcae" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M12 4 3 20h18zM12 10v4.5M12 17.3v.4" /></svg>
      </div>
      <div class="titles">
        <span class="state">Needs you</span>
        <span class="detail">No voice source is set up yet.</span>
      </div>
    </div>
    <span class="body">Set up Breeze (free), add a Gemini key, or use a voice already on your Bardic computer. Nothing is spent until you approve a plan.</span>
    <div class="actions">
      <LinkButton href={setupHref} onclick={onnavigate}>Set up a voice</LinkButton>
      <LinkButton href={keyHref} variant="glass" onclick={onnavigate}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3" /></svg>Add a Gemini key</LinkButton>
    </div>
  </div>
</Glass>

<style>
  span { line-height: 1.35; }
  .col { display: flex; flex-direction: column; gap: 12px; }
  .row { display: flex; align-items: center; gap: 12px; }
  .disc { width: 40px; height: 40px; border-radius: 20px; background: rgba(255, 120, 100, 0.22); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .titles { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .state { font-size: 15px; font-weight: 700; color: #ffbcae; }
  .detail { font-size: 12px; font-weight: 400; color: var(--muted); }
  .body { font-size: 13px; font-weight: 400; color: var(--muted); line-height: 1.5; }
  .actions { display: flex; flex-direction: column; gap: 10px; }
</style>

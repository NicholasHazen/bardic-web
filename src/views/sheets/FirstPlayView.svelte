<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Glass from '../../components/Glass.svelte';
  import { firstAudioText } from './texts';

  /**
   * First play, getting ready ([FirstPlay], 7.2): the first passage is being made with the free voice. Says who is
   * making it and how long the first audio takes, and offers another voice. Nothing here spends money: a free voice
   * on the listener's own Bardic computer.
   */
  interface Props {
    /** The voice making the audio, e.g. "Samantha". */
    voiceName: string;
    /** Seconds until the first audio, when known. Unknown is left unsaid, never "0". */
    etaSeconds?: number | null;
    onchoosevoice?: () => void;
  }
  let { voiceName, etaSeconds = null, onchoosevoice }: Props = $props();

  const eta = $derived(firstAudioText(etaSeconds));
</script>

<Glass radius={16} style="margin:0 20px;padding:14px">
  <div class="col" role="status" aria-live="polite">
    <div class="row">
      <div class="ring" aria-hidden="true"></div>
      <div class="titles">
        <span class="state">Getting ready</span>
        <span class="detail">Making the first passage with {voiceName}.{eta ? ` ${eta}` : ''}</span>
      </div>
    </div>
    <span class="body">Bardic uses a free voice on your Bardic computer until you choose another. It makes audio a little ahead of where you are.</span>
  </div>
  <div class="btn"><Button variant="glass" style="width:100%" onclick={() => onchoosevoice?.()}>Choose another voice</Button></div>
</Glass>

<style>
  span { line-height: 1.35; }
  .col { display: flex; flex-direction: column; gap: 12px; }
  .row { display: flex; align-items: center; gap: 12px; }
  .ring { width: 40px; height: 40px; border-radius: 20px; border: 3px solid var(--accent); border-top-color: transparent; box-sizing: border-box; flex-shrink: 0; }
  @media (prefers-reduced-motion: no-preference) {
    .ring { animation: spin 1.1s linear infinite; }
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .titles { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .state { font-size: 15px; font-weight: 700; color: #bcdcff; }
  .detail { font-size: 12px; font-weight: 400; color: var(--muted); }
  .body { font-size: 13px; font-weight: 400; color: var(--muted); line-height: 1.5; }
  .btn { margin-top: 12px; }
</style>

<script lang="ts">
  import { listenerStore } from '../../state/listener';
  import { listenerSettings, settingsActions } from '../../state/voices';
  import type { ListenerSettings } from '../../lib/voiceText';
  import { readerActions, readerPreferences } from '../../state/reader';
  import Glass from '../../components/Glass.svelte';
  import Callout from '../../components/Callout.svelte';
  import ScreenHead from '../voices/ScreenHead.svelte';
  import SwitchRow from '../sheets/SwitchRow.svelte';

  const listenerId = $derived($listenerStore.currentId);
  $effect(() => { if (listenerId) void settingsActions.load(listenerId); });
  let saving = $state(false);
  let error = $state('');
  const choices = [
    { value: 'ask', label: 'Ask', detail: 'Show both places and let me choose.' },
    { value: 'newest', label: 'Use newest', detail: 'Use the place changed most recently. Both places stay in history.' },
    { value: 'this_device', label: 'Use this device', detail: 'Keep this device’s place. The other place stays in history.' },
  ] as const;

  async function save(patch: Partial<ListenerSettings>) {
    if (!listenerId || saving) return;
    saving = true;
    error = '';
    const r = await settingsActions.update(listenerId, patch);
    if (!r.ok) error = r.detail;
    saving = false;
  }
</script>

<div class="page">
  <ScreenHead title="Listening behaviour" onback={() => (location.hash = '#/settings')} />
  {#if error}<div class="pad"><Callout tone="error" title="Your settings were not changed">{error}</Callout></div>{/if}
  {#if $listenerSettings.status === 'error' && !$listenerSettings.settings}
    <p class="pad" role="status">Your settings could not be read. Try again when your Bardic computer is reachable.</p>
  {:else if !$listenerSettings.settings}
    <p class="pad" role="status">Getting your settings…</p>
  {:else}
    <fieldset disabled={saving}>
      <legend>For this listener</legend>
      <Glass radius={16} style="padding: 18px; margin: 0 20px">
        <SwitchRow label="Continue into the next chapter" detail="When a chapter ends, keep listening." checked={$listenerSettings.settings.continue_into_next_chapter} onchange={(v) => void save({ continue_into_next_chapter: v })} />
      </Glass>
      <div class="pad"><h2>When places differ</h2></div>
      <Glass radius={16} style="margin: 0 20px; overflow: hidden">
        {#each choices as c}
          <label class="choice">
            <input type="radio" name="place-conflict" value={c.value} checked={$listenerSettings.settings.place_conflict === c.value} onchange={() => void save({ place_conflict: c.value })} />
            <span><strong>{c.label}</strong><span class="detail">{c.detail}</span></span>
          </label>
        {/each}
      </Glass>
    </fieldset>
  {/if}
  <div class="pad"><h2>On this device</h2></div>
  <Glass radius={16} style="padding: 18px; margin: 0 20px">
    <SwitchRow label="Keep the screen on while listening" detail="While Read is open and playing, where this browser supports it." checked={$readerPreferences.extras.keepScreenOn} onchange={(v) => readerActions.setExtras({ ...$readerPreferences.extras, keepScreenOn: v })} />
  </Glass>
  {#if saving}<p class="pad" role="status">Saving…</p>{/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 18px; font-family: var(--font-ui); color: var(--ink); padding-bottom: 24px; }
  .pad { padding: 0 20px; margin: 0; line-height: 1.5; }
  h2, legend { margin: 0; font-size: 14px; font-weight: 700; color: var(--ink); }
  fieldset { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 18px; min-width: 0; }
  legend { padding: 0 20px 16px; }
  .choice { display: flex; gap: 12px; align-items: center; min-height: 64px; padding: 10px 16px; cursor: pointer; box-sizing: border-box; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .choice:last-child { border-bottom: 0; }
  .choice input { margin: 0; accent-color: var(--accent); flex-shrink: 0; }
  .choice:focus-within { outline: 2px solid var(--accent); outline-offset: -2px; }
  .choice > span { display: flex; flex-direction: column; gap: 4px; }
  strong { font-size: 15px; }
  .detail { font-size: 13px; line-height: 1.5; color: var(--ink); opacity: 0.88; }
</style>

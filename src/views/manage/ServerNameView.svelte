<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import Glass from '../../components/Glass.svelte';
  import RoundButton from '../shell/RoundButton.svelte';

  /**
   * About this Bardic ([ServerName], G1, G7): the server's name, which is shown on every device, and its details.
   * A detail the server cannot report is said as unknown.
   */
  interface Props {
    /** What is typed in the field. */
    name: string;
    details: { label: string; value: string }[];
    /** Why the typed name cannot be saved (the server's rule, checked here first). */
    problem?: string;
    /** What the server said when it refused. */
    error?: string;
    saved?: boolean;
    saving?: boolean;
    /** The typed name is the saved one. */
    unchanged?: boolean;
    loading?: boolean;
    onname?: (v: string) => void;
    onsave?: () => void;
    onback?: () => void;
  }
  let { name, details, problem, error, saved = false, saving = false, unchanged = false, loading = false, onname, onsave, onback }: Props = $props();
</script>

<form class="page" onsubmit={(e) => (e.preventDefault(), onsave?.())}>
  <div class="top">
    <RoundButton label="Back" icon="back" onclick={onback} />
    <h1>About this Bardic</h1>
  </div>

  <div class="pad">
    <div class="help">
      <div class="field">
        <label for="sn">Server name</label>
        <div class="box" class:bad={!!problem}>
          <input id="sn" type="text" value={name} autocomplete="off" aria-invalid={problem ? 'true' : undefined} aria-describedby="sn-help" disabled={loading} oninput={(e) => onname?.(e.currentTarget.value)} />
        </div>
      </div>
      <span id="sn-help" class="note" class:badtext={!!problem}>{problem ?? 'Shown on every device and in the Can’t reach message. Use something you will recognise.'}</span>
    </div>
  </div>

  {#if error}<div class="pad"><Callout tone="error" title="The name was not changed">{error}</Callout></div>{/if}

  <div class="group">
    <h2>Details</h2>
    <Glass radius={16} style="margin: 0 20px; overflow: hidden">
      <dl>
        {#each details as d (d.label)}
          <div class="row"><dt>{d.label}</dt><dd>{d.value}</dd></div>
        {/each}
      </dl>
    </Glass>
  </div>

  <div class="pad">
    <Button size={52} type="submit" disabled={saving || loading || !!problem || unchanged} style="width: 100%">{saving ? 'Saving…' : 'Save name'}</Button>
    {#if saved}<p class="saved" role="status">Name saved. Every device shows it.</p>{/if}
  </div>
</form>

<style>
  .page { display: flex; flex-direction: column; gap: 16px; font-family: var(--font-ui); color: var(--ink); }
  .top { display: flex; align-items: center; gap: 4px; padding: 8px 12px 0; }
  h1 { margin: 0; margin-left: 4px; flex: 1; font-size: 20px; font-weight: 700; color: var(--ink); line-height: 1.35; }
  .pad { padding: 0 20px; }
  .help { display: flex; flex-direction: column; gap: 6px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  label { font-size: 12px; font-weight: 600; color: var(--ink); }
  .box { display: flex; align-items: center; height: 44px; padding: 0 14px; border-radius: 12px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.22); box-sizing: border-box; }
  .box:focus-within { border-color: var(--accent); }
  .box.bad { border-color: #ffbcae; }
  input { border: 0; outline: 0; background: transparent; flex: 1; min-width: 0; min-height: 44px; font-family: var(--font-ui); font-size: 14px; color: var(--ink); }
  .note { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.5; }
  .badtext { color: #ffbcae; }
  .group { display: flex; flex-direction: column; gap: 8px; }
  h2 { margin: 0; padding: 0 24px; font-size: 12px; font-weight: 700; color: var(--muted); line-height: 1.35; letter-spacing: 0.1em; text-transform: uppercase; }
  dl { margin: 0; }
  .row { min-height: 50px; display: flex; align-items: center; gap: 12px; padding: 0 14px; box-sizing: border-box; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  .row:last-child { border-bottom: 0; }
  dt { flex: 1; font-size: 14px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  dd { margin: 0; font-size: 14px; font-weight: 500; color: var(--ink); line-height: 1.35; text-align: right; overflow-wrap: anywhere; }
  .saved { margin: 10px 0 0; font-size: 13px; color: var(--muted); line-height: 1.35; }
  @media (min-width: 768px) {
    dt { color: var(--ink); }
  }
</style>

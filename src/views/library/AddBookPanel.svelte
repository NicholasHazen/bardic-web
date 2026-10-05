<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import Glass from '../../components/Glass.svelte';
  import { formatBytes } from '../../lib/bytes';
  import { stepStates, type ErrorCopy, type FileInfo, type ImportStage } from '../../state/imports';
  import Glyph from '../shell/Glyph.svelte';
  import RoundButton from '../shell/RoundButton.svelte';

  interface Props {
    /** choose: nothing yet. chosen: file picked. working: checking, uploading or reading on the server. failed: could not add. */
    phase: 'choose' | 'chosen' | 'working' | 'failed';
    file?: FileInfo;
    /** Which of the three steps is running (working). */
    stage?: ImportStage;
    /** 0 to 1 (working). */
    progress?: number;
    error?: ErrorCopy;
    /** "30 MB" */
    limit?: string;
    onpick?: (file: File) => void;
    onremove?: () => void;
    onadd?: () => void;
    oncancel?: () => void;
    /** "Choose another file" / "Try again" after a failure. */
    onagain?: () => void;
  }
  let { phase, file, stage = 'reading', progress = 0, error, limit = '30 MB', onpick, onremove, onadd, oncancel, onagain }: Props = $props();

  let input: HTMLInputElement | undefined = $state();
  let over = $state(false);
  const accept = '.epub,.txt,application/epub+zip,text/plain';

  function changed() {
    const f = input?.files?.[0];
    if (f) onpick?.(f);
    if (input) input.value = '';
  }
  function drop(e: DragEvent) {
    e.preventDefault();
    over = false;
    const f = e.dataTransfer?.files?.[0];
    if (f) onpick?.(f);
  }
  const steps = $derived(stepStates(stage));
  const fileMeta = $derived(file ? `${formatBytes(file.size)} · ${file.kind}` : '');
  const tryAgain = $derived(error?.action === 'Try again');
</script>

<div class="panel">
  {#if phase === 'choose' || phase === 'chosen'}
    <p class="lead">A DRM-free EPUB or a UTF-8 text file. Your words are kept exactly as written.</p>
  {/if}

  {#if phase === 'choose'}
    <button
      type="button"
      class="drop"
      class:over
      onclick={() => input?.click()}
      ondragover={(e) => { e.preventDefault(); over = true; }}
      ondragleave={() => (over = false)}
      ondrop={drop}
    >
      <span class="circle"><Glyph name="upload" size={24} color="var(--accent)" /></span>
      <span class="big">Choose a file</span>
      <span class="small">.epub or .txt, up to {limit}</span>
    </button>
    <div class="grow"></div>
    <div class="bottom">
      <Button variant="glass" disabled style="width: 100%; height: 48px; border-radius: 24px">Add book</Button>
      <span class="foot">Choose a file first.</span>
    </div>
  {:else if phase === 'chosen' && file}
    <Glass radius={12} style="padding: 6px 8px 6px 14px">
      <div class="file">
        <Glyph name="file" size={24} color="var(--accent)" />
        <div class="fname"><span class="n">{file.name}</span><span class="m">{fileMeta}</span></div>
        <RoundButton label="Remove file" icon="close" tone="ghost" iconSize={18} onclick={onremove} />
      </div>
    </Glass>
    <Callout title="What happens next">Bardic reads the chapters and makes the book readable straight away. You can listen right after, with a free voice.</Callout>
    <div class="grow"></div>
    <div class="bottom">
      <Button style="width: 100%; height: 48px; border-radius: 24px" onclick={onadd}>Add book</Button>
      <span class="foot">Only files you have the right to use.</span>
    </div>
  {:else if phase === 'working' && file}
    <Glass radius={12} style="padding: 6px 8px 6px 14px">
      <div class="file">
        <Glyph name="file" size={24} color="var(--accent)" />
        <div class="fname"><span class="n">{file.name}</span><span class="m">{fileMeta}</span></div>
      </div>
    </Glass>
    <div class="work" role="status" aria-live="polite">
      <div class="track" role="progressbar" aria-label="Adding the book" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress * 100)}>
        <div class="fill" style:width="{progress * 100}%"></div>
      </div>
      <ol class="steps">
        {#each steps as s}
          <li class={s.state}>
            {#if s.state === 'done'}<Glyph name="check" size={16} color="#c3f0ba" />{:else if s.state === 'active'}<span class="ring spin"></span>{:else}<span class="ring dim"></span>{/if}
            <span>{s.label}</span>
          </li>
        {/each}
      </ol>
      <span class="foot left">Nothing leaves your network.</span>
    </div>
    <div class="grow"></div>
    <div class="bottom">
      <Button variant="glass" style="width: 100%; height: 48px; border-radius: 24px" onclick={oncancel}>Cancel</Button>
      <span class="foot">Only files you have the right to use.</span>
    </div>
  {:else if phase === 'failed' && error}
    <Callout tone="error" title={error.title}>{error.body}</Callout>
    {#if error.can.length}
      <div class="can">
        <span class="label">You can</span>
        {#each error.can as c}<span class="item">{c}</span>{/each}
      </div>
    {/if}
    <div class="grow"></div>
    <div class="bottom">
      <Button style="width: 100%; height: 48px; border-radius: 24px" onclick={onagain}>
        {#if !tryAgain}<Glyph name="upload" size={18} />{/if}{error.action}
      </Button>
      <span class="foot">Only files you have the right to use.</span>
    </div>
  {/if}
  <input bind:this={input} class="hidden" type="file" {accept} tabindex="-1" aria-hidden="true" onchange={changed} />
</div>

<style>
  .panel { display: flex; flex-direction: column; gap: 14px; flex: 1; min-height: 340px; font-family: var(--font-ui); }
  .lead { margin: 0; font-size: 14px; font-weight: 400; color: var(--muted); line-height: 1.5; }
  .drop { padding: 34px 20px; border: 1.5px dashed rgba(255, 255, 255, 0.45); border-radius: 16px; background: rgba(255, 255, 255, 0.05); display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; cursor: pointer; font-family: var(--font-ui); color: inherit; }
  .drop.over, .drop:hover { background: rgba(255, 255, 255, 0.1); border-color: var(--accent); }
  .circle { width: 48px; height: 48px; border-radius: 24px; background: color-mix(in srgb, var(--accent) 18%, transparent); display: flex; align-items: center; justify-content: center; }
  .big { font-size: 16px; font-weight: 700; color: var(--ink); line-height: 1.35; }
  .small { font-size: 13px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .grow { flex: 1; }
  .bottom { display: flex; flex-direction: column; gap: 8px; }
  .foot { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; text-align: center; }
  .foot.left { text-align: left; }
  .file { display: flex; align-items: center; gap: 12px; }
  .fname { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .n { font-size: 14px; font-weight: 600; color: var(--ink); line-height: 1.35; overflow-wrap: anywhere; }
  .m { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .work { display: flex; flex-direction: column; gap: 8px; }
  .track { height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.18); position: relative; }
  .fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; background: var(--accent); transition: width 0.3s ease; }
  .steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .steps li { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 400; color: var(--ink); line-height: 1.35; }
  .steps li.active { font-weight: 600; }
  .steps li.pending { color: var(--muted); }
  .ring { width: 16px; height: 16px; border-radius: 50%; box-sizing: border-box; }
  .ring.spin { border: 2px solid var(--accent); border-top-color: transparent; animation: spin 0.9s linear infinite; }
  .ring.dim { border: 2px solid rgba(255, 255, 255, 0.25); }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .ring.spin { animation: none; }
    .fill { transition: none; }
  }
  .can { display: flex; flex-direction: column; gap: 6px; }
  .label { font-size: 12px; font-weight: 700; color: var(--muted); line-height: 1.35; letter-spacing: 0.1em; text-transform: uppercase; }
  .item { font-size: 14px; font-weight: 400; color: var(--ink); line-height: 1.35; }
  .hidden { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
</style>

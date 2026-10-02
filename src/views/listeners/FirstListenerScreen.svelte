<script lang="ts">
  import Aura from '../../components/Aura.svelte';
  import Avatar from '../../components/Avatar.svelte';
  import Button from '../../components/Button.svelte';
  import Glyph from './Glyph.svelte';
  import NameField from './NameField.svelte';
  import { nameFeedback, nameProblem } from '../../lib/listenerText';

  interface Props {
    name?: string;
    /** Avatar hue; defaults to one derived from the name. */
    hue?: number;
    busy?: boolean;
    /** What went wrong the last time (name taken, server unreachable). */
    error?: string | null;
    onsubmit?: () => void;
  }
  let { name = $bindable(''), hue, busy = false, error = null, onsubmit }: Props = $props();

  const feedback = $derived(error ?? nameFeedback(name, []));
  const canSubmit = $derived(nameProblem(name) === null && !busy);

  function submit(e: Event) {
    e.preventDefault();
    if (canSubmit) onsubmit?.();
  }
</script>

<main class="screen">
  <Aura />
  <form class="col" onsubmit={submit} novalidate>
    <div class="top"></div>
    <div class="pad">
      <div class="intro">
        <div class="logo"><Glyph name="book" size={24} /></div>
        <h1>Welcome to Bardic</h1>
        <p>Turn books you own into audiobooks. Add your name so Bardic can keep your place. Other people can add theirs later.</p>
      </div>
    </div>
    <div class="pad">
      <div class="who">
        <Avatar {name} {hue} size={64} />
        <div class="grow">
          <NameField id="first-listener-name" label="Your name" bind:value={name} height={52} fontSize={17} invalid={!!feedback} describedby={feedback ? 'first-listener-err' : undefined} />
          {#if feedback}<span class="err" id="first-listener-err" role="alert">{feedback}</span>{/if}
        </div>
      </div>
    </div>
    <div class="pad strut"><span class="note">Names are not passwords. Anyone on your network can pick any listener.</span></div>
    <div class="grow"></div>
    <div class="foot">
      <Button type="submit" size={52} style="width:100%" disabled={!canSubmit}>Continue</Button>
      <span class="small">You can change this any time in Settings.</span>
    </div>
  </form>
</main>

<style>
  span { line-height: 1.35; }
  .screen { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--base); font-family: var(--font-ui); color: var(--ink); }
  .col { position: relative; display: flex; flex-direction: column; gap: 22px; height: 100%; margin: 0; }
  .top { height: 72px; }
  .pad { padding: 0 24px; }
  /* The design draws these as inline text in a plain block, so the line box also holds the browser's default text strut; the same here keeps the lines where the board has them. */
  .strut { font-family: serif; line-height: normal; }

  .intro { display: flex; flex-direction: column; gap: 12px; }
  .logo { color: #1a1206; width: 44px; height: 44px; border-radius: 12px; background: var(--accent); display: flex; align-items: center; justify-content: center; }
  h1 { margin: 0; font-size: 32px; font-weight: 700; color: var(--ink); letter-spacing: -0.025em; line-height: 1.1; }
  p { margin: 0; font-size: 15px; color: var(--muted); line-height: 1.5; }
  .who { display: flex; align-items: center; gap: 14px; }
  .grow { flex: 1; min-width: 0; }
  .note { font-family: var(--font-ui); font-size: 13px; color: var(--muted); line-height: 1.5; }
  .err { display: block; margin-top: 6px; font-size: 12px; font-weight: 600; color: #ffbcae; }
  .foot { display: flex; flex-direction: column; gap: 8px; padding: 0 20px 32px; }
  .small { font-size: 12px; color: var(--muted); text-align: center; }
  @media (max-width: 300px) {
    .screen { overflow-y: auto; }
    .col { height: auto; min-height: 100%; }
    .top { height: 24px; }
    .who { flex-wrap: wrap; }
    .who .grow { flex-basis: 100%; }
    h1 { overflow-wrap: anywhere; }
  }
</style>

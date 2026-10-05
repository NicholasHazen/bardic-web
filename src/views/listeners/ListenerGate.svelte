<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import Aura from '../../components/Aura.svelte';
  import Button from '../../components/Button.svelte';
  import { installListenerGuard, listenerStore, currentListener, type Listener } from '../../state/listener';
  import AddListenerSheet from './AddListenerSheet.svelte';
  import ChooserScreen from './ChooserScreen.svelte';
  import { rowsOf, saveErrorText } from './connect';
  import FirstListenerScreen from './FirstListenerScreen.svelte';

  interface Props {
    /** The app, shown once a listener is selected on this device. */
    children: Snippet<[Listener]>;
  }
  let { children }: Props = $props();

  onMount(() => {
    installListenerGuard();
    void listenerStore.load();
  });

  const me = $derived(currentListener($listenerStore));

  // L1
  let firstName = $state('');
  let firstBusy = $state(false);
  let firstError = $state<string | null>(null);
  async function createFirst() {
    firstBusy = true;
    firstError = null;
    const r = await listenerStore.create(firstName, { select: true });
    firstBusy = false;
    if (!r.ok) firstError = saveErrorText(r.error);
  }
  $effect(() => {
    firstName; // typing clears the last error
    firstError = null;
  });

  // L2
  let adding = $state(false);
</script>

{#if $listenerStore.phase === 'ready' && me}
  {@render children(me)}
{:else if $listenerStore.phase === 'ready'}
  <!-- Selected here but the server could not be read, so the name is not known yet. -->
  <div class="gate" role="status">
    <Aura />
    <p class="msg">Opening Bardic…</p>
  </div>
{:else if $listenerStore.phase === 'first'}
  <div class="gate"><FirstListenerScreen bind:name={firstName} busy={firstBusy} error={firstError} onsubmit={createFirst} /></div>
{:else if $listenerStore.phase === 'choose'}
  <div class="gate">
    <ChooserScreen listeners={rowsOf($listenerStore.listeners)} onpick={(id) => listenerStore.select(id)} onadd={() => (adding = true)} />
    {#if adding}<AddListenerSheet onadded={() => (adding = false)} onclose={() => (adding = false)} />{/if}
  </div>
{:else if $listenerStore.phase === 'unreachable'}
  <div class="gate">
    <Aura />
    <div class="center">
      <h1>Can&rsquo;t reach your Bardic computer</h1>
      <p>Nothing is lost. Check that it is on and that this device is on the same network, then try again.</p>
      <Button size={52} onclick={() => listenerStore.load()}>Try again</Button>
    </div>
  </div>
{:else}
  <div class="gate" role="status" aria-busy="true">
    <Aura />
    <p class="msg">Opening Bardic…</p>
  </div>
{/if}

<style>
  .gate { position: fixed; inset: 0; overflow: hidden; background: var(--base); color: var(--ink); font-family: var(--font-ui); line-height: 1.35; }
  .msg { position: relative; margin: 0; padding-top: 40vh; text-align: center; font-size: 15px; color: var(--muted); }
  .center { position: relative; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 14px; padding: 0 24px; }
  h1 { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; }
  p { margin: 0; font-size: 15px; color: var(--muted); line-height: 1.5; }
  .center p { margin-bottom: 8px; }
</style>

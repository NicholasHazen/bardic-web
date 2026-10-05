<script lang="ts">
  import Aura from '../../components/Aura.svelte';
  import Avatar from '../../components/Avatar.svelte';
  import Badge from '../../components/Badge.svelte';
  import Button from '../../components/Button.svelte';
  import Glass from '../../components/Glass.svelte';
  import Glyph from './Glyph.svelte';
  import RoundButton from './RoundButton.svelte';
  import type { ListenerRow } from './types';

  interface Props {
    listeners: ListenerRow[];
    /** The listener chosen on this device. */
    currentId: string | null;
    /** The explanation above the list and the Add button below it. Left out while a sheet covers them. */
    intro?: boolean;
    /** The "This device" badge on the selected listener. */
    badge?: boolean;
    onback?: () => void;
    onedit?: (id: string) => void;
    onadd?: () => void;
    /** The live Settings page already supplies its main landmark through Shell. */
    embedded?: boolean;
  }
  let { listeners, currentId, intro = true, badge = true, onback, onedit, onadd, embedded = false }: Props = $props();
</script>

<svelte:element this={embedded ? 'section' : 'main'} class="screen" aria-label={embedded ? 'Listeners' : undefined}>
  <Aura />
  <div class="scroll">
  <div class="col">
    <div class="head">
      <RoundButton label="Back" icon="back" onclick={() => onback?.()} />
      <h1>Listeners</h1>
    </div>
    {#if intro}
      <div class="pad strut"><span class="desc">Everyone here shares this library and its monthly Allowance. Each listener keeps their own place in every book. Listeners are not passwords.</span></div>
    {/if}
    <section class="section" aria-labelledby="listeners-label">
      <h2 id="listeners-label">Listeners · {listeners.length}</h2>
      <Glass radius={16} style="margin:0 20px;overflow:hidden">
        <ul class="rows">
          {#each listeners as l (l.id)}
            <li>
              <Avatar name={l.name} hue={l.hue} size={40} selected={l.id === currentId} />
              <div class="text">
                <div class="line">
                  <span class="name" class:cur={l.id === currentId}>{l.name}</span>
                  {#if badge && l.id === currentId}<Badge>This device</Badge>{/if}
                </div>
                <span class="detail">{l.detail}</span>
              </div>
              <RoundButton label="Edit {l.name}" icon="edit" tone="ghost" iconSize={18} onclick={() => onedit?.(l.id)} />
            </li>
          {/each}
        </ul>
      </Glass>
    </section>
    {#if intro}
      <div class="padb">
        <Button variant="glass" style="width:100%;min-height:48px;border-radius:24px" onclick={() => onadd?.()}><Glyph name="plus" size={18} />Add a listener</Button>
      </div>
      <div class="pad strut"><span class="desc small">Names and places are visible to anyone who opens Bardic. Books, audio, voices and provider keys are not per listener, and paid plans count against the same Allowance.</span></div>
    {/if}
  </div>
  </div>
</svelte:element>

<style>
  span { line-height: 1.35; }
  .screen { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--base); font-family: var(--font-ui); color: var(--ink); }
  .scroll { position: relative; height: 100%; overflow-y: auto; scrollbar-width: none; }
  .scroll::-webkit-scrollbar { display: none; }
  .col { position: relative; display: flex; flex-direction: column; gap: 14px; min-height: 100%; padding-bottom: 24px; box-sizing: border-box; }
  .head { display: flex; align-items: center; gap: 4px; padding: 8px 12px 0; }
  h1 { line-height: 1.35; margin: 0 0 0 4px; flex: 1; font-size: 20px; font-weight: 700; color: var(--ink); }
  .pad { padding: 0 24px; }
  .padb { padding: 0 20px; }
  .desc { font-family: var(--font-ui); font-size: 14px; color: var(--muted); line-height: 1.5; }
  .desc.small { font-size: 13px; }
  /* The design draws these as inline text in a plain block, so the line box also holds the browser's default text strut; the same here keeps the lines where the board has them. */
  .strut { font-family: serif; line-height: normal; }
  .section { display: flex; flex-direction: column; gap: 8px; }
  h2 { line-height: 1.35; margin: 0; padding: 0 24px; font-size: 12px; font-weight: 700; color: var(--muted); letter-spacing: 0.1em; text-transform: uppercase; }
  .rows { list-style: none; margin: 0; padding: 0; }
  li { min-height: 66px; display: flex; align-items: center; gap: 12px; padding: 8px 6px 8px 14px; box-sizing: border-box; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  li:last-child { border-bottom: 0; }
  .text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .name { font-size: 15px; font-weight: 500; color: var(--ink); max-width: 100%; overflow-wrap: anywhere; }
  .name.cur { font-weight: 700; }
  .detail { font-size: 12px; color: color-mix(in srgb, var(--muted) 94%, var(--ink)); }
  @media (min-width: 768px) {
    .detail { color: var(--ink); }
  }
  @media (max-width: 300px) {
    .col { height: auto; min-height: 100%; overflow: visible; }
    .line { flex-wrap: wrap; }
    .name { white-space: normal; overflow-wrap: anywhere; }
    li { padding-block: 8px; flex-wrap: wrap; }
  }
</style>

<script lang="ts">
  import Aura from '../../components/Aura.svelte';
  import Avatar from '../../components/Avatar.svelte';
  import Glass from '../../components/Glass.svelte';
  import Glyph from './Glyph.svelte';
  import type { ListenerRow } from './types';

  interface Props {
    listeners: ListenerRow[];
    onpick?: (id: string) => void;
    onadd?: () => void;
  }
  let { listeners, onpick, onadd }: Props = $props();
</script>

<div class="screen">
  <Aura />
  <div class="col">
    <div class="top"></div>
    <div class="pad">
      <div class="intro">
        <div class="logo"><Glyph name="book" size={24} /></div>
        <h1>Who&rsquo;s listening?</h1>
        <p>Everyone here shares this library and its monthly Allowance. Each listener keeps their own place in every book. Listeners are not passwords.</p>
      </div>
    </div>
    <div class="list" role="list" aria-label="Listeners">
      {#each listeners as l (l.id)}
        <div role="listitem" class="item">
          <Glass tag="button" type="button" radius={20} class="card" aria-label="{l.name}. {l.detail}" onclick={() => onpick?.(l.id)}>
            <span class="rowin">
              <Avatar name={l.name} hue={l.hue} size={56} />
              <span class="text">
                <span class="name">{l.name}</span>
                <span class="detail">{l.detail}</span>
              </span>
              <span style="color:var(--muted)"><Glyph name="next" size={20} /></span>
            </span>
          </Glass>
        </div>
      {/each}
      <button type="button" class="add" onclick={() => onadd?.()}>
        <span class="plus"><Glyph name="plus" size={22} /></span>
        <span class="addlabel">Add a listener</span>
      </button>
    </div>
    <div class="grow"></div>
    <div class="foot strut"><span>Bardic remembers your choice on this device. Change it any time from Library or Settings.</span></div>
  </div>
</div>

<style>
  span { line-height: 1.35; }
  .screen { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--base); font-family: var(--font-ui); color: var(--ink); }
  .col { position: relative; display: flex; flex-direction: column; gap: 20px; height: 100%; }
  .top { height: 36px; flex-shrink: 0; }
  .pad { padding: 0 24px; }
  .intro { display: flex; flex-direction: column; gap: 10px; }
  .logo { color: #1a1206; width: 44px; height: 44px; border-radius: 12px; background: var(--accent); display: flex; align-items: center; justify-content: center; }
  h1 { margin: 0; font-size: 32px; font-weight: 700; color: var(--ink); letter-spacing: -0.025em; line-height: 1.1; }
  p { margin: 0; font-size: 14px; color: var(--muted); line-height: 1.5; }
  .list { padding: 0 20px; display: flex; flex-direction: column; gap: 12px; }
  .item { display: block; }
  .item :global(.card) { width: 100%; min-height: 76px; padding: 0 18px; display: flex; align-items: center; text-align: left; font-family: inherit; }
  .item :global(.card):focus-visible, .add:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .rowin { display: flex; align-items: center; gap: 14px; width: 100%; }
  .text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .name { font-size: 19px; font-weight: 700; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .detail { font-size: 13px; color: var(--muted); }
  .add { min-height: 76px; border-radius: 20px; border: 1.5px dashed rgba(255, 255, 255, 0.4); background: transparent; display: flex; align-items: center; gap: 14px; padding: 0 18px; box-sizing: border-box; cursor: pointer; text-align: left; color: var(--ink); }
  .plus { width: 56px; height: 56px; border-radius: 50%; border: 1.5px dashed rgba(255, 255, 255, 0.4); display: flex; align-items: center; justify-content: center; box-sizing: border-box; }
  .addlabel { font-size: 17px; font-weight: 600; color: var(--ink); }
  .grow { flex: 1; }
  .foot { padding: 0 24px 32px; }
  /* The design draws these as inline text in a plain block, so the line box also holds the browser's default text strut; the same here keeps the lines where the board has them. */
  .strut { font-family: serif; line-height: normal; }

  .foot span { font-family: var(--font-ui); font-size: 13px; color: var(--muted); }
</style>

<script lang="ts">
  import Avatar from '../../components/Avatar.svelte';
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import Glass from '../../components/Glass.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import Glyph from './Glyph.svelte';
  import type { ListenerRow } from './types';

  interface Props {
    listeners: ListenerRow[];
    currentId: string | null;
    /** Set while audio is playing: the switcher says that switching pauses it (L4). */
    playing?: { bookTitle: string } | null;
    placement?: 'bottom' | 'popover';
    fixed?: boolean;
    onselect?: (id: string) => void;
    onadd?: () => void;
    onmanage?: () => void;
    onclose?: () => void;
  }
  let { listeners, currentId, playing = null, placement = 'bottom', fixed = false, onselect, onadd, onmanage, onclose }: Props = $props();

  const current = $derived(listeners.find((l) => l.id === currentId));
  const other = $derived(listeners.find((l) => l.id !== currentId));
  const popover = $derived(placement === 'popover');
  const bs = $derived(popover ? 44 : 48);
</script>

<Sheet title="Switch listener" eyebrow="Listening as" {placement} {fixed} {onclose}>
  <Glass radius={16} style="overflow:hidden">
    <ul class="rows" aria-label="Listeners">
      {#each listeners as l (l.id)}
        <li>
          <button type="button" class="row" aria-current={l.id === currentId ? 'true' : undefined} onclick={() => onselect?.(l.id)}>
            <Avatar name={l.name} hue={l.hue} size={40} selected={l.id === currentId} />
            <span class="text">
              <span class="name" class:cur={l.id === currentId}>{l.name}</span>
              <span class="detail">{l.detail}</span>
            </span>
            {#if l.id === currentId}<span style="color:var(--accent)"><Glyph name="check" size={20} /></span>{/if}
          </button>
        </li>
      {/each}
    </ul>
  </Glass>
  {#if playing}
    <Callout title="Switching pauses playback">
      {playing.bookTitle} stays where it is for {current?.name ?? 'you'}.{#if other} {other.name} starts from {other.name}&rsquo;s own places.{/if}
    </Callout>
  {/if}
  <div class="actions">
    <Button variant="glass" style="height:{bs}px;border-radius:{bs / 2}px" onclick={() => onadd?.()}>
      <Glyph name="plus" size={18} />{popover ? 'Add' : 'Add a listener'}
    </Button>
    <Button variant="glass" style="height:{bs}px;border-radius:{bs / 2}px" onclick={() => onmanage?.()}>Manage listeners</Button>
  </div>
</Sheet>

<style>
  span { line-height: 1.35; }
  .rows { list-style: none; margin: 0; padding: 0; }
  li:not(:last-child) .row { border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  .row { width: 100%; min-height: 64px; display: flex; align-items: center; gap: 12px; padding: 0 14px; box-sizing: border-box; background: transparent; border: 0 solid transparent; cursor: pointer; text-align: left; color: var(--ink); font-family: inherit; }
  .row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .name { font-size: 15px; font-weight: 500; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name.cur { font-weight: 700; }
  .detail { font-size: 12px; color: var(--muted); }
  .actions { display: flex; align-items: center; gap: 10px; }
</style>

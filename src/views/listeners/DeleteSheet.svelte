<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Glass from '../../components/Glass.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import Glyph from './Glyph.svelte';
  import { booksStartedText, joinNames } from '../../lib/listenerText';

  interface Props {
    name: string;
    /** Everyone else, for "Nick, Riley and Jo keep their places." */
    otherNames: string[];
    /** From getListenerImpact. null while loading or when it could not be read: shown as unknown, never as none. */
    booksStarted: number | null;
    busy?: boolean;
    error?: string | null;
    fixed?: boolean;
    onconfirm?: () => void;
    onclose?: () => void;
  }
  let { name, otherNames, booksStarted, busy = false, error = null, fixed = false, onconfirm, onclose }: Props = $props();

  const lost = $derived(
    booksStarted === null ? 'How many books were started could not be read. Earlier places go too.' : `${booksStartedText(booksStarted)} Earlier places go too.`,
  );
</script>

<Sheet title="Delete {name}?" eyebrow="Listeners · {name}" {fixed} {onclose}>
  <Glass radius={16} style="overflow:hidden;flex-shrink:0">
    <ul class="rows">
      <li>
        <span style="color:#ffbcae"><Glyph name="x" size={18} /></span>
        <span class="text"><span class="t">{name}&rsquo;s places and finished marks</span><span class="d">{lost}</span></span>
      </li>
      <li>
        <span style="color:#c3f0ba"><Glyph name="check" size={18} /></span>
        <span class="text"><span class="t">Books, audio and analysis stay</span><span class="d">Nothing in the library changes.</span></span>
      </li>
      <li>
        <span style="color:#c3f0ba"><Glyph name="check" size={18} /></span>
        <span class="text">
          <span class="t">Other listeners are not affected</span>
          <span class="d">{otherNames.length ? `${joinNames(otherNames)} ${otherNames.length === 1 ? 'keeps' : 'keep'} their places.` : 'Nobody else has places to lose.'}</span>
        </span>
      </li>
    </ul>
  </Glass>
  <span class="para">This can&rsquo;t be undone. {name} can be added again but starts with no places.</span>
  {#if error}<span class="para err" role="alert">{error}</span>{/if}
  <div class="actions">
    <Button variant="remove" size={52} style="width:100%" disabled={busy} onclick={() => onconfirm?.()}><Glyph name="trash" size={18} />Delete {name}</Button>
    <Button variant="glass" style="width:100%;min-height:48px;border-radius:24px" onclick={() => onclose?.()}>Keep {name}</Button>
  </div>
</Sheet>

<style>
  span { line-height: 1.35; }
  .rows { list-style: none; margin: 0; padding: 0; }
  li { min-height: 58px; display: flex; align-items: center; gap: 12px; padding: 8px 14px; box-sizing: border-box; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  li:last-child { border-bottom: 0; }
  .text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .t { font-size: 14px; font-weight: 600; color: var(--ink); }
  .d { font-size: 12px; color: var(--muted); }
  .para { font-size: 13px; color: var(--muted); }
  .para.err { color: #ffbcae; font-weight: 600; }
  .actions { display: flex; flex-direction: column; gap: 8px; }
</style>

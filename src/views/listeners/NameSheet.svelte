<script lang="ts">
  import Avatar from '../../components/Avatar.svelte';
  import Button from '../../components/Button.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import Glyph from './Glyph.svelte';
  import NameField from './NameField.svelte';
  import { NAME_MAX, nameLength, nameProblem } from '../../lib/listenerText';

  interface Props {
    mode: 'add' | 'edit';
    /** Small line above the title, e.g. "Listeners · Sam". */
    eyebrow: string;
    name?: string;
    hue?: number;
    /** The name the avatar letter comes from. Defaults to the typed name; an edit keeps the stored one. */
    avatarName?: string;
    /** Why the name cannot be used: another listener has it, or the server said no. Replaces the hint. */
    error?: string | null;
    /** edit: the name is what is stored, so there is nothing to save yet. */
    unchanged?: boolean;
    /** edit: this is the only listener, which cannot be deleted. */
    onlyOne?: boolean;
    busy?: boolean;
    fixed?: boolean;
    onsave?: () => void;
    ondelete?: () => void;
    onclose?: () => void;
  }
  let {
    mode,
    eyebrow,
    name = $bindable(''),
    hue,
    avatarName,
    error = null,
    unchanged = false,
    onlyOne = false,
    busy = false,
    fixed = false,
    onsave,
    ondelete,
    onclose,
  }: Props = $props();

  const title = $derived(mode === 'add' ? 'Add a listener' : 'Edit listener');
  const canSave = $derived(!busy && !error && nameProblem(name) === null && !(mode === 'edit' && unchanged));

  function submit(e: Event) {
    e.preventDefault();
    if (canSave) onsave?.();
  }
</script>

<Sheet {title} {eyebrow} {fixed} {onclose}>
  <form class="form" onsubmit={submit} novalidate>
    <div class="who">
      <Avatar name={avatarName ?? name} {hue} size={56} />
      <div class="grow strut">
        <NameField
          id="listener-name-{mode}"
          label="Name"
          bind:value={name}
          counter="{nameLength(name)} of {NAME_MAX}"
          invalid={!!error}
          describedby="listener-name-note-{mode}"
        />
        {#if error}
          <span class="note err" id="listener-name-note-{mode}" role="alert">{error}</span>
        {:else}
          <span class="note" id="listener-name-note-{mode}">1 to 40 characters. Names are not case-sensitive.</span>
        {/if}
      </div>
    </div>
    {#if mode === 'add'}
      <span class="para">They start with no places and can open any book in the library. Nothing is copied from another listener.</span>
    {/if}
    <div class="actions">
      {#if mode === 'add'}
        <Button type="submit" size={52} style="width:100%" disabled={!canSave}>Add listener</Button>
        <Button variant="text" style="width:100%;color:var(--ink)" onclick={() => onclose?.()}>Cancel</Button>
      {:else}
        <Button type="submit" size={52} style="width:100%" disabled={!canSave}>Save name</Button>
        <div class="del">
          {#if onlyOne}
            <Button variant="text" style="padding:0;color:var(--muted);opacity:.6;background:transparent;border-color:transparent" disabled>
              <Glyph name="trash" size={18} />Delete listener
            </Button>
          {:else}
            <Button variant="text" style="padding:0;color:#ffbcae" onclick={() => ondelete?.()}>
              <Glyph name="trash" size={18} />Delete listener
            </Button>
          {/if}
        </div>
        {#if onlyOne}<span class="only">Bardic always keeps one listener, so the last one can&rsquo;t be deleted.</span>{/if}
      {/if}
    </div>
  </form>
</Sheet>

<style>
  span { line-height: 1.35; }
  .form { display: flex; flex-direction: column; gap: 14px; margin: 0; }
  .who { display: flex; align-items: flex-start; gap: 14px; }
  .grow { flex: 1; min-width: 0; }
  /* The design draws the hint as inline text under the field, so the line box also holds the browser's default text strut. */
  .strut { font-family: serif; line-height: normal; }
  .note { font-family: var(--font-ui); font-size: 12px; color: var(--muted); }
  .note.err { font-weight: 600; color: #ffbcae; }
  .para { font-size: 13px; color: var(--muted); }
  .actions { display: flex; flex-direction: column; gap: 8px; }
  .del { display: flex; align-items: center; justify-content: center; }
  .only { font-size: 12px; color: var(--muted); text-align: center; }
</style>

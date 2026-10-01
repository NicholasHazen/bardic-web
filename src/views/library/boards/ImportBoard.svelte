<script lang="ts">
  import Aura, { type Glow } from '../../../components/Aura.svelte';
  import * as fx from '../../../fixtures/library';
  import { importErrorCopy } from '../../../state/imports';
  import AddBookPanel from '../AddBookPanel.svelte';
  import SheetCard from '../SheetCard.svelte';

  const glows: Glow[] = [
    { x: -189, y: -168, size: 801, color: 'var(--glow)', opacity: 0.55, blur: 90 },
    { x: 890, y: 420, size: 759, color: 'var(--glow2)', opacity: 0.42, blur: 100 },
    { x: -126, y: 546, size: 590, color: 'var(--glow)', opacity: 0.22, blur: 90 },
  ];
  const states = ['1 · Choose', '2 · File chosen', '3 · Adding', '4 · Could not add'];
</script>

<div class="board">
  <Aura {glows} />
  <div class="row">
    <div class="col">
      <span class="tag">{states[0]}</span>
      <SheetCard eyebrow="Library" title="Add a book"><AddBookPanel phase="choose" /></SheetCard>
    </div>
    <div class="col">
      <span class="tag">{states[1]}</span>
      <SheetCard eyebrow="Library" title="Add a book"><AddBookPanel phase="chosen" file={fx.importFile} /></SheetCard>
    </div>
    <div class="col">
      <span class="tag">{states[2]}</span>
      <SheetCard eyebrow="Library" title="Add a book"><AddBookPanel phase="working" file={fx.importFile} stage="finding_chapters" progress={0.38} /></SheetCard>
    </div>
    <div class="col">
      <span class="tag">{states[3]}</span>
      <SheetCard eyebrow="Library" title="Add a book"><AddBookPanel phase="failed" error={importErrorCopy('import_drm_protected')} /></SheetCard>
    </div>
  </div>
</div>

<style>
  .board { width: 1780px; height: 700px; position: relative; overflow: hidden; background: var(--base); font-family: var(--font-ui); }
  .row { position: relative; display: flex; align-items: flex-start; gap: 30px; padding: 40px; box-sizing: border-box; }
  .col { display: flex; flex-direction: column; gap: 10px; }
  .tag { font-size: 12px; font-weight: 700; color: var(--muted); line-height: 1.35; letter-spacing: 0.14em; text-transform: uppercase; }
</style>

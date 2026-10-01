<script lang="ts">
  import Aura, { PHONE_GLOWS } from '../../../components/Aura.svelte';
  import * as fx from '../../../fixtures/book';
  import RoundButton from '../../shell/RoundButton.svelte';
  import MakeReadySheet from '../MakeReadySheet.svelte';

  // Behind the sheet: the listening screen the book was made ready from, dimmed by the sheet's scrim.
  const glows = PHONE_GLOWS.map((g) => ({ ...g, opacity: g.opacity * 0.7 }));
</script>

<div class="board">
  <Aura {glows} />
  <div class="behind">
    <div class="bar"><RoundButton label="Minimise" icon="chevron" /></div>
    <div class="pad"><span class="title">The Ferryman’s Ledger</span></div>
  </div>
  <MakeReadySheet model={fx.makeSheet} onclose={() => {}} />
</div>

<style>
  .board { width: 390px; height: 844px; position: relative; overflow: hidden; background: var(--base); color: var(--ink); font-family: var(--font-ui); }
  .behind { position: relative; }
  .bar { display: flex; align-items: center; padding: 8px 16px; }
  .pad { padding: 20px 26px; }
  .title { font-size: 30px; font-weight: 700; color: var(--ink); line-height: 1.35; letter-spacing: -0.02em; }
</style>

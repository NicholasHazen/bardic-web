<script lang="ts">
  import type { GenerationModel } from '../../lib/generationProgress';
  let { model }: { model: GenerationModel } = $props();
</script>

<div class="generation" data-generation-progress>
  <span class="title">{model.title}</span>
  <span>{model.detail}</span>
  <div class="track" role="progressbar" aria-label="Audio generation for {model.title}" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.floor(model.fraction * 100)} aria-valuetext={model.detail}>
    <div class="fill" style:width="{model.fraction * 100}%"></div>
  </div>
  <span>{model.chapterTime}</span>
  <span>{model.jobTime}</span>
  <span>Based on completed requests. Estimates can change; audio is Ready when the chapter is saved.</span>
</div>

<style>
  .generation { display: flex; flex-direction: column; gap: 6px; color: var(--muted); font: 12px/1.45 var(--font-ui); overflow-wrap: anywhere; }
  .title { color: var(--ink); font-weight: 600; }
  .track { position: relative; height: 6px; flex: 0 0 6px; border-radius: 6px; background: rgba(255, 255, 255, 0.18); }
  .fill { position: absolute; inset: 0 auto 0 0; border-radius: 6px; background: var(--accent); }
</style>

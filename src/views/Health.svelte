<script lang="ts">
  import { api } from '../api/client';

  let status = $state<'checking' | 'ok' | 'down'>('checking');
  let name = $state('');
  let version = $state('');

  $effect(() => {
    (async () => {
      try {
        const h = await api.GET('/api/health');
        if (!h.response.ok) throw new Error();
        const s = await api.GET('/api/server');
        name = s.data?.name ?? '';
        version = s.data?.api_version ?? '';
        status = 'ok';
      } catch {
        status = 'down';
      }
    })();
  });
</script>

<main>
  <h1>Bardic</h1>
  {#if status === 'checking'}
    <p>Looking for your Bardic computer…</p>
  {:else if status === 'ok'}
    <p>Connected to {name} (contract {version}).</p>
  {:else}
    <p>Can’t reach your Bardic computer.</p>
  {/if}
</main>

<style>
  main { padding: 24px; }
  h1 { font-size: 38px; letter-spacing: -0.02em; margin: 0 0 8px; }
  p { color: var(--muted); }
</style>

<script lang="ts">
  // The full Settings screen is milestone W2 (`[Settings]`). Until then it only offers what W1 built.
  let { onswitchlistener }: { onswitchlistener?: () => void } = $props();
</script>

<main>
  <header>
    <h1>Settings</h1>
    <button type="button" class="who" onclick={onswitchlistener}>Change listener</button>
  </header>
  <ul>
    <li><a href="#/settings/listeners">Listeners</a></li>
  </ul>
</main>

<style>
  main { padding: 16px 20px; min-height: 100%; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  h1 { font-size: 32px; letter-spacing: -0.02em; margin: 0; }
  .who { min-height: 44px; border-radius: 22px; padding: 0 16px; background: var(--glass-control); border: 1px solid var(--edge); color: var(--ink); }
  ul { list-style: none; padding: 0; margin: 24px 0 0; }
  a { display: flex; align-items: center; min-height: 44px; color: var(--ink); text-decoration: none; border-bottom: 1px solid var(--edge); }
</style>

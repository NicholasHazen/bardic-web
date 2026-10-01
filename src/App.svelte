<script lang="ts">
  import { route } from './lib/router';
  import Board from './views/Board.svelte';
  import Health from './views/Health.svelte';
  import { ListenerGate, ListenerSwitcher, ListenerManager } from './views/listeners';
  import { HomeScreen, LibraryScreen, ManageScreen, Shell, tabForRoute, isTablet } from './views/library';
  import { SettingsScreen } from './views/settings';
  import { VoiceSourcesScreen, BreezeServerScreen, DefaultVoiceScreen } from './views/voices';
  import { BookScreen } from './views/book';
  import { MiniPlayerHost, NowPlayingScreen, startListening } from './views/nowplaying';

  let switching = $state(false);
  const open = () => (switching = true);
  const close = () => (switching = false);

  const active = $derived(tabForRoute($route));
  const go = (hash: string) => (location.hash = hash);
</script>

{#if $route.startsWith('/board/')}
  <Board name={$route.slice('/board/'.length)} />
{:else if $route === '/health'}
  <Health />
{:else}
  <ListenerGate>
    {#if $route.startsWith('/listen/')}
      <NowPlayingScreen bookId={$route.slice('/listen/'.length)} />
    {:else if $route.startsWith('/book/')}
      <!-- draws its own shell: the page takes its palette from the cover -->
      <BookScreen bookId={$route.slice('/book/'.length)} onswitchlistener={open} />
    {:else if $route === '/library/manage'}
      <ManageScreen />
    {:else if $route === '/settings/listeners'}
      <ListenerManager onback={() => go('#/settings')} />
    {:else}
      <Shell {active} onswitchlistener={open}>
        {#snippet player()}<MiniPlayerHost />{/snippet}
        {#if $route === '/library'}
          <LibraryScreen onswitchlistener={open} />
        {:else if $route === '/settings'}
          <SettingsScreen onswitchlistener={open} />
        {:else if $route === '/settings/voices'}
          <VoiceSourcesScreen />
        {:else if $route === '/settings/voices/breeze'}
          <BreezeServerScreen />
        {:else if $route === '/settings/voices/default'}
          <DefaultVoiceScreen />
        {:else}
          <HomeScreen onswitchlistener={open} onplay={(id) => void startListening(id)} />
        {/if}
      </Shell>
    {/if}
    {#if switching}
      <ListenerSwitcher
        placement={$isTablet ? 'popover' : 'bottom'}
        onclose={close}
        onmanage={() => {
          close();
          go('#/settings/listeners');
        }}
      />
    {/if}
  </ListenerGate>
{/if}

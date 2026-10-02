<script lang="ts">
  import { onMount } from 'svelte';
  import { browserStorage } from './lib/clock';
  import { route } from './lib/router';
  import { offline } from './offline/offline';
  import { currentListener, listenerStore } from './state/listener';
  import Board from './views/Board.svelte';
  import Health from './views/Health.svelte';
  import { ListenerGate, ListenerSwitcher, ListenerManager } from './views/listeners';
  import { HomeScreen, LibraryScreen, ManageScreen, Shell, tabForRoute, isTablet } from './views/library';
  import { SettingsScreen } from './views/settings';
  import { AllowanceScreen, PremiumAccountScreen } from './views/account';
  import { VoiceSourcesScreen, BreezeServerScreen, DefaultVoiceScreen } from './views/voices';
  import { BookScreen } from './views/book';
  import { MiniPlayerHost, NowPlayingScreen, startListening } from './views/nowplaying';
  import DownloadsHost from './views/offline/connected/DownloadsHost.svelte';
  import OfflineBookPage from './views/offline/connected/OfflineBookPage.svelte';
  import OfflineHome from './views/offline/connected/OfflineHome.svelte';
  import OfflineServerHost from './views/offline/connected/OfflineServerHost.svelte';
  import { rememberListenerName } from './views/offline/connected/listenerName';
  import DeletionBannerHost from './views/manage/DeletionBannerHost.svelte';
  import ServerNameScreen from './views/manage/ServerNameScreen.svelte';
  import ReaderSettingsScreen from './views/settings/ReaderSettingsScreen.svelte';
  import ListeningScreen from './views/settings/ListeningScreen.svelte';
  import { followServer } from './state/manage';
  import { serverName } from './state/serverName';
  import LibraryToast from './views/library/LibraryToast.svelte';
  import { readerPreferences } from './state/reader';
  import { player } from './player/player';
  import { holdReaderScreen } from './lib/wakeLock';

  let switching = $state(false);
  const open = () => (switching = true);
  const close = () => (switching = false);

  const active = $derived(tabForRoute($route));
  const go = (hash: string) => (location.hash = hash);

  // Away from home (O4): the Bardic computer cannot be reached and this device remembers who is listening. The listener
  // list lives on the server, so this view does not wait for it; the app comes back by itself when the server does.
  const away = $derived(!$offline.online && !!$listenerStore.currentId);
  const awayBookId = $derived($route.startsWith('/book/') ? $route.slice('/book/'.length) : '');
  const awayHolds = $derived(!!awayBookId && $offline.books.some((b) => b.bookId === awayBookId && b.chapters.some((c) => c.state === 'on_device' || c.state === 'out_of_date')));
  onMount(() => {
    // Safe to repeat: the remembered listener is selected at once, before the server answers.
    void listenerStore.load();
    return serverName.subscribe(() => {});
  });
  $effect(() => {
    if (!$route.startsWith('/board/')) return followServer($listenerStore.currentId);
  });
  $effect(() => {
    if ($route.startsWith('/listen/') && $player.mode === 'read' && $player.playing && $readerPreferences.extras.keepScreenOn) return holdReaderScreen();
  });
  // The name is kept so Home can greet the listener when the list cannot be read.
  $effect(() => {
    const me = currentListener($listenerStore);
    if (me) rememberListenerName(browserStorage(), me.id, me.name);
  });
</script>

{#if $route.startsWith('/board/')}
  <Board name={$route.slice('/board/'.length)} />
{:else if $route === '/health'}
  <Health />
{:else}
  {#if away}
    {#if $route.startsWith('/listen/')}
      <NowPlayingScreen bookId={$route.slice('/listen/'.length)} />
    {:else if awayHolds}
      <OfflineBookPage bookId={awayBookId} />
    {:else}
      <Shell {active}>
        {#snippet player()}<MiniPlayerHost />{/snippet}
        {#if $route === '/'}
          <OfflineHome />
        {:else if $route === '/settings'}
          <SettingsScreen />
        {:else if $route === '/settings/downloads'}
          <DownloadsHost />
        {:else if $route === '/settings/reader'}
          <ReaderSettingsScreen />
        {:else if $route === '/settings/listening'}
          <ListeningScreen />
        {:else}
          <OfflineServerHost />
        {/if}
      </Shell>
    {/if}
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
        {:else if $route === '/settings/downloads'}
          <DownloadsHost />
        {:else if $route === '/settings/premium'}
          <PremiumAccountScreen />
        {:else if $route === '/settings/allowance'}
          <AllowanceScreen />
        {:else if $route === '/settings/about'}
          <ServerNameScreen />
        {:else if $route === '/settings/reader'}
          <ReaderSettingsScreen />
        {:else if $route === '/settings/listening'}
          <ListeningScreen />
        {:else}
          <HomeScreen onswitchlistener={open} onplay={(id) => void startListening(id)} />
        {/if}
      </Shell>
    {/if}
    {#if switching}
      <ListenerSwitcher
        playing={$player.playing && $player.book ? { bookTitle: $player.book.title } : null}
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
  <DeletionBannerHost />
  {#if away || $route.startsWith('/listen/')}<LibraryToast />{/if}
{/if}

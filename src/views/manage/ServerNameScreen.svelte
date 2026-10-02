<script lang="ts">
  import { listenerStore } from '../../state/listener';
  import { followServer, serverAddress, serverStore } from '../../state/manage';
  import ServerNameView from './ServerNameView.svelte';
  import { freeSpaceText, serverNameProblem, serverNameProblemText, versionText } from './logic';

  /**
   * About this Bardic ([ServerName], G1, G7): the name every device shows, and what the server reports about itself.
   * Route `#/settings/about`. The server decides what a valid name is (1 to 60 characters); the same rule is checked
   * here first so the problem is said before asking.
   */
  interface Props {
    onback?: () => void;
  }
  let { onback = () => (location.hash = '#/settings') }: Props = $props();

  const listenerId = $derived($listenerStore.currentId);
  $effect(() => followServer(listenerId));

  const saved = $derived($serverStore.server?.name ?? '');
  // The field starts as the saved name once it is read; after that what is typed is the listener's.
  let typed = $state('');
  let touched = $state(false);
  let saving = $state(false);
  let error = $state<string | undefined>();
  let done = $state(false);
  $effect(() => {
    if (!touched) typed = saved;
  });

  const problem = $derived.by(() => {
    if (!touched) return undefined;
    const p = serverNameProblem(typed);
    return p ? serverNameProblemText(p) : undefined;
  });
  const details = $derived.by(() => {
    const s = $serverStore.server;
    return [
      { label: 'Address', value: serverAddress() },
      { label: 'Version', value: s ? versionText(s.version, s.api_version) : '…' },
      // The server does not report where its data folder is; it is not guessed.
      { label: 'Data folder', value: 'Unknown' },
      { label: 'Free space', value: s ? freeSpaceText(s.free_bytes) : '…' },
    ];
  });

  async function save() {
    const p = serverNameProblem(typed);
    if (p) {
      touched = true;
      return;
    }
    saving = true;
    error = undefined;
    done = false;
    const r = await serverStore.rename(typed.trim());
    saving = false;
    if (r.ok) {
      touched = false;
      typed = r.value.name;
      done = true;
    } else error = `${r.detail} The name is still “${saved}”.`;
  }
</script>

<ServerNameView
  name={typed}
  {details}
  {problem}
  {error}
  saved={done}
  {saving}
  loading={$serverStore.status === 'loading' || $serverStore.status === 'idle'}
  unchanged={typed.trim() === saved}
  onname={(v) => ((typed = v), (touched = true), (done = false), (error = undefined))}
  onsave={save}
  {onback}
/>

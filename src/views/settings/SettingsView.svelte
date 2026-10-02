<script lang="ts">
  import Avatar from '../../components/Avatar.svelte';
  import Badge from '../../components/Badge.svelte';
  import Glass from '../../components/Glass.svelte';
  import { sourceStatus, sourceSummary, visibleSources, type VoiceSource } from '../../lib/voiceText';
  import Glyph, { type GlyphName } from '../voices/Glyph.svelte';

  /** Settings (the tab): listener, voices, Allowance and this device. Rows are links; the screens they open are built elsewhere. */
  interface Props {
    listener: { name: string; hue?: number };
    /** "Samantha · free". */
    defaultVoice: string;
    /** Left empty while sources load: Breeze and Gemini are then shown without a status. */
    sources: VoiceSource[];
    /** "No monthly limit · $2.60 spent". */
    allowance: string;
    /** "1.2 GB · 3 books". */
    downloads: string;
    reader?: string;
    /** The About row's second line (the server's name). Left out, the row is not shown: the design's Settings has no About row. */
    about?: string;
    /** Connected Settings offers the listening preferences; board fixtures omit this additional row. */
    listening?: boolean;
    /** Kept for the shell's callers: the listener row opens Listeners, where switching lives. */
    onswitchlistener?: () => void;
  }
  let { listener, defaultVoice, sources, allowance, downloads, reader = 'Colour, size, font, spacing', about, listening = false, onswitchlistener }: Props = $props();

  interface Row {
    key: string;
    icon: GlyphName;
    title: string;
    sub: string;
    href: string;
    badge?: { label: string; tone: 'ready' | 'idle' | 'failed' };
  }
  const known = $derived(sources.length > 0);
  const voiceRows = $derived.by<Row[]>(() => {
    const rows: Row[] = [{ key: 'default', icon: 'headphones', title: 'Default voice', sub: defaultVoice, href: '#/settings/voices/default' }];
    const list = known ? visibleSources(sources) : [];
    const kinds = known ? list.map((s) => s.kind) : (['breeze', 'gemini'] as const);
    for (const kind of kinds) {
      const s = list.find((x) => x.kind === kind);
      const base = { breeze: ['server', 'Breeze', '#/settings/voices/breeze'], gemini: ['key', 'Gemini', '#/settings/premium'], local: ['wave', 'This computer', '#/settings/voices'] } as const;
      const [icon, title, href] = base[kind];
      rows.push({ key: kind, icon, title, href, sub: sourceSummary(s ?? { kind, state: 'not_set_up', voice_count: 0 }), badge: s ? sourceStatus(s) : undefined });
    }
    return rows;
  });
</script>

<div class="col">
  <div class="head"><h1>Settings</h1></div>
  <div class="group">
    <h2>Listener</h2>
    <Glass radius={16} style="margin:0 20px;overflow:hidden">
      <a class="row who" href="#/settings/listeners">
        <Avatar name={listener.name} hue={listener.hue} size={40} selected />
        <span class="text">
          <span class="name strong">{listener.name}</span>
          <span class="sub">Switch or manage listeners</span>
        </span>
        <Glyph name="next" size={16} color="var(--muted)" />
      </a>
      {#if listening}
        <a class="row" href="#/settings/listening">
          <span class="icon"><Glyph name="headphones" size={18} color="var(--ink)" /></span>
          <span class="text"><span class="name">Listening behaviour</span><span class="sub">Next chapter, screen, when places differ</span></span>
          <Glyph name="next" size={16} color="var(--muted)" />
        </a>
      {/if}
    </Glass>
  </div>
  <div class="group">
    <h2>Voices</h2>
    <Glass radius={16} style="margin:0 20px;overflow:hidden">
      {#if listening}
        <a class="row" href="#/settings/voices" aria-label="Voices">
          <span class="icon"><Glyph name="wave" size={18} color="var(--ink)" /></span>
          <span class="text"><span class="name">Voices</span><span class="sub">Sources and examples</span></span>
          <Glyph name="next" size={16} color="var(--muted)" />
        </a>
      {/if}
      {#each voiceRows as r (r.key)}
        <a class="row" href={r.href}>
          <span class="icon"><Glyph name={r.icon} size={18} color="var(--ink)" /></span>
          <span class="text">
            <span class="name">{r.title}</span>
            <span class="sub">{r.sub}</span>
          </span>
          {#if r.badge}<Badge tone={r.badge.tone}>{r.badge.label}</Badge>{/if}
          <Glyph name="next" size={16} color="var(--muted)" />
        </a>
      {/each}
    </Glass>
  </div>
  <div class="group">
    <h2>Allowance</h2>
    <Glass radius={16} style="margin:0 20px;overflow:hidden">
      <a class="row" href="#/settings/allowance">
        <span class="icon"><Glyph name="wallet" size={18} color="var(--ink)" /></span>
        <span class="text">
          <span class="name">Allowance</span>
          <span class="sub">{allowance}</span>
        </span>
        <Glyph name="next" size={16} color="var(--muted)" />
      </a>
    </Glass>
  </div>
  <div class="group">
    <h2>This device</h2>
    <Glass radius={16} style="margin:0 20px;overflow:hidden">
      <a class="row" href="#/settings/downloads">
        <span class="icon"><Glyph name="download" size={18} color="var(--ink)" /></span>
        <span class="text">
          <span class="name">Downloads</span>
          <span class="sub">{downloads}</span>
        </span>
        <Glyph name="next" size={16} color="var(--muted)" />
      </a>
      <a class="row" href="#/settings/reader">
        <span class="icon"><Glyph name="textsize" size={18} color="var(--ink)" /></span>
        <span class="text">
          <span class="name">Reader appearance</span>
          <span class="sub">{reader}</span>
        </span>
        <Glyph name="next" size={16} color="var(--muted)" />
      </a>
    </Glass>
  </div>
  {#if about !== undefined}
    <div class="group">
      <h2>About</h2>
      <Glass radius={16} style="margin:0 20px;overflow:hidden">
        <a class="row" href="#/settings/about">
          <span class="icon"><Glyph name="server" size={18} color="var(--ink)" /></span>
          <span class="text">
            <span class="name">About this Bardic</span>
            <span class="sub">{about}</span>
          </span>
          <Glyph name="next" size={16} color="var(--muted)" />
        </a>
      </Glass>
    </div>
  {/if}
</div>

<style>
  span, h1, h2 { line-height: 1.35; font-family: var(--font-ui); }
  .col { display: flex; flex-direction: column; gap: 16px; }
  .head { display: flex; align-items: center; gap: 8px; padding: 16px 20px 0; }
  h1 { margin: 0; flex: 1; font-size: 32px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; }
  .group { display: flex; flex-direction: column; gap: 8px; }
  h2 { margin: 0; padding: 0 24px; font-size: 12px; font-weight: 700; color: var(--muted); letter-spacing: 0.1em; text-transform: uppercase; }
  .row { min-height: 62px; display: flex; align-items: center; gap: 12px; padding: 0 14px; box-sizing: border-box; border-bottom: 1px solid rgba(255, 255, 255, 0.08); color: var(--ink); text-decoration: none; }
  .row:last-child { border-bottom: 0; }
  .row.who { min-height: 66px; }
  .icon { width: 34px; height: 34px; border-radius: 10px; background: rgba(255, 255, 255, 0.1); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .name { font-size: 15px; font-weight: 500; color: var(--ink); }
  .name.strong { font-weight: 600; }
  .sub { font-size: 12px; font-weight: 400; color: var(--muted); }
  a:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  @media (min-width: 768px) {
    .sub { color: var(--ink); }
  }
</style>

<script lang="ts">
  import Badge from '../../components/Badge.svelte';
  import BookTile from '../../components/BookTile.svelte';
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import ChapterCard from '../../components/ChapterCard.svelte';
  import ChapterRow from '../../components/ChapterRow.svelte';
  import Chip from '../../components/Chip.svelte';
  import Field from '../../components/Field.svelte';
  import IconButton from '../../components/IconButton.svelte';
  import MiniPlayer from '../../components/MiniPlayer.svelte';
  import NowPlayingCard from '../../components/NowPlayingCard.svelte';
  import OptionCard from '../../components/OptionCard.svelte';
  import Scrubber from '../../components/Scrubber.svelte';
  import Section from '../../components/Section.svelte';
  import Segmented from '../../components/Segmented.svelte';
  import Toast from '../../components/Toast.svelte';
  import Toggle from '../../components/Toggle.svelte';

  let mode = $state('Listen');
  let voice = $state('Mac voices');
  let name = $state('The Ashmark Cycle');
  let chip = $state('All');
  let on = $state(true);
  let off = $state(false);
  let position = $state(0.34);
</script>

<div class="board">
  <div class="glow g1"></div>
  <div class="glow g2"></div>
  <div class="glow g3"></div>
  <div class="wrap">
    <div class="page">
      <div class="head">
        <span class="title">Base components</span>
        <span class="sub">One primary action per surface. Everything paid or off-device goes through the callout with an estimate and a confirm that names the cost.</span>
      </div>
      <div class="grid">
        <div class="col">
          <Section label="Buttons">
            <div class="stack">
              <div class="row">
                <Button>Primary</Button>
                <Button variant="glass">Glass</Button>
                <Button variant="text">Text</Button>
                <Button variant="remove">Remove</Button>
              </div>
              <div class="row">
                <Button icon="play">Default 44</Button>
                <Button size={52} icon="arrow-right" iconPosition="end" iconSize={16}>Large 52</Button>
                <Button variant="glass" disabled>Disabled</Button>
              </div>
              <div class="row nowrap">
                <IconButton label="Play" icon="play" tone="accent" size={56} iconSize={24} />
                <IconButton label="Back 15 seconds" icon="back-15" size={52} />
                <IconButton label="Search" icon="search" />
                <IconButton label="More" icon="more" />
              </div>
            </div>
          </Section>
          <Section label="Badges">
            <div class="row badges">
              <Badge>Idle</Badge>
              <Badge tone="ready">Ready</Badge>
              <Badge tone="making">Making</Badge>
              <Badge tone="paid">Paid</Badge>
              <Badge tone="failed">Failed</Badge>
              <Badge tone="here">You are here</Badge>
            </div>
          </Section>
          <Section label="Segmented and chips">
            <div class="stack tight">
              <Segmented options={['Listen', 'Read']} bind:value={mode} label="Mode" />
              <div class="chips">
                {#each ['All', 'In progress', 'Series', 'Not started'] as c}
                  <Chip selected={chip === c} onclick={() => (chip = c)}>{c}</Chip>
                {/each}
              </div>
            </div>
          </Section>
          <Section label="Option cards">
            <div class="options">
              <OptionCard title="Mac voices" detail="Free · on this device" selected={voice === 'Mac voices'} onselect={() => (voice = 'Mac voices')} />
              <OptionCard title="Gemini" detail="Paid · sends text to Google" selected={voice === 'Gemini'} onselect={() => (voice = 'Gemini')} />
              <OptionCard title="Breeze" detail="Not connected" disabled />
            </div>
          </Section>
        </div>

        <div class="col">
          <Section label="Callouts">
            <div class="callouts">
              <Callout title="Stays on this device">Cloud services are used only when you choose them.</Callout>
              <Callout tone="warn" title="Before anything is sent">
                Sends this chapter&rsquo;s text to Google.<br />About 4 requests. Bardic can&rsquo;t show a price.
                {#snippet actions()}
                  <Button variant="glass">Not now</Button>
                  <Button>Start (paid)</Button>
                {/snippet}
              </Callout>
              <Callout tone="error" title="This EPUB is protected">Choose a DRM-free EPUB or a text file.</Callout>
            </div>
          </Section>
          <Section label="Field and toggle">
            <div class="stack tight">
              <Field label="Series name" id="k1" bind:value={name} />
              <div class="stack tight">
                <Toggle label="On" bind:checked={on} />
                <Toggle label="Off" bind:checked={off} />
              </div>
            </div>
          </Section>
          <Section label="Toast">
            <Toast message="Book imported. Press Start listening to hear it." actionLabel="Undo" />
          </Section>
          <Section label="Book tiles">
            <div class="tiles">
              <BookTile title="The Ash Ledger" author="Odile Brandt" color="#c65a43" progress={0.34} />
              <BookTile title="The Salt Road" author="Tamsin Hale" color="#8a5a34" />
              <BookTile title="Volume 3" missing />
            </div>
          </Section>
        </div>

        <div class="col">
          <Section label="Chapter rows">
            <ChapterCard>
              <ChapterRow number={4} title="The Ferryman’s Ledger" detail="You are here" current>
                {#snippet trailing()}<Badge tone="here">34%</Badge>{/snippet}
              </ChapterRow>
              <ChapterRow number={5} title="Quiet Tolls">
                {#snippet trailing()}<Badge>Not yet</Badge>{/snippet}
              </ChapterRow>
              <ChapterRow number={6} title="The Long Dry Month">
                {#snippet trailing()}<Badge>Not yet</Badge>{/snippet}
              </ChapterRow>
              {#snippet footer()}<Button variant="text">Show all 22 chapters</Button>{/snippet}
            </ChapterCard>
          </Section>
          <Section label="Scrubber, mini-player, capsule">
            <div class="stack">
              <span class="time">4:12</span>
              <Scrubber value={position} onchange={(v) => (position = v)} />
              <div class="stack">
                <MiniPlayer title="The Ash Ledger" detail="Ch. 4 · 6 min ahead" progress={0.34} speed="1.25×" />
                <NowPlayingCard
                  title="The Ash Ledger"
                  subtitle="Chapter 4 · The Ferryman’s Ledger"
                  ahead="6 min ahead"
                  progress={0.34}
                  elapsed="4:12"
                  remaining="~12:20"
                  speed="1.25×"
                />
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .board { width: 1280px; height: 1340px; box-sizing: border-box; position: relative; overflow: hidden; background: var(--base); font-family: var(--font-ui); }
  .glow { position: absolute; border-radius: 50%; }
  .g1 { left: -142px; top: -127px; width: 603px; height: 603px; background: var(--glow); opacity: 0.55; filter: blur(90px); }
  .g2 { left: 640px; top: 804px; width: 571px; height: 571px; background: var(--glow2); opacity: 0.42; filter: blur(100px); }
  .g3 { left: -95px; top: 1045px; width: 444px; height: 444px; background: var(--glow); opacity: 0.22; filter: blur(90px); }
  .wrap { position: relative; height: 100%; }
  .page { display: flex; flex-direction: column; gap: 20px; padding: 48px; box-sizing: border-box; }
  .head { display: flex; flex-direction: column; gap: 6px; }
  .title { font-size: 38px; font-weight: 700; color: var(--ink); line-height: 1.35; letter-spacing: -0.02em; }
  .sub { font-size: 14px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 40px; align-items: start; }
  .col { display: flex; flex-direction: column; gap: 28px; }
  .stack { display: flex; flex-direction: column; gap: 14px; }
  .stack.tight { gap: 12px; }
  .row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .row.nowrap { flex-wrap: nowrap; }
  .row.badges { gap: 8px; }
  .chips { display: flex; align-items: center; gap: 8px; overflow: hidden; flex-shrink: 0; }
  .options { display: flex; flex-direction: column; gap: 8px; }
  .callouts { display: flex; flex-direction: column; gap: 10px; }
  .tiles { display: flex; align-items: flex-start; gap: 14px; }
  .time { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
</style>

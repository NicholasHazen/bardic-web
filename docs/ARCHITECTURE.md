# Client architecture

Implemented with Svelte 5, strict TypeScript and Vite. The HTTP contract remains owned by the sibling server repository; generated client types follow its synced copy. See ROADMAP.md for verification and limitations.

## 1. Stack
| Concern | Implementation | Alternatives |
|---|---|---|
| Language | TypeScript, strict | |
| Build | Vite, single-page app, installable PWA | |
| UI | Svelte 5 (small output, simple reactive state for a player-heavy app) | Solid, Lit |
| API client | Types generated from the contract with `openapi-typescript`, `openapi-fetch` | hand-written fetch wrappers over the generated types |
| Audio | `HTMLAudioElement` with Media Session API for lock screen and headset controls | Web Audio only if needed |
| Offline storage | IndexedDB for verified text, timings and chunked audio; Cache Storage for the app shell and fonts | |
| Tests | Vitest for logic, Playwright flows in Chromium, Firefox and WebKit; separate single-worker Chromium audits | |

## 2. Structure
```
src/
  api/        generated schema.d.ts, client, error mapping, event stream
  state/      listener, library, book, plans, allowance, management, reader preferences
  player/     audio engine, places and conflicts, chapter prefetch, media session
  offline/    downloader, manifest, update check, storage accounting
  theme/      palette derivation from cover sample, tokens
  components/ shared glass and accessible controls
  views/      Home, Library, Book, Now Playing, Settings, sheets
  lib/        code point text helpers, money and cost formatting, time
```

## 3. Identity
The device id is a UUID in `localStorage` and is sent on every mutating request (`X-Bardic-Device`). The selected listener is kept per device and sent as `X-Bardic-Listener`. A 404 `listener_not_found` returns the user to the chooser.

## 4. Place sync
A local copy of the place (exact audio time, scroll position, `revision`) is written continuously. The server is written on pause, chapter change, seek, close, backgrounding, and at most every 30 seconds while playing, with `keepalive` fetch on unload. Offline writes are coalesced into a queue and replayed on reconnect. On `409 place_conflict`, the client applies the listener's setting: ask (show both places), newest, or this device; the choice is written with the server's revision as the base.

## 5. Offline
- A download is a set of chapters of one audiobook: audio, timings and text, recorded in IndexedDB with `audio.id` and hashes.
- Audio arrives in bounded parts. Engines that cannot store Blob parts use ArrayBuffer parts; a chapter's record and content still commit atomically only when its complete audio is present. An incomplete replacement leaves the previous chapter intact.
- Verify files on open; repair or re-download on mismatch.
- `checkDownloads` compares what is held with the server and produces the **Out of date** comparison; nothing is replaced without the listener's choice.
- Request persistent storage; download in the foreground with clear progress, pause and resume by range.
- **Risk:** browsers limit and may evict stored data; iOS does not allow background downloads and is stricter for sites that are not installed. Mitigate with install-to-home-screen guidance, storage checks before a download, and verification on open. A native wrapper is a follow-on if the limits bite.

## 6. Player
One audio engine per page: loads the chapter audio, applies the listener's speed, exposes the four listening states, and emits the current line from the timings for Read mode. It prefetches the next chapter and asks the server to make it ahead. Switching audiobook keeps the text place and waits until the new audiobook has audio there.

Chapter titles, `kind`, source `page_count` and exact Unicode `text_length` belong to the server's import layer. The client never reparses or removes chapter text. The book page's collapsed **Chapter options** panel and player sheet use a **Show front and back matter** switch to filter existing metadata; downloaded books use the same cached kinds, with legacy unknown kinds treated as story. Filtering keeps chapter IDs, original ordering and the current chapter. **Update chapter details** calls the server's metadata-only refresh and reloads the book resources; a refusal keeps the current book, audio and places. Success reconciles names, kinds and length/page metadata in the loaded player and every matching downloaded audiobook, only when the complete ordered chapter IDs match. The update stays busy until the device metadata save finishes, then reports changed or unchanged details. It never replaces downloaded text, timings or audio. Player book-update notices also refresh metadata without moving or interrupting playback.

`lib/chapterMetrics.ts` formats word counts, known source page counts, recorded audio durations and current-chapter progress. Progress divides the listener's Unicode code point offset by `text_length`, independent of audio availability. Player snapshots expose the current offset and per-chapter metrics; the book page uses the saved place. The audio word remains visible beside the progress detail. Held durations take precedence over newer server audio because downloads are immutable until the listener chooses a replacement. Offline metadata keeps known word/text/page figures; legacy records omit unknown figures rather than guessing page counts or showing zero runtime.

Audio selection is separate from visibility. Free Make ready and premium plan sheets start with **Include front and back matter** off and send `scope.include_matter` explicitly. The shared `makeOptions` helper filters chapter counts and ready counts, and the server filters before estimating or queuing. A premium selection change discards the old preview; only a fresh matching preview can be approved. Playback ahead requests also exclude matter while preserving an explicit tap on a matter chapter. Existing audio and downloaded chapters are never removed by either choice.

Both sheets also support explicit `chapters` scopes in reading order. `ChapterSelection` provides the same checkbox list for free and premium flows. Empty selections cannot start; unknown/duplicate IDs do not inflate counts. Premium edits invalidate in-flight and displayed previews before pricing the new scope. Ready audio remains reusable. The free live sheet reports unknown generation time instead of assuming the reference computer's speed; premium estimated speech duration is separate from unknown generation time.

Contract 0.5.3 adds `Job.generation` for the active chapter: durable completed request and Unicode character counts, measured provider-call elapsed time and nullable remaining-time estimates. `generationProgress.ts` formats the shared free/premium card and chapter-row details. The book's shared event stream refreshes them after completed requests; chapter audio stays Making until its complete file is durable. Estimates use successful request throughput within this job and exclude queueing, quota waits, pauses and retry delays; they are predictions of active generation time, not a guaranteed completion deadline. No sample means Unknown. A mismatched current chapter or completed job cannot display stale progress.

The server skips queued-line traversal when no ETA can be reported. Remaining-work estimates can conservatively overestimate when later queued chapters already contain retained requests; those parts are accounted for when each chapter becomes current.

Request batching remains at 2,500 Unicode code points by default, packed at existing line boundaries. The server runs one request at a time. Breeze internally segments these into smaller inference units, so increasing HTTP batch size alone is not evidence of faster synthesis. Gemini may benefit from lower request overhead, but a provider-specific benchmark and output-truncation handling should precede larger defaults. Partial chapter recovery now retains the original saved chunk size when configuration changes, so tuning future batches cannot repeat completed work. Independent provider scheduling and Google's asynchronous Batch/Flex modes require separate rate-limit and spending-reservation work; this change does not introduce them.

The end-of-book screen owns a read-only series lookup in `state/seriesContinuation.ts`. While the end state is visible, it reads the listener-scoped complete series list, locates the current book by ID and offers the nearest readable book with a higher numeric order. Unknown orders establish no successor; only the server's reported gaps produce a missing-volume note. Library change notices and every stream connection, including the first, refresh the lookup. Leaving the end state, changing the route/book/listener or unmounting cancels it and invalidates late replies. The next-volume action opens the book page without playback, generation or a place write. Failed reads keep the end controls available, show that the next volume could not be checked and offer Retry. The series catalogue is not stored offline, so an offline lookup makes no ownership or gap claim.

## 7. Theming
Derive the palette from `Cover.sample` (see the UI guide), set CSS custom properties per book, and fall back to the default palette. Screens without a book use the default.

## 7.1 Device settings and management

Reader appearance, following and screen-on choices are shared between Settings and Now Playing in `state/reader.ts` and persisted per browser. Screen Wake Lock is held only while Read is visible and playing, and released on pause, navigation or hiding the page. Unsupported/denied locks do not interrupt playback. Listener continuation and place-conflict settings are saved through the server.

Deletion schedules retain their book IDs independently of refresh success. Cached timestamps show the pending countdown after a reload; only a confirmed server reply removes an entry. The global Undo region remains mounted in Now Playing and offline views. Recent-place restoration goes through the player's revision/conflict logic and keeps the place left behind in history. The server's display name is cached separately so an unreachable screen can identify it without guessing an address.

## 8. Money and cost display
Format `Money` from integer micros. Show ranges as "$1.80 to $2.60" with "most likely". A `Spend` with `unknown_items` shows the count beside the known total and never adds it as zero.

## 9. Risks
1. Offline storage limits on iOS and Safari.
2. Mapping code point offsets to DOM positions for highlighting (surrogate pairs, combining marks).
3. Keeping audio playing across backgrounding and lock screen on iOS.
4. Generating Media Session metadata and artwork from the cover.

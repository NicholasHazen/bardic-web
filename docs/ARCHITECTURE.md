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

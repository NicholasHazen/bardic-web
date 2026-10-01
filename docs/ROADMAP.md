# Web roadmap

| # | Milestone | Scope | Exit criteria |
|---|---|---|---|
| W0 | Scaffold | Vite, TypeScript, generated API types, tokens and glass components, theme from cover sample, router, device id, health check. | The kitchen-sink page matches the `Components` and `B1Palette` boards. |
| W1 | Listeners, Home, Library, Add | First listener, chooser, switcher, manage; Home; Library and search; add book with duplicate check and progress; sample book. | `[FirstListener]` to `[Import]` and `[LibraryDuplicate]` match; L1 to L7, A1 to A10 flows pass. |
| W2 | Book page and voices | Book page, audiobook card, chapters; voice chooser (free, premium, no account); voice sources and set-up; default voice. | `[BookTop]` to `[VoiceNoAccount]`, `[SetupVoice]`, `[BreezeServer]`, `[VoiceSources]` match. |
| W3 | Player and places | Now Playing (listen, read, tablet layouts), bar, speed, sleep, chapters, search, appearance; place sync and conflicts; end of book. | S1 to S9 and C1 to C7 flows pass; `[PlaceConflict]`, `[EndOfBook]`, `[ReadAway]` match. |
| W4 | Plans and Allowance | Plan preview and approval, running, paused, blocked, estimate explained, key problem, Allowance. | P2 flow tests (no paid action without a plan); `[PlanPremium]` to `[KeyProblem]` match. |
| W5 | Offline | Download sheet and progress, manager, update check, offline home, away-from-home screen, storage handling. | O1 to O8 flows pass in airplane mode; `[DownloadProgress]`, `[UpdateAudio]`, `[ServerOffline]` match. |
| W6 | Polish and edge states | Book menu, free up space, delete with undo, server name, tablet portrait polish, accessibility review, performance. | Spec section 10 accessibility and performance targets met. |

## Notes from W0 to W2
- **Free-voice make-ready time is a hard-coded assumption** (`ASSUMED_MAKE_RATE` in `src/lib/bookAudio.ts`: 0.9 s of audio per second, from one live Breeze run on the reference machine, 10.2 s of audio in 10.8 s). It should not stay hard-coded: the server could report its own measured generation rate from past jobs (or run a speed test) and the sheet would use that, saying "About" until a job has measured it. Not built; recorded as a known limitation on both sides. Because the rate is near real time, a long book takes about as long as it lasts, and the sheet says so (spec 10.1: "or the UI says how long it will take").
- **Voice order:** Gemini voices are listed alphabetically by the server. The `VoicePremium` board's Kore, Puck, Charon order is a curated sample; the board fixture is not changed and the live list is alphabetical. Accepted.
- **Breeze has no authentication**, so the client has no Breeze key field. The server's API still accepts a key if one is ever needed.
- **Chapter row word:** the current chapter keeps the board's "34%" look when Ready or On this device (the audio word stays available to screen readers); otherwise the audio word shows.

## Notes from W3
- **Status:** W0 to W3 are built: scaffold and theme, listeners, library, book page, voices and Settings, and the player (engine, place sync, Now Playing, sheets). 51 of 75 boards are built and checked at 0.00% to 0.17% (default tolerance 1%); 63 end-to-end flows pass against a real server with fake Breeze and Gemini; 455 unit tests.
- **FirstPlay and NoVoice are the book page**, not Now Playing: pressing Listen keeps you on the book page, showing "Getting ready" (free voice, first audio) or "Needs you" (no voice), and opens Now Playing as soon as sound is playing (`startListening` in `src/views/nowplaying/start.ts`).
- **Never discard the other place silently:** choosing either side of a place conflict writes the place being left behind to the server first, so both are in history (tested end to end for both choices).
- **Premium audio is never requested by the player.** A premium chapter that is not ready shows "Needs you" with a route to the plan flow (W4). The only calls that can charge are a premium voice example (V2) and, from W4, an approved plan.
- **Test hook:** `?e2e=player` exposes the player to tests only in builds made with `VITE_E2E=1` (`npm run e2e`).
- **Open design questions for the board owner:** the tablet Up-next rows say "Preparing / Not prepared" (we use Making / Not yet); the tablet switcher board lacks the L4 notice "Switching pauses playback"; the dotted underline in Read mode has no documented meaning (it is a generic "marked line", used for a search hit); Read mode shows only "Aa" so search is on Ctrl/Cmd+F and More only; PlaceConflict makes the other device's place the suggested choice even when this device's is newer; the reader text-size slider on the boards spans 12 to 32 but the guide says 19 to 23 (we follow the guide).
- **Not yet:** offline downloads (W5, `heldChapters` hook), plans and Allowance (W4), book menu, free up space, delete with undo (W6).

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

# Bardic web client

The client half of Bardic v2: library, listening, reading along, plans and offline, in the browser on phones, tablets and computers. It talks to the Bardic server (`bardic-server`) over the HTTP contract.

**Status:** W0–W5 and the W6 repairs are implemented. W6 includes book management, permanent deletion with Undo, recent-place restoration, server naming, reader/listening settings and accessibility/performance audits. Local verification passes: 817 logic tests, 420 browser checks, 71 boards and 231 accessibility screen/viewport pairs. Current measurements and remaining product/platform limitations are recorded in [docs/ROADMAP.md](docs/ROADMAP.md).

## Start here

| Read | For |
|---|---|
| [docs/PRODUCT-SPEC.md](docs/PRODUCT-SPEC.md) | What Bardic does, promises, requirements with ids, acceptance tests. |
| [design/README.md](design/README.md) | Every screen as an image, by the board name the spec cites (`[Home]`, `[PlanPremium]`…). Source of the canvas is in `design/canvas/`. |
| [docs/UI-GUIDE.md](docs/UI-GUIDE.md) | Look, tokens, components, status words, rules. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Client structure, stack, offline and sync design. |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Milestones and exit criteria. |
| [contract/](contract/) | A synced copy of the server's OpenAPI contract and its version. |
| [AGENTS.md](AGENTS.md) | Rules for coding agents and contributors. |

## The contract
The contract is owned by the server repository (`docs/contract/openapi.yaml`). This repository keeps a copy in `contract/openapi.yaml` and its version in `contract/VERSION`; update it with `npm run contract:sync`, then regenerate types with `npm run contract:types`. Never edit the copy by hand.

## Design at a glance
Aurora glass: a dark base with glow colours taken from the cover of the book you are in, frosted glass where content sits above them, one lifted accent. Phones are portrait only; tablets portrait and landscape.

## Run and verify

Use `npm ci`, then `npm run dev`. Build the server with `cargo build --release` in `bardic-server`, or provide `BARDIC_SERVER_BIN` for flow tests.

```sh
npm run check
npx vitest run
npx playwright install chromium firefox webkit
npm run e2e                  # real temporary server; Chromium, Firefox and WebKit
npm run design:check         # all board comparisons; inspect design/report/index.html
npm run audit:a11y           # one Chromium worker; design/a11y-report.json
npm run audit:perf           # quiet machine; 500 synthetic books; design/perf-report.json
```

Audit runs use a separate build and configuration, so browser flows do not race performance measurements or overwrite reports. Playback tests are muted while retaining real decoding and clock progress. The providers in flow tests are local fakes; no real provider key or user's books are used. The manifest and icons support installation; the offline app shell requires HTTPS or localhost. WebKit coverage is not a native Safari or physical iOS test.

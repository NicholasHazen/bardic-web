# Operate Bardic on Spark

Deployment checkpoint: **2026-10-05**. The tested release pair is server `bfb5aa8` and web `38a3f3f`, deployed together as `bfb5aa8-38a3f3f` on a native ARM64 Spark running Ubuntu 24.04.5, Docker Engine 29.6.2 and Compose 5.2.0. Both containers are healthy. The display name is **Bardic on Spark**. The v2 library is fresh and empty; no listeners, books or provider credentials were added during live verification.

In commands below, `bardic-host` is a placeholder for the host's SSH alias, and `bardic-host.your-tailnet.ts.net` is a placeholder for its private Tailscale name. Keep the real account, address and tailnet name in local configuration.

## Files and service boundaries

The installation belongs to the deployment account's home directory:

```text
~/bardic-v2/
  compose                      # executable wrapper for this installation
  .env                         # host paths, ports and paired image tag; no provider keys
  compose.host.yaml             # host override, including the initial server name
  data/                        # persistent v2 library on local ext4/NVMe
  current -> releases/bfb5aa8-38a3f3f
  releases/
    bfb5aa8-38a3f3f/
      bardic-server/            # tracked source snapshot at bfb5aa8
      bardic-web/               # tracked source snapshot at 38a3f3f
```

The wrapper selects Compose project `bardic-v2`, `~/bardic-v2/.env`, `current/bardic-web/compose.yaml` and `~/bardic-v2/compose.host.yaml`. The updater installation below adds `current/release.env` after `.env`, so the `current` symlink selects the paired image tag and server build context together. Use the wrapper for routine operations so commands use the same project, bind mount and overrides regardless of the working directory. The release directories contain source snapshots; the `data` directory stays outside them when a release changes.

The whole `data` directory is owned by UID/GID 10001 and mounted at `/data` in the single server container. Keep the live database on this local filesystem. A NAS can hold independent backup copies. Provider keys entered later are stored in the live database; protect the directory and any full stopped copies. API backups strip keys, as described in [DEPLOYMENT.md](DEPLOYMENT.md#back-up-and-restore).

The gateway publishes only `127.0.0.1:8080` on the host. The server's port 8765 is private to the Compose network. Both containers run as UID/GID 10001 with read-only root filesystems and writable temporary storage. The host override supplies `BARDIC_SERVER_NAME` for a fresh database; rename an existing Bardic through Settings instead.

## Health, logs and restart

On the host:

```sh
~/bardic-v2/compose ps
curl --fail --silent --show-error http://127.0.0.1:8080/api/health
~/bardic-v2/compose logs --tail 100 bardic-server bardic-web
systemctl is-enabled docker tailscaled
```

Docker and Tailscale are enabled at boot, and the containers use `restart: unless-stopped`. An actual host reboot has not yet been tested. A deliberately stopped stack needs an explicit start:

```sh
~/bardic-v2/compose up -d --wait --wait-timeout 120
```

For a planned server restart, let active work settle first, including exports and backups:

```sh
~/bardic-v2/compose restart bardic-server
~/bardic-v2/compose ps
curl --fail --silent --show-error http://127.0.0.1:8080/api/health
```

Wait for the services to show healthy before reading the health endpoint. This native-host restart was exercised: the server stopped gracefully and kept its identity while the existing gateway remained running. Keep the five-minute stop grace period for provider work that has already been admitted. For a planned shutdown of the whole stack, use `~/bardic-v2/compose stop`, then the `up` command above to start it again. Run only one server against this data directory.

## Private HTTPS

**Verified on 2026-10-05.** The administrator setup step is complete. Tailscale Serve accepts HTTPS on TCP 443 and forwards to `http://127.0.0.1:8080`; Funnel is not enabled. Inspect the configuration from a trusted computer, replacing the SSH alias:

```sh
ssh bardic-host 'tailscale serve status'
```

Use the HTTPS URL reported by that command, for example `https://bardic-host.your-tailnet.ts.net`, on devices signed in to the trusted tailnet. [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve) provides private access; tailnet access rules control who can reach it. Bardic has no login layer. Public port forwarding is not part of this deployment.

Normal certificate-validation requests passed for `/`, `/api/health`, `/api/server`, `/api/listeners` and `/sw.js`. A HEAD request for the same nonexistent voice sample returned 404 with the application's HTTPS `Origin` and `Sec-Fetch-Site: same-origin`, and 403 with a foreign `Origin` and identical Fetch Metadata. This checks that the proxy path preserves Origin and that the server refuses the foreign request; neither request generated audio.

Playwright Chromium, Firefox and WebKit opened the actual HTTPS welcome screen with normal certificate validation. Each reported a secure context, a same-origin service-worker controller, cached `index.html` and all four exact production assets, absent test hooks even with `?e2e=player`, and no application or same-origin console errors. These checks inspected service-worker installation and cache contents; they did not exercise an offline HTTPS reload or downloaded playback. No listeners, books, keys or provider work were created.

Retain this stable HTTPS origin for normal use: listener selection and downloaded chapters belong to a browser origin, so the earlier localhost SSH-tunnel origin has separate storage. Physical-device checks still need to be performed.

If the Serve configuration needs to be restored, its setup command requires interactive administrator authorization:

```sh
ssh -t bardic-host 'sudo tailscale serve --bg http://127.0.0.1:8080'
```

Enter the administrator password at the host's sudo prompt. If Tailscale prompts to enable tailnet HTTPS, follow its setup link, then check `tailscale serve status` and the HTTPS health endpoint again.

The temporary SSH tunnel used for earlier live verification remains closed. The stack runs on loopback behind Serve. A deliberate tunnel can also be used for maintenance from a trusted computer:

```sh
ssh -N -L 18080:127.0.0.1:8080 bardic-host
```

Open `http://127.0.0.1:18080` while that command runs. Stop the tunnel when finished.

## Breeze and first use

The existing Breeze health endpoint on Tailscale, port 7860, returned HTTP 200 from both the host and the Bardic server container. These were read-only connectivity checks. Breeze is not yet configured in this fresh Bardic, and no speech or paid provider requests were made on Spark.

Open the verified HTTPS URL, add a listener and enter the reachable Breeze address in Settings → Voices. Use the actual remote Tailscale endpoint, for example `http://voice-host.your-tailnet.ts.net:7860`; `127.0.0.1` inside the server container refers to that container. Generate only the book/audio explicitly chosen in that setup. Premium provider credentials and plans remain optional and follow the existing approval flow.

## Updates and recovery

Keep web and server as a tested pair, and keep independent API backups copied to separate storage before upgrades. The updater's stopped snapshots are on this same NVMe disk and include live provider keys; they support a failed upgrade, not recovery from disk loss. Retain the old source/images and protect the updater directory as carefully as the live data.

### Install the paired updater

Run the installer on the deployment host from a **reviewed checkout containing the updater**, with Git, Python 3 and Docker Compose available to the deployment account. The older source snapshots in the installed release do not contain it. Replace `ORG` with the public GitHub owner and each SHA placeholder with the full 40-character commit of the already deployed server/web pair; the shortened checkpoint hashes above are not accepted:

```sh
BARDIC_WEB_REPO='https://github.com/ORG/bardic-web.git' \
BARDIC_SERVER_REPO='https://github.com/ORG/bardic-server.git' \
sh scripts/install-spark-updater.sh "$HOME/bardic-v2" \
  DEPLOYED_SERVER_FULL_SHA DEPLOYED_WEB_FULL_SHA
```

The installer records the existing release as the baseline; it does not deploy an older `main`. It creates private configuration and metadata, copies the reviewed updater and read-only probe, upgrades the wrapper, and installs a systemd **user** service/timer. Repeating it preserves existing config, baseline, release metadata, `current`, updater state, `.env`, `host.env`, host override and library contents. Repository environment variables are only initial-install inputs; existing config is not rewritten. The upgraded wrapper ignores exported `BARDIC_IMAGE_TAG` and `BARDIC_SERVER_CONTEXT`, using the selected release's `release.env` instead. Do not edit `.env` to choose another image pair after installing it.

The installer runs `--check-only` before enabling the timer. `unchanged`, `remote_behind_installation` and `candidate` are acceptable; a failed check, held pair, unknown result or `recovery_pending` leaves timer activation to the operator. Updates enter `main` through reviewed pull requests. A running timer intentionally refuses a pair behind either installed commit. It does not publish or merge changes.

The initial server and web publication PRs used **merge commits**, preserving each deployed baseline as an ancestor of its `main`. That history is required by the updater's fast-forward gate. Future PRs start from the published `main`.

On this host, user lingering is enabled (`Linger=yes`), so the user timer can run after logout. Installation requires no sudo, SSH credentials or inbound webhook. It checks two minutes after boot, then five minutes after the previous service finishes. A second updater invocation skips while the first holds its lock. The service timeout is 90 minutes for native builds.

**Installed and verified on Spark on 2026-10-05.** The user timer is enabled and active. A real service invocation completed successfully while published `main` was behind the installation, preserving both running container IDs, `current`, `.env` and the host override. After the application and chapter-control PRs merged, the timer safely held that pair because it lacked the web updater packaging; it made no live transaction or restart. A repeated installer preserved the baseline and refused activation for that held pair, while the existing timer remained enabled. Merging the updater PR produces a new pair and releases that specific failed-pair latch. No live upgrade/recovery or reboot has been exercised on Spark.

The added files are:

```text
~/bardic-v2/
  releases/<pair>/
    release.json               # full server/web SHAs, tag, API version, verification
    release.env                # authoritative paired tag and server build context
  updater/
    spark-update.py            # installed controller
    quiet-check.mjs            # read-only probe fallback for the baseline release
    config.json                # root, public repos, baseline and pinned Node probe image
    repos/{server,web}.git      # fetched bare repositories
    update.lock                # serializes checks and updates
    state.json                 # last result and failed-pair latch
    transaction.json           # present during a promotion or recovery
    snapshots/<attempt>/data/  # full stopped copy, including provider keys
~/.config/systemd/user/
  bardic-update.service
  bardic-update.service.d/installation.conf
  bardic-update.timer
```

### What an update does

Each run fetches both public `main` branches and requires a fast-forward from **each installed commit**, exact matching web/server OpenAPI contracts, and the updater packaging in the candidate. It exports immutable paired source snapshots, builds each Dockerfile's `verify` target and production image, then checks a separate private gateway/server stack with original synthetic data. That smoke checks health, API identity/version, static delivery, request provenance, synthetic listener persistence across restart and the candidate's quiescence probe. It makes no real provider request and does not mount the live library. If `main` changes during verification, promotion is deferred.

The server gate runs formatting, Clippy and offline Rust tests. The web gate runs generated-contract types, type checking, client logic tests, updater recovery tests and probe tests against the candidate server's migrations. Its named build context can also be supplied manually from a sibling checkout: `docker build --build-context bardic_server=../bardic-server --target verify .`. A schema change must update the probe to understand the installed and candidate databases before promotion.

The contract 0.5.3 candidate probe explicitly supports schema 11 (the original installed format), 12 (chapter pagination) and 13 (generation progress), using tests of each real migration prefix. These additions leave work and spending states unchanged. Older and future schemas still fail closed; schema 12/13 must contain their added metadata columns. This permits the candidate probe to check both the installed database before stopping and the migrated database before reopening. Image-only rollback still cannot undo migrations; use the gated stopped snapshot with its matching release pair.

To keep hashed imports available to an already-open browser during the switch, the candidate gateway retains the previous gateway's `/srv/assets` files. A filename collision must have identical bytes or validation refuses it. Only that asset directory is retained: the candidate serves its own fresh `index.html` and `sw.js`. The release's `release.env` is replaced atomically, and the atomic `current` symlink selects that environment and both source snapshots together.

Retained asset history grows across releases. Review future API changes for compatibility with existing clients; keeping static chunks does not make a breaking contract change compatible.

The live probe runs with no network and a read-only data mount. Active generation, a paused chapter still in flight, imports, exports, backups, reserved paid requests and pending deletion grace periods defer promotion. An unreadable or unsupported database also blocks it. A busy result leaves the existing release running; the timer checks again later.

After confirming the server container is stopped, a separate probe mode reads the checkpointed database without recreating SQLite sidecars on the read-only mount. It refuses a nonempty WAL or any rollback journal. Live checks always use a normal read transaction so uncheckpointed paid reservations remain visible; see [SQLite's read-only WAL rules](https://www.sqlite.org/wal.html#read_only_databases). The disposable smoke isolates the server from provider networks and gives only the gateway a separate bridge for its loopback port.

When quiet, the controller closes the gateway, checks again, gracefully stops the server and verifies work has settled. It makes a protected full stopped snapshot, starts the candidate server behind the closed gateway and checks the expected image, API version, server identity and usage ledger before opening the gateway. `current` and its paired `release.env` select the new release together; host paths and data stay in place.

Automatic restoration of the stopped snapshot is allowed only before the gateway may have accepted new user writes, with a readable quiet database, unchanged server identity and no added usage entries. The candidate data is retained separately before that restoration. Once the gateway may have reopened, the controller checks the promoted service and never silently rewinds the library. An unsafe or unknown recovery state requires operator review. Do not delete `transaction.json` or overwrite a snapshot to bypass that gate.

The controller persists each transaction phase atomically so a later normal invocation can resume an interrupted update. `--check-only` reports `recovery_pending` without performing recovery. The recovery paths are:

| Saved phase | Recovery action |
| --- | --- |
| `closing`, `stopped`, `snapshot_ready` | Restart the previous release; the candidate has not started. |
| `candidate_starting` | Stop the candidate and check the rollback gate before restoring the stopped snapshot. |
| `restoring` | Resume the recorded data-directory renames without overwriting an existing directory; ambiguous contents require operator review. |
| `rollback_opening` | Verify and restart the restored previous pair. |
| `opening` | Start and verify the promoted candidate; retain its data because the gateway may have accepted writes. |
| `needs_recovery` or an unknown phase | Stop automatic recovery and require operator review. |

These records support interrupted-updater recovery. A live power-loss recovery rehearsal remains unverified; keep independent backups.

### Inspect, retry or pause

These commands run on the deployment host as the same account:

```sh
~/bardic-v2/updater/spark-update.py --config ~/bardic-v2/updater/config.json --status
~/bardic-v2/updater/spark-update.py --config ~/bardic-v2/updater/config.json --check-only
systemctl --user status bardic-update.timer bardic-update.service
systemctl --user list-timers bardic-update.timer
journalctl --user -u bardic-update.service --since today
~/bardic-v2/compose ps
```

`--check-only` fetches and records the pair but does not build, promote or recover it. `--status` reports the installed manifest, last result and any transaction. A failed candidate pair is latched so five-minute checks do not keep rebuilding it. After investigating and correcting the cause, explicitly retry that same pair with:

```sh
~/bardic-v2/updater/spark-update.py --config ~/bardic-v2/updater/config.json --retry-failed
```

That command performs the full update flow; it is not a read-only check. A newer pair can be considered without clearing the old latch. Before manual maintenance or recovery, disable future timer runs:

```sh
systemctl --user disable --now bardic-update.timer
systemctl --user status bardic-update.service
```

Disabling the timer does not stop an already running service. Let it finish and inspect its status before changing release/data files; do not interrupt a snapshot or graceful shutdown. Resolve any recovery transaction before reenabling with `systemctl --user enable --now bardic-update.timer`.

A database migration can make an image-only rollback incompatible. For manual recovery, preserve both the current data and failed candidate evidence, then restore the pre-update backup to a separate local directory with its matching release pair. The detailed [backup/restore procedure](DEPLOYMENT.md#back-up-and-restore) covers the layout and ownership. Check existing library, places and audio before starting new generation. Do not switch only a tag or symlink against migrated data.

## What was verified

- Native ARM64 images run on Ubuntu with a UID/GID 10001 local ext4 bind mount; both health checks pass and only loopback 8080 is published.
- A graceful native server restart preserved identity behind the unchanged gateway.
- From macOS through a temporary SSH tunnel, Playwright Chromium, Firefox and WebKit rendered the actual live welcome screen, had no production test hooks even with `?e2e=player`, acquired a service-worker controller and reported no application exceptions. No listener was created and no playback was requested.
- Private Tailscale HTTPS on TCP 443 passed normal certificate validation, API/static reads and the read-only Origin-refusal comparison. The three browser engines passed welcome rendering, secure-context/worker/cache inspection, absent hooks and application/same-origin console checks on that HTTPS origin. No offline playback was requested.
- The real Breeze health endpoint was reachable from the host and server container; no synthesis was exercised.
- The updater installer, enabled user timer and real scheduled check were verified on Spark; the read-only probe reported schema 11, quiet work and zero usage. Original server/web container IDs, release pointer and host configuration checksums stayed unchanged. No live listener, book, key or audio was created.
- Disposable Linux ARM64 Docker rehearsals passed both the original API 0.5.0 pair and the merged API 0.5.1 pair: complete verify/build stages, isolated synthetic listener persistence/restart, identity preservation, fresh index/service worker with old hashed assets, a protected stopped snapshot, and forced pre-opening rollback with separately retained failed data. Generated projects/data were removed and baseline image IDs remained unchanged.
- The controller's 60 synthetic unit tests pass. Probe tests pass 47 checks in the web verify target with the external Docker proof skipped there; all 48 pass when that opt-in proof is run, including a closed WAL database on the exact pinned read-only Node24/Linux bind and refusal of nonempty WAL data. Current client types and all 882 logic tests pass in the Docker gate; server formatting, Clippy and offline tests pass there too.

A real reboot, real-provider synthesis on Spark, native Safari/physical iOS, background playback, offline reload/playback through the live HTTPS origin and a backup/restore rehearsal on this host remain unverified. The intermittent WebKit first-Listen symptom also remains unresolved. The disposable Docker deployment smoke's synthetic generation/export/restore results are recorded separately in [ROADMAP.md](ROADMAP.md).

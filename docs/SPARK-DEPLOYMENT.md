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

The wrapper selects Compose project `bardic-v2`, `~/bardic-v2/.env`, `current/bardic-web/compose.yaml` and `~/bardic-v2/compose.host.yaml`. Use it for routine operations so commands use the same project, bind mount and overrides regardless of the working directory. The release directories contain source snapshots; the `data` directory stays outside them when a release changes.

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

Keep web and server as a tested pair. Before updating, complete an API backup and copy it to independent storage. Record the current release pair and retain the old source/images. Stop the stack, place the next paired source snapshots in a new `releases` directory, point `current` to that directory, and update `.env` for the intended paired image tag and build context. Then use the wrapper:

```sh
~/bardic-v2/compose build
~/bardic-v2/compose up -d --wait --wait-timeout 120
~/bardic-v2/compose ps
```

The `data` directory stays in place. Check existing library, places and audio before starting new generation. A database migration can make an image-only rollback incompatible; restore the pre-update backup to a separate local directory with its matching release pair when needed. The detailed [backup/restore procedure](DEPLOYMENT.md#back-up-and-restore) includes the required layout and ownership.

## What was verified

- Native ARM64 images run on Ubuntu with a UID/GID 10001 local ext4 bind mount; both health checks pass and only loopback 8080 is published.
- A graceful native server restart preserved identity behind the unchanged gateway.
- From macOS through a temporary SSH tunnel, Playwright Chromium, Firefox and WebKit rendered the actual live welcome screen, had no production test hooks even with `?e2e=player`, acquired a service-worker controller and reported no application exceptions. No listener was created and no playback was requested.
- Private Tailscale HTTPS on TCP 443 passed normal certificate validation, API/static reads and the read-only Origin-refusal comparison. The three browser engines passed welcome rendering, secure-context/worker/cache inspection, absent hooks and application/same-origin console checks on that HTTPS origin. No offline playback was requested.
- The real Breeze health endpoint was reachable from the host and server container; no synthesis was exercised.

A real reboot, real-provider synthesis on Spark, native Safari/physical iOS, background playback, offline reload/playback through the live HTTPS origin and a backup/restore rehearsal on this host remain unverified. The intermittent WebKit first-Listen symptom also remains unresolved. The disposable Docker deployment smoke's synthetic generation/export/restore results are recorded separately in [ROADMAP.md](ROADMAP.md).

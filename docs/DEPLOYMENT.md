# Deploy Bardic on Linux or a NAS

Use [compose.yaml](../compose.yaml): Caddy serves the compiled web app and forwards `/api` to one Rust server. Only Caddy publishes a port. Both containers run as UID/GID 10001 with a read-only root filesystem; the server's whole `/data` folder is a persistent bind mount. Node and Rust are build tools, not runtime requirements. The server image includes ffmpeg for M4B exports. Breeze can stay on another machine over HTTP; these containers need no GPU for a remote voice source.

Bardic has no login or access-control layer. Keep it reachable only by trusted people/devices. The default host binding is loopback; use Tailscale Serve on the host for private HTTPS. HTTPS enables the browser's service worker and offline app shell. Plain HTTP on a LAN address does not provide the full offline app.

For the native ARM64 installation on Spark, see [SPARK-DEPLOYMENT.md](SPARK-DEPLOYMENT.md) for its release layout, Compose wrapper, verified host checks and private HTTPS configuration.

## Prepare the host

Install Docker Engine with the Compose plugin (Compose v2 or newer). A NAS container manager must support builds from both repositories, bind mounts, health checks and the stop timeout in this file. Use a local filesystem/dataset for the live database: [SQLite WAL](https://www.sqlite.org/wal.html) cannot run over SMB/NFS. A NAS's own local dataset is suitable; a mounted share on a different machine is not.

Check out `bardic-web` and `bardic-server` as siblings, using the tested pair of commits for a release. Builds select the host architecture; the supplied bases include Linux amd64 and arm64. Build on the target, or use Buildx for architecture-specific images; copying an arm64 image to amd64 does not convert it.

From `bardic-web`:

```sh
cp .env.example .env
sudo install -d -m 0700 -o 10001 -g 10001 /srv/bardic/data
# Edit .env: set BARDIC_DATA_DIR to that absolute local directory.
docker compose config --quiet
docker compose build
docker compose up -d --wait --wait-timeout 120
docker compose ps
curl --fail http://127.0.0.1:8080/api/health
```

The directory must exist and be writable by UID/GID 10001. Rootless Docker/NAS user mapping may need a different host owner for that container user. To move an existing **v2** library (`bardic.db`), stop its old server, preserve a full copy, then copy the **whole** stopped data folder into the chosen directory. Set ownership/access for all copied contents, not only the root directory: metadata-preserving copies can retain another user's private directories. For ordinary rootful Docker, use `sudo chown -R 10001:10001 /srv/bardic/data` on this chosen copy, with root directory mode 0700. Do not run both servers against it. The legacy v1 `library.sqlite3` folder is not a v2 data directory; this packaging does not migrate it.

`.env` holds paths and ports, not provider keys. Enter keys through Bardic's voice-source setup. Live keys are stored in the database, so protect that directory and full copies. Build contexts exclude local libraries, `.env`, dependencies and browser reports.

The API has no published host port. It listens on the Compose network at `bardic-server:8765`; Caddy publishes host `127.0.0.1:8080` by default. Provider addresses are resolved **inside the server container**: `127.0.0.1` there means the container. Use a reachable LAN/Tailscale address for Breeze. A remote Tailscale voice server needs a route through the host from the container network; verify that on the chosen target.

## Private HTTPS

Install/sign in to Tailscale on the Linux host, restrict access to trusted devices, and enable tailnet HTTPS when prompted. Forward the gateway with [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve):

```sh
tailscale serve --bg http://127.0.0.1:8080
tailscale serve status
```

Use the reported HTTPS URL on each device. Keep the address stable: browser downloads belong to its origin. Serve is private to the tailnet; do not enable Funnel or router port forwarding for this setup. Tailnet access rules are the access boundary.

An existing HTTPS reverse proxy is also suitable. Preserve the original `Host` (including its port), `Origin`, `Referer`, `Sec-Fetch-*` and `Range` headers; forward `/api` without removing the prefix. Let `/api/events` stream promptly and cancel upstream when the browser disconnects. Caddy in this stack handles these requirements. A custom DNS name outside accepted local/`.ts.net` names needs its hostname in `BARDIC_ALLOW_HOSTS`. Same-origin HTTPS needs no `BARDIC_ALLOW_ORIGINS` entry; use that setting only for a deliberate separate web origin. Never remove provenance headers to make a refused request succeed.

## Stop, restart and update

```sh
docker compose logs --tail 100
docker compose stop
docker compose up -d --wait --wait-timeout 120
```

Docker sends SIGTERM; the server uses its graceful shutdown path for both SIGTERM and SIGINT. The five-minute Compose grace period lets an admitted premium sample settle before releasing the lock (provider timeout: 240 seconds). Keep this timeout in a NAS UI. A forced kill or power loss remains an interrupted operation; finished audio is retained, and startup recovers interrupted work. Wait for exports to reach `ready` and backups to reach `done` before stopping: graceful shutdown does not promise those tasks finish.

Run exactly one server per data folder. Do not scale it, overlap old/new instances, or use an automatic image updater. Update web and server together:

1. Wait for active work to settle, create a completed backup and copy it off the host.
2. Record both current commits/image tags; stop the stack.
3. Check out the next tested pair, choose a new `BARDIC_IMAGE_TAG`, build, then start with `--wait`.
4. Confirm library, places and existing audio before new generation.

Migrations run at startup. Reverting images cannot undo a database migration; an incompatible rollback needs the pre-upgrade backup restored to a fresh data directory with the old image pair. Base-image digests are pinned: update them deliberately and rerun deployment verification for base/security updates. Debian packages installed during builds still follow that distribution's repositories.

## Back up and restore

Create the snapshot with `POST /api/backups`, sending `X-Bardic-Device` (see the server's [curl guide](../../bardic-server/docs/CURL.md)). Poll `GET /api/backups` until **the returned id** has `state: done`. A `running` or `failed` directory is not a usable backup. Avoid deleting books/audio or changing generation during capture/copy. The completed folder is:

```text
$BARDIC_DATA_DIR/backups/<id>/
  bardic.db
  media/
    originals/
    audio/
    samples/
```

The snapshot strips provider keys and vacuums their old database pages. Media files are hard links on the same disk. Copy the completed folder to independent storage to protect against disk failure; a recursive copy/archive reads linked contents. Verify the destination database and all three media folders. A raw copy of a running `bardic.db` is not a substitute for the backup API; a full stopped directory copy includes live keys.

For recovery or a rehearsal, stop the destination server and create a new empty local data directory. Copy `bardic.db` to its root, then copy the **contents** of `media/` there so `originals`, `audio` and `samples` sit beside the database. Set ownership of all restored contents to UID/GID 10001 and root directory mode 0700; point `BARDIC_DATA_DIR` there and start a single server with the appropriate release pair. Keep the previous data folder until the restore is checked. Verify exact text, listeners/settings, places and playable audio before entering keys again. Backups omit regenerable exports and older backup folders. A restored snapshot may record its own backup as interrupted, since it was taken before the live server marked that backup `done`; this does not invalidate restored books/audio.

## Verify the deployment package

After building the images, use Node 24 and install the verification dependencies/browser engines:

```sh
npm ci
npx playwright install chromium firefox webkit
npm run deployment:check
```

The check uses its own Compose project, temporary folders and loopback port, an explicit temporary environment file, and fake Breeze. It uses no existing library, `.env` or real provider. Chromium, Firefox and WebKit load the actual compiled app, create synthetic listeners, verify production hooks are absent, and reload a fresh cached document after their origin sockets are cut. Playback is muted. The check also exercises static caching, API guards, streaming events, synthetic Unicode text, audio and Range, ffmpeg export, clean SIGTERM exit, server recreation behind an unchanged gateway, and restoration of a key-free backup to a separate folder. It removes its containers and temporary data afterwards. On Linux, Playwright also needs its browser system dependencies (`npx playwright install --with-deps`). Normal types/logic/design/browser checks still apply to source changes.

Results and platform limits are in [ROADMAP.md](ROADMAP.md). Native ARM64 ownership/restart, private HTTPS and Tailscale routing to Breeze were checked on [Spark](SPARK-DEPLOYMENT.md); an actual reboot remains unverified there. NAS permissions and physical-device playback still need checks on the chosen devices.

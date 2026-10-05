#!/bin/sh
# Install only from a reviewed source checkout. This script never opens the library data directory.
set -eu

if [ "$#" -ne 3 ]; then
  printf '%s\n' 'Usage: install-spark-updater.sh ROOT DEPLOYED_SERVER_FULL_SHA DEPLOYED_WEB_FULL_SHA' >&2
  exit 2
fi

installer_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
exec python3 - "$installer_dir/.." "$@" <<'PY'
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile

NODE_IMAGE = "node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1"


def fail(message):
    raise SystemExit(message)


def safe_text(value, label):
    if not isinstance(value, str) or not value or any(ord(c) < 32 or ord(c) == 127 for c in value):
        fail(f"{label} must be nonempty and contain no control characters")
    return value


def full_sha(value, label):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{40}", value):
        fail(f"{label} must be a full lowercase 40-character commit SHA")
    return value


def atomic_write(path, content, mode, preserve=False):
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(content)
            stream.flush()
            os.fchmod(stream.fileno(), mode)
            os.fsync(stream.fileno())
        if preserve:
            try:
                os.link(temporary, path)
            except FileExistsError:
                return False
        else:
            os.replace(temporary, path)
        return True
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        fail(f"Cannot read valid JSON from {path}: {error}")


def repo_url(variable, checkout):
    value = os.environ.get(variable)
    if not value:
        remote = subprocess.run(["git", "-C", str(checkout), "remote", "get-url", "origin"], capture_output=True, text=True)
        value = remote.stdout.strip() if remote.returncode == 0 else ""
    safe_text(value, variable)
    if value.startswith("-"):
        fail(f"{variable} cannot start with a dash")
    return value


def literal_env_value(env_path, key):
    # Read only the requested value; never source an env file as shell code.
    values = []
    for line in env_path.read_text(encoding="utf-8").splitlines():
        match = re.fullmatch(r"\s*(?:export\s+)?" + re.escape(key) + r"\s*=\s*(.*?)\s*", line)
        if not match:
            continue
        value = match.group(1)
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values.append(value)
    if len(values) != 1:
        fail(f"{env_path} must contain exactly one {key}")
    return values[0]


def image_tag(env_path):
    value = literal_env_value(env_path, "BARDIC_IMAGE_TAG")
    if not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}", value):
        fail("The existing BARDIC_IMAGE_TAG must be a literal Docker tag")
    return value


def systemd_argument(value):
    # ExecStart uses systemd quoting/specifiers, not a shell. The ':' prefix below
    # disables environment expansion; '%%' protects literal percent characters.
    return '"' + safe_text(value, "systemd path").replace("\\", "\\\\").replace('"', '\\"').replace("%", "%%") + '"'


def main():
    source = Path(sys.argv[1]).resolve(strict=True)
    root = Path(safe_text(sys.argv[2], "ROOT")).expanduser().resolve(strict=True)
    server_sha = full_sha(sys.argv[3], "Server SHA")
    web_sha = full_sha(sys.argv[4], "Web SHA")
    for program in ("git", "docker", "systemctl"):
        if shutil.which(program) is None:
            fail(f"Required program is missing: {program}")
    for path in (root / ".env", root / "compose.host.yaml"):
        if not path.is_file():
            fail(f"Existing deployment file is missing: {path}")
    current = root / "current"
    if not current.is_symlink():
        fail("ROOT/current must be the existing release symlink")
    release = current.resolve(strict=True)
    releases = (root / "releases").resolve(strict=True)
    if release.parent != releases:
        fail("ROOT/current must select one direct child of ROOT/releases")
    for path in (release / "bardic-web/compose.yaml", release / "bardic-server/Dockerfile"):
        if not path.is_file():
            fail(f"Existing paired source snapshot is missing: {path}")
    for relative in ("scripts/spark-update.py", "deploy/quiet-check.mjs", "deploy/systemd/bardic-update.service", "deploy/systemd/bardic-update.timer"):
        if not (source / relative).is_file():
            fail(f"Reviewed updater source is missing: {relative}")

    updater = root / "updater"
    updater.mkdir(mode=0o700, exist_ok=True)
    (updater / "repos").mkdir(mode=0o700, exist_ok=True)
    config_path = updater / "config.json"
    had_config = config_path.exists()
    if had_config:
        config = read_json(config_path)
        if config.get("version") != 1 or config.get("root") != str(root):
            fail("Existing updater config has an unsupported version or different ROOT; it was left unchanged")
        baseline = config.get("baseline", {})
        full_sha(baseline.get("server", ""), "Existing baseline server SHA")
        full_sha(baseline.get("web", ""), "Existing baseline web SHA")
        for key in ("web_repo", "server_repo", "node_image"):
            safe_text(config.get(key, ""), f"Existing {key}")
    else:
        config = {
            "version": 1, "root": str(root),
            "web_repo": repo_url("BARDIC_WEB_REPO", source),
            "server_repo": repo_url("BARDIC_SERVER_REPO", source.parent / "bardic-server"),
            "baseline": {"server": server_sha, "web": web_sha},
            "node_image": NODE_IMAGE,
        }

    manifest_path = release / "release.json"
    if manifest_path.exists():
        manifest = read_json(manifest_path)
        if manifest.get("version") != 1 or manifest.get("id") != release.name:
            fail("Existing release manifest does not match current; it was left unchanged")
        full_sha(manifest.get("server", ""), "Existing release server SHA")
        full_sha(manifest.get("web", ""), "Existing release web SHA")
        if not had_config and (manifest["server"] != server_sha or manifest["web"] != web_sha):
            fail("Deployed SHAs do not match the existing current manifest; no baseline was reset")
        tag = manifest.get("tag", "")
        if not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}", tag):
            fail("Existing release manifest has an invalid image tag")
    else:
        if had_config:
            # Never invent baseline metadata for a later release on a repeated install.
            fail("Existing updater config has no current release manifest; recover that manifest before reinstalling")
        tag = image_tag(root / ".env")
        manifest = {
            "version": 1, "id": release.name, "server": server_sha, "web": web_sha,
            "tag": tag, "api_version": "0.5.0", "node_image": config["node_image"],
            "verified": True, "source": "installed",
        }
        atomic_write(manifest_path, json.dumps(manifest, indent=2) + "\n", 0o600, preserve=True)

    release_env = release / "release.env"
    if release_env.exists():
        if image_tag(release_env) != tag or literal_env_value(release_env, "BARDIC_SERVER_CONTEXT") != "../bardic-server":
            fail("Existing release.env disagrees with the current manifest or paired server context; it was left unchanged")
    atomic_write(release_env, f"BARDIC_IMAGE_TAG={tag}\nBARDIC_SERVER_CONTEXT=../bardic-server\n", 0o600, preserve=True)
    atomic_write(config_path, json.dumps(config, indent=2) + "\n", 0o600, preserve=True)
    for source_path, destination in ((source / "scripts/spark-update.py", updater / "spark-update.py"), (source / "deploy/quiet-check.mjs", updater / "quiet-check.mjs")):
        atomic_write(destination, source_path.read_text(encoding="utf-8"), 0o700)

    wrapper = "\n".join((
        "#!/bin/sh", "set -eu", f"BARDIC_ROOT={shlex.quote(str(root))}",
        "unset BARDIC_IMAGE_TAG BARDIC_SERVER_CONTEXT",
        'exec docker compose --project-name bardic-v2 --env-file "$BARDIC_ROOT/.env" --env-file "$BARDIC_ROOT/current/release.env" -f "$BARDIC_ROOT/current/bardic-web/compose.yaml" -f "$BARDIC_ROOT/compose.host.yaml" "$@"', "",
    ))
    atomic_write(root / "compose", wrapper, 0o700)

    unit_directory = Path.home() / ".config/systemd/user"
    unit_directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    for name in ("bardic-update.service", "bardic-update.timer"):
        atomic_write(unit_directory / name, (source / "deploy/systemd" / name).read_text(encoding="utf-8"), 0o600)
    dropin = unit_directory / "bardic-update.service.d"
    dropin.mkdir(mode=0o700, exist_ok=True)
    command = "ExecStart=:/usr/bin/python3 " + systemd_argument(str(updater / "spark-update.py")) + " --config " + systemd_argument(str(config_path))
    atomic_write(dropin / "installation.conf", "[Service]\nExecStart=\n" + command + "\n", 0o600)

    # Install metadata and validate the pair before scheduling any live update.
    result = subprocess.run([sys.executable, str(updater / "spark-update.py"), "--config", str(config_path), "--check-only"], capture_output=True, text=True)
    if result.returncode != 0:
        if result.stderr.strip():
            print(result.stderr.strip(), file=sys.stderr)
        fail("Updater --check-only failed; the timer was not enabled by this installation")
    try:
        check = json.loads(result.stdout.strip().splitlines()[-1])
    except (IndexError, ValueError):
        fail("Updater --check-only did not return its JSON disposition; the timer was not enabled")
    if check.get("disposition") not in {"unchanged", "remote_behind_installation", "candidate"}:
        fail(f"Updater check disposition {check.get('disposition')!r} requires attention; the timer was not enabled")
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "--user", "enable", "--now", "bardic-update.timer"], check=True)
    print(json.dumps({"installed": True, "root": str(root), "baseline_preserved": had_config, "check_disposition": check["disposition"], "timer": "bardic-update.timer"}))


main()
PY

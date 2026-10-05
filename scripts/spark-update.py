#!/usr/bin/env python3
"""Pull, verify and promote one immutable Bardic release pair on a Linux host.

Only trusted main branches are deployment inputs. GitHub credentials, inbound
webhooks and a CI runner on the production host are unnecessary.
"""
from __future__ import annotations

import argparse
import contextlib
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
import uuid


class UpdateError(RuntimeError):
    pass


def atomic_json(path: Path, value: dict) -> None:
    atomic_text(path, json.dumps(value, indent=2) + "\n")


def atomic_text(path: Path, value: str, mode=0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("w") as out:
        os.chmod(temporary, mode)
        out.write(value)
        out.flush()
        os.fsync(out.fileno())
    os.replace(temporary, path)
    sync_directory(path.parent)


def sync_directory(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def load_json(path: Path, default=None):
    if not path.exists() and default is not None:
        return default
    return json.loads(path.read_text())


def read_env(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text().splitlines():
        match = re.fullmatch(r"([A-Z_][A-Z_0-9]*)=(.*)", line.strip())
        if match:
            values[match[1]] = match[2].strip().strip("\"'")
    return values


def contract_version(path: Path) -> str:
    # The normative contracts use a literal info.version near the file's start.
    text = path.read_text()
    info = re.search(r"^info:\n((?:[ \t].*\n|\n)*)", text, re.M)
    match = re.search(r"^  version: [\"']?([0-9]+\.[0-9]+\.[0-9]+)[\"']?\s*$", info[1] if info else "", re.M)
    if not match:
        raise UpdateError("contract_version_missing")
    return match[1]


def release_id(pair: dict) -> str:
    return pair["server"][:12] + "-" + pair["web"][:12]


def same_pair(a: dict, b: dict) -> bool:
    return a["server"] == b["server"] and a["web"] == b["web"]


class Runner:
    def __init__(self, log: Path | None = None):
        self.log = log

    def run(self, args: list[str], *, cwd: Path | None = None, timeout=1800,
            check=True, binary=False):
        environment = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
        # Compose gives exported variables precedence over --env-file. Release
        # selection must always come from the atomic current/release.env pair.
        for name in list(environment):
            if name.startswith(("BARDIC_", "COMPOSE_")):
                environment.pop(name)
        result = subprocess.run(args, cwd=cwd, capture_output=True,
                                text=not binary, timeout=timeout,
                                env=environment)
        if self.log and not binary:
            with self.log.open("a") as out:
                out.write("$ " + " ".join(args) + "\n")
                out.write(result.stdout)
                out.write(result.stderr)
        if check and result.returncode:
            # Never put a live DB probe payload or server logs in the journal.
            raise UpdateError("command_failed: " + args[0] + " " + " ".join(args[1:3]))
        return result


class Updater:
    def __init__(self, config: dict, runner: Runner | None = None):
        self.config = config
        self.root = Path(config["root"])
        if not self.root.is_absolute() or self.root == Path("/"):
            raise UpdateError("invalid_installation_root")
        self.work = self.root / "updater"
        self.releases = self.root / "releases"
        self.state_path = self.work / "state.json"
        self.transaction_path = self.work / "transaction.json"
        self.runner = runner or Runner()
        self.env = read_env(self.root / ".env")
        self.data = Path(self.env["BARDIC_DATA_DIR"])
        restoring = (not self.data.exists() and self.transaction_path.exists()
                     and load_json(self.transaction_path).get("phase") == "restoring")
        if not self.data.is_absolute() or self.data.is_symlink() or (not self.data.is_dir() and not restoring):
            raise UpdateError("data_directory_must_be_an_absolute_real_directory")
        if ((self.data.exists() and self.data.stat().st_dev != self.root.stat().st_dev)
                or self.data.parent.stat().st_dev != self.root.stat().st_dev or os.path.ismount(self.data)):
            raise UpdateError("snapshot_and_data_must_share_a_local_filesystem")
        self.port = int(self.env.get("BARDIC_HTTP_PORT", "8080"))
        if self.env.get("BARDIC_BIND_ADDRESS", "127.0.0.1") != "127.0.0.1":
            raise UpdateError("updater_requires_the_private_loopback_gateway")
        self.node_image = config["node_image"]
        if not re.fullmatch(r"node:[a-zA-Z0-9._-]+@sha256:[0-9a-f]{64}", self.node_image):
            raise UpdateError("probe_image_must_be_digest_pinned")
        self.project = config.get("project_name", "bardic-v2")
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", self.project):
            raise UpdateError("invalid_compose_project_name")

    def current(self) -> tuple[Path, dict]:
        path = (self.root / "current").resolve(strict=True)
        if path.parent != self.releases.resolve():
            raise UpdateError("current_is_not_an_installed_release")
        return path, load_json(path / "release.json")

    def state(self) -> dict:
        return load_json(self.state_path, {})

    def record(self, disposition: str, **facts) -> dict:
        state = {**self.state(), "checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                 "disposition": disposition, **facts}
        atomic_json(self.state_path, state)
        return state

    def git(self, name: str, args: list[str], **kwargs):
        return self.runner.run(["git", "--git-dir=" + str(self.work / "repos" / (name + ".git")), *args], **kwargs)

    def fetch_pair(self) -> dict:
        result = {}
        for name in ("server", "web"):
            repo = self.work / "repos" / (name + ".git")
            url = self.config[name + "_repo"]
            if not re.fullmatch(r"https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?", url):
                raise UpdateError("repository_must_be_public_github_https")
            if not repo.exists():
                repo.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                self.runner.run(["git", "clone", "--bare", url, str(repo)], timeout=180)
            self.git(name, ["fetch", "--prune", "origin", "+refs/heads/main:refs/heads/main"], timeout=180)
            result[name] = self.git(name, ["rev-parse", "refs/heads/main"]).stdout.strip()
            if not re.fullmatch(r"[0-9a-f]{40}", result[name]):
                raise UpdateError("invalid_main_commit")
        return result

    def can_advance(self, installed: dict, candidate: dict) -> bool:
        for name in ("server", "web"):
            result = self.git(name, ["merge-base", "--is-ancestor", installed[name], candidate[name]], check=False)
            if result.returncode:
                return False
        return True

    def export(self, name: str, sha: str, target: Path) -> None:
        archive = self.git(name, ["archive", "--format=tar", sha], binary=True).stdout
        target.mkdir(parents=True)
        with tarfile.open(fileobj=io.BytesIO(archive)) as bundle:
            # Git archives contain files/directories. Extract explicitly so this
            # also works on Python 3.11 without tarfile's newer data filter.
            for member in bundle:
                parts = Path(member.name).parts
                if member.name.startswith("/") or ".." in parts or not (member.isfile() or member.isdir()):
                    raise UpdateError("unsafe_source_archive_member")
                destination = target.joinpath(*parts)
                if member.isdir():
                    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
                else:
                    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                    with bundle.extractfile(member) as source, destination.open("xb") as out:
                        shutil.copyfileobj(source, out)
                    destination.chmod(member.mode & 0o777)

    def prepare(self, pair: dict) -> Path:
        release = self.releases / release_id(pair)
        if not release.exists():
            temporary = self.releases / (".stage-" + uuid.uuid4().hex)
            temporary.mkdir(mode=0o700)
            try:
                for name in ("server", "web"):
                    self.export(name, pair[name], temporary / ("bardic-" + name))
                os.replace(temporary, release)
                sync_directory(self.releases)
            finally:
                if temporary.exists():
                    shutil.rmtree(temporary)
        server = release / "bardic-server"
        web = release / "bardic-web"
        required = [server / "Dockerfile", web / "Dockerfile", web / "compose.yaml",
                    web / "deploy/quiet-check.mjs"]
        if any(not p.is_file() for p in required):
            raise UpdateError("main_pair_not_ready_for_deployment")
        if (server / "docs/contract/openapi.yaml").read_bytes() != (web / "contract/openapi.yaml").read_bytes():
            raise UpdateError("contracts_do_not_match")
        for repo in (server, web):
            if not re.search(r"^FROM .* AS verify\s*$", (repo / "Dockerfile").read_text(), re.M | re.I):
                raise UpdateError("main_pair_missing_verify_target")
        api_version = contract_version(web / "contract/openapi.yaml")
        manifest = {"version": 1, "id": release.name, **pair, "tag": release.name,
                    "api_version": api_version, "node_image": self.node_image,
                    "source": "main", "verified": False}
        existing = load_json(release / "release.json", {})
        if existing and (not same_pair(existing, pair) or existing.get("tag") != release.name):
            raise UpdateError("release_manifest_mismatch")
        if not existing.get("verified"):
            atomic_json(release / "release.json", manifest)
        atomic_text(release / "release.env", "BARDIC_IMAGE_TAG=" + release.name + "\nBARDIC_SERVER_CONTEXT=../bardic-server\n")
        return release

    def compose(self, release: Path, args: list[str], *, project=None,
                env_file: Path | None = None, extra: Path | None = None,
                override=True, **kwargs):
        command = ["docker", "compose", "--project-name", project or self.project,
                   "--env-file", str(env_file or self.root / ".env"),
                   "--env-file", str(release / "release.env"),
                   "-f", str(release / "bardic-web/compose.yaml")]
        if override:
            command += ["-f", str(self.root / "compose.host.yaml")]
        if extra:
            command += ["-f", str(extra)]
        return self.runner.run([*command, *args], **kwargs)

    def check_compose(self, release: Path) -> None:
        """Check resolved host overrides before any build or live admission change."""
        config = json.loads(self.compose(release, ["config", "--format", "json"]).stdout)
        services = config.get("services", {})
        tag = load_json(release / "release.json")["tag"]
        if set(services) != {"bardic-server", "bardic-web"}:
            raise UpdateError("unexpected_compose_services")
        for name, service in services.items():
            if service.get("image") != name + ":" + tag or service.get("network_mode") or service.get("privileged"):
                raise UpdateError("unsafe_compose_service")
        server, web = services["bardic-server"], services["bardic-web"]
        mounts = server.get("volumes", [])
        if (server.get("ports") or len(mounts) != 1 or mounts[0].get("type") != "bind"
                or mounts[0].get("source") != str(self.data) or mounts[0].get("target") != "/data"
                or mounts[0].get("read_only")):
            raise UpdateError("unexpected_server_data_or_published_port")
        ports = web.get("ports", [])
        if (web.get("volumes") or len(ports) != 1 or ports[0].get("host_ip") != "127.0.0.1"
                or str(ports[0].get("published")) != str(self.port) or ports[0].get("target") != 8080
                or ports[0].get("protocol", "tcp") != "tcp"):
            raise UpdateError("unexpected_gateway_mount_or_binding")

    def retain_previous_assets(self, release: Path) -> None:
        """Keep hashed chunks requested later by a tab opened before this update."""
        previous, installed = self.current()
        tag = load_json(release / "release.json")["tag"]
        image = "bardic-web:" + tag
        with tempfile.TemporaryDirectory(prefix="retained-assets-", dir=self.work) as directory:
            temporary = Path(directory)
            for label, source_image in (("previous", "bardic-web:" + installed["tag"]), ("fresh", image)):
                destination = temporary / label
                destination.mkdir()
                container = "bardic-assets-" + uuid.uuid4().hex
                try:
                    # Never start these containers or connect them to a network.
                    self.runner.run(["docker", "create", "--network", "none", "--name", container, source_image])
                    self.runner.run(["docker", "cp", container + ":/srv/assets/.", str(destination)])
                finally:
                    self.runner.run(["docker", "rm", "--force", container], check=False)
            retained = temporary / "retained"
            retained.mkdir()
            count = 0
            for source in (temporary / "previous").rglob("*"):
                if source.is_symlink() or not (source.is_file() or source.is_dir()):
                    raise UpdateError("unexpected_asset_type")
                if source.is_dir():
                    continue
                relative = source.relative_to(temporary / "previous")
                fresh = temporary / "fresh" / relative
                if fresh.exists():
                    if not fresh.is_file() or fresh.is_symlink() or source.read_bytes() != fresh.read_bytes():
                        raise UpdateError("hashed_asset_collision")
                    continue
                destination = retained / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, destination)
                destination.chmod(0o644)
                count += 1
            if count:
                self.runner.run(["docker", "image", "tag", image, image + "-fresh"])
                (temporary / "Dockerfile").write_text("FROM " + image + "-fresh\nCOPY retained/ /srv/assets/\n")
                self.runner.run(["docker", "build", "-t", image, str(temporary)], timeout=300)
        manifest = load_json(release / "release.json")
        manifest["retained_assets_from"] = previous.name
        manifest["retained_asset_count"] = count
        atomic_json(release / "release.json", manifest)

    def ensure_stopped(self, release: Path) -> None:
        if self.compose(release, ["ps", "--status", "running", "-q", "bardic-server"]).stdout.strip():
            raise UpdateError("server_still_running")

    def probe(self, data: Path, release: Path, *, stopped=False) -> dict:
        probe = release / "bardic-web/deploy/quiet-check.mjs"
        if not probe.exists():
            probe = self.work / "quiet-check.mjs"
        result = self.runner.run(["docker", "run", "--rm", "--network", "none", "--read-only",
                                  "--mount", f"type=bind,src={data},dst=/data,readonly",
                                  "--mount", f"type=bind,src={probe},dst=/probe.mjs,readonly",
                                  self.node_image, "node", "--no-warnings", "/probe.mjs",
                                  *(["--stopped"] if stopped else [])], timeout=30)
        try:
            value = json.loads(result.stdout)
            if not isinstance(value, dict) or type(value.get("quiet")) is not bool or not isinstance(value.get("reasons"), list):
                raise ValueError()
            return value
        except (ValueError, TypeError):
            raise UpdateError("invalid_quiescence_probe") from None

    @staticmethod
    def get(url: str, *, method="GET", body=None, headers=None, expected=200):
        request = urllib.request.Request(url, method=method,
                    data=json.dumps(body).encode() if body is not None else None,
                    headers=headers or {})
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                data = response.read()
                status = response.status
        except urllib.error.HTTPError as error:
            status, data = error.code, error.read()
        if status != expected:
            raise UpdateError("unexpected_http_status: " + str(status))
        return data

    def gateway_check(self, port: int, version: str, *, synthetic=False) -> dict:
        base = f"http://127.0.0.1:{port}"
        health = json.loads(self.get(base + "/api/health"))
        server = json.loads(self.get(base + "/api/server"))
        if health.get("ok") is not True or server.get("api_version") != version:
            raise UpdateError("gateway_version_or_health_mismatch")
        html = self.get(base + "/").decode()
        assets = set(re.findall(r'["\'](/assets/[^"\']+)["\']', html))
        if not assets:
            raise UpdateError("gateway_assets_missing")
        for asset in assets | {"/sw.js"}:
            content = self.get(base + asset)
            if asset.endswith(".js") and re.search(rb"__player|__audio|__offline|installE2E|installOfflineE2E", content):
                raise UpdateError("production_test_hook_found")
        self.get(base + "/api/voices/00000000000000000000000000/sample", method="HEAD",
                 headers={"Origin": base, "Sec-Fetch-Site": "same-origin"}, expected=404)
        self.get(base + "/api/voices/00000000000000000000000000/sample", method="HEAD",
                 headers={"Origin": "https://foreign.invalid", "Sec-Fetch-Site": "same-origin"}, expected=403)
        if synthetic:
            headers = {"X-Bardic-Device": "spark-update-synthetic-check", "Content-Type": "application/json", "Origin": base}
            listener = json.loads(self.get(base + "/api/listeners", method="POST",
                        body={"name": "Synthetic update check"}, headers=headers, expected=201))
            stored = json.loads(self.get(base + "/api/listeners"))
            if not any(item.get("id") == listener["id"] for item in stored["items"]):
                raise UpdateError("synthetic_listener_not_persisted")
        return {"id": server["id"], "api_version": server["api_version"]}

    def validate(self, release: Path) -> None:
        manifest = load_json(release / "release.json")
        if manifest["verified"]:
            return
        self.check_compose(release)
        self.runner.log = release / "verification.log"
        for name in ("server", "web"):
            contexts = ["--build-context", "bardic_server=" + str(release / "bardic-server")] if name == "web" else []
            self.runner.run(["docker", "build", *contexts, "--target", "verify", "-t",
                             f"bardic-{name}-verify:{manifest['tag']}", str(release / ("bardic-" + name))], timeout=5400)
        self.compose(release, ["build"], timeout=5400)
        self.retain_previous_assets(release)
        manifest = load_json(release / "release.json")
        # A separate Compose project/data directory exercises only original synthetic
        # data. The server has only an internal network, so it cannot reach real
        # providers. A separate gateway network permits loopback-published ingress.
        smoke = Path(tempfile.mkdtemp(prefix="smoke-", dir=self.work))
        os.chmod(smoke, 0o700)
        data = smoke / "data"
        data.mkdir(mode=0o700)
        image = "bardic-server:" + manifest["tag"]
        self.runner.run(["docker", "run", "--rm", "--network", "none", "--user", "0:0", "--entrypoint", "/bin/sh",
                         "--mount", f"type=bind,src={data},dst=/data", image, "-ec", "chown 10001:10001 /data"])
        with contextlib.closing(socket.socket()) as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        env = smoke / ".env"
        env.write_text(f"BARDIC_DATA_DIR={data}\nBARDIC_BIND_ADDRESS=127.0.0.1\nBARDIC_HTTP_PORT={port}\n")
        extra = smoke / "isolated.json"
        extra.write_text(json.dumps({"networks": {"default": {"internal": True}, "check-ingress": {}},
                                     "services": {"bardic-web": {"networks": ["default", "check-ingress"]}}}))
        project = "bardic-check-" + uuid.uuid4().hex[:10]
        try:
            self.compose(release, ["up", "-d", "--no-build", "--wait", "--wait-timeout", "120"],
                         project=project, env_file=env, extra=extra, override=False, timeout=180)
            original = self.gateway_check(port, manifest["api_version"], synthetic=True)
            facts = self.probe(data, release)
            if not facts["quiet"] or facts.get("serverId") != original["id"]:
                raise UpdateError("candidate_schema_probe_failed")
            self.compose(release, ["restart", "bardic-server"], project=project, env_file=env,
                         extra=extra, override=False, timeout=360)
            self.compose(release, ["up", "-d", "--no-build", "--wait", "--wait-timeout", "120"],
                         project=project, env_file=env, extra=extra, override=False, timeout=180)
            if self.gateway_check(port, manifest["api_version"]) != original:
                raise UpdateError("synthetic_restart_changed_identity")
            stored = json.loads(self.get(f"http://127.0.0.1:{port}/api/listeners"))
            if len(stored["items"]) != 1:
                raise UpdateError("synthetic_restart_lost_listener")
        finally:
            self.compose(release, ["down", "--timeout", "300"], project=project, env_file=env,
                         extra=extra, override=False, timeout=360)
            self.runner.run(["docker", "run", "--rm", "--network", "none", "--user", "0:0", "--entrypoint", "/bin/sh",
                             "--mount", f"type=bind,src={smoke},dst=/cleanup", image, "-ec", "rm -rf /cleanup/data"])
            shutil.rmtree(smoke)
        manifest["verified"] = True
        atomic_json(release / "release.json", manifest)
        self.runner.log = None

    def switch(self, release: Path) -> None:
        link = self.root / (".current-" + uuid.uuid4().hex)
        link.symlink_to(release.relative_to(self.root))
        os.replace(link, self.root / "current")
        sync_directory(self.root)

    def transaction(self, value: dict, phase: str) -> None:
        value["phase"] = phase
        atomic_json(self.transaction_path, value)

    def snapshot(self, previous: Path, destination: Path) -> None:
        destination.mkdir(mode=0o700, parents=True)
        image = "bardic-server:" + load_json(previous / "release.json")["tag"]
        self.runner.run(["docker", "run", "--rm", "--network", "none", "--read-only", "--user", "0:0", "--entrypoint", "/bin/sh",
                         "--mount", f"type=bind,src={self.data},dst=/data,readonly",
                         "--mount", f"type=bind,src={destination},dst=/snapshot", image,
                         "-ec", "cp -a /data /snapshot/data && sync -f /snapshot/data"], timeout=5400)
        if not (destination / "data").is_dir():
            raise UpdateError("snapshot_copy_missing")

    def server_check(self, release: Path, expected_id: str) -> dict:
        manifest = load_json(release / "release.json")
        ids = self.compose(release, ["ps", "-q", "bardic-server"]).stdout.strip().splitlines()
        if len(ids) != 1:
            raise UpdateError("server_container_missing")
        container = ids[0]
        image = self.runner.run(["docker", "inspect", "--format", "{{.Image}}", container]).stdout.strip()
        expected = self.runner.run(["docker", "image", "inspect", "--format", "{{.Id}}",
                                    "bardic-server:" + manifest["tag"]]).stdout.strip()
        if image != expected:
            raise UpdateError("server_image_mismatch")
        response = self.runner.run(["docker", "exec", container, "curl", "--fail", "--silent", "--max-time", "10",
                                    "http://127.0.0.1:8765/api/server"], timeout=15)
        server = json.loads(response.stdout)
        if server.get("id") != expected_id or server.get("api_version") != manifest["api_version"]:
            raise UpdateError("server_identity_or_version_changed")
        return {"id": server["id"], "api_version": server["api_version"]}

    @staticmethod
    def safe_to_restore(before: dict, after: dict) -> bool:
        return (after.get("quiet") is True and before.get("serverId") == after.get("serverId")
                and isinstance(before.get("usageCount"), int)
                and before["usageCount"] == after.get("usageCount"))

    def rollback(self, tx: dict) -> None:
        previous = Path(tx["previous"])
        candidate = Path(tx["candidate"])
        self.compose(candidate, ["stop"], timeout=360)
        self.ensure_stopped(candidate)
        after = self.probe(self.data, candidate, stopped=True)
        if not self.safe_to_restore(tx["before"], after):
            self.transaction(tx, "needs_recovery")
            raise UpdateError("manual_recovery_required: candidate_activity_or_unreadable_schema")
        failed = self.work / "snapshots" / (tx["attempt"] + "-failed-data")
        tx["failed_data"] = str(failed)
        self.transaction(tx, "restoring")
        self.restore_snapshot(tx)

    def restore_snapshot(self, tx: dict) -> None:
        self.ensure_stopped(Path(tx["candidate"]))
        previous = Path(tx["previous"])
        snapshot = Path(tx["snapshot"]) / "data"
        failed = Path(tx.get("failed_data", str(self.work / "snapshots" / (tx["attempt"] + "-failed-data"))))
        # Continue either interrupted rename without overwriting a data folder.
        if snapshot.exists() and self.data.exists() and not failed.exists():
            os.replace(self.data, failed)
            sync_directory(self.data.parent)
            sync_directory(failed.parent)
        if snapshot.exists() and not self.data.exists() and failed.exists():
            os.replace(snapshot, self.data)
            sync_directory(self.data.parent)
            sync_directory(snapshot.parent)
        if snapshot.exists() or not self.data.exists() or not failed.exists():
            raise UpdateError("manual_recovery_required: ambiguous_restore_directories")
        # Reissue barriers when recovery resumes just after either rename.
        for parent in {self.data.parent, failed.parent, snapshot.parent}:
            sync_directory(parent)
        if not self.safe_to_restore(tx["before"], self.probe(self.data, previous, stopped=True)):
            raise UpdateError("manual_recovery_required: restored_snapshot_mismatch")
        self.switch(previous)
        self.transaction(tx, "rollback_opening")
        self.finish_rollback(tx)

    def finish_rollback(self, tx: dict) -> None:
        previous = Path(tx["previous"])
        self.compose(previous, ["up", "-d", "--no-build", "--wait", "--wait-timeout", "120"], timeout=180)
        self.server_check(previous, tx["before"]["serverId"])
        self.gateway_check(self.port, load_json(previous / "release.json")["api_version"])
        self.transaction_path.unlink()
        self.record("rolled_back", failed_pair=load_json(Path(tx["candidate"]) / "release.json"),
                    recovery_data=tx.get("failed_data", str(self.work / "snapshots" / (tx["attempt"] + "-failed-data"))))

    def recover(self) -> None:
        if not self.transaction_path.exists():
            return
        tx = load_json(self.transaction_path)
        phase = tx["phase"]
        previous = Path(tx["previous"])
        if phase in ("closing", "stopped", "snapshot_ready"):
            self.switch(previous)
            self.compose(previous, ["up", "-d", "--no-build", "--wait", "--wait-timeout", "120"], timeout=180)
            self.transaction_path.unlink()
            self.record("recovered_previous_release")
        elif phase == "candidate_starting":
            self.rollback(tx)
        elif phase == "restoring":
            self.restore_snapshot(tx)
        elif phase == "rollback_opening":
            self.finish_rollback(tx)
        elif phase == "opening":
            # The gateway may have accepted user writes. Never restore an older
            # snapshot automatically after this point.
            candidate = Path(tx["candidate"])
            self.compose(candidate, ["up", "-d", "--no-build", "--wait", "--wait-timeout", "120"], timeout=180)
            self.server_check(candidate, tx["before"]["serverId"])
            self.gateway_check(self.port, load_json(candidate / "release.json")["api_version"])
            self.install_self(candidate)
            self.transaction_path.unlink()
            self.record("updated", installed_pair=load_json(candidate / "release.json"), failed_pair=None)
        else:
            raise UpdateError("manual_recovery_required: " + phase)

    def promote(self, release: Path) -> dict:
        self.check_compose(release)
        previous, installed = self.current()
        before = self.probe(self.data, release)
        if not before["quiet"]:
            return self.record("busy", reasons=before["reasons"])
        original = self.gateway_check(self.port, installed["api_version"])
        if original["id"] != before.get("serverId"):
            raise UpdateError("live_probe_identity_mismatch")
        attempt = release.name + "-" + str(time.time_ns())
        tx = {"previous": str(previous), "candidate": str(release), "attempt": attempt,
              "snapshot": str(self.work / "snapshots" / attempt), "before": before}
        self.transaction(tx, "closing")
        try:
            # Close admission first, then recheck the worker/ledger. This catches
            # work admitted while the previous preflight request was in flight.
            self.compose(previous, ["stop", "bardic-web"], timeout=360)
            again = self.probe(self.data, release)
            if not again["quiet"]:
                self.compose(previous, ["up", "-d", "--no-build", "--wait", "--wait-timeout", "120"], timeout=180)
                self.transaction_path.unlink()
                return self.record("busy", reasons=again["reasons"])
            tx["before"] = again
            self.compose(previous, ["stop", "bardic-server"], timeout=360)
            self.transaction(tx, "stopped")
            self.ensure_stopped(previous)
            settled = self.probe(self.data, release, stopped=True)
            if not settled["quiet"]:
                raise UpdateError("work_did_not_settle_before_shutdown")
            tx["before"] = settled
            self.snapshot(previous, Path(tx["snapshot"]))
            self.transaction(tx, "snapshot_ready")
            self.transaction(tx, "candidate_starting")
            self.switch(release)
            self.compose(release, ["up", "-d", "--no-build", "--no-deps", "--wait", "--wait-timeout", "120", "bardic-server"], timeout=180)
            self.server_check(release, original["id"])
            if not self.safe_to_restore(settled, self.probe(self.data, release)):
                raise UpdateError("candidate_started_unexpected_work")
            self.transaction(tx, "opening")
            self.compose(release, ["up", "-d", "--no-build", "--wait", "--wait-timeout", "120"], timeout=180)
            if self.gateway_check(self.port, load_json(release / "release.json")["api_version"])["id"] != original["id"]:
                raise UpdateError("promoted_gateway_identity_changed")
            self.install_self(release)
            self.transaction_path.unlink()
            return self.record("updated", installed_pair=load_json(release / "release.json"), failed_pair=None,
                               snapshot=tx["snapshot"])
        except Exception:
            # recover() distinguishes a still-closed gateway from one which may
            # have accepted writes; it never blindly rewinds an opened service.
            self.recover()
            if tx["phase"] == "opening" and not self.transaction_path.exists():
                return self.state()
            raise

    def install_self(self, release: Path) -> None:
        source = release / "bardic-web/scripts/spark-update.py"
        if source.exists():
            atomic_text(self.work / "spark-update.py", source.read_text(), mode=0o700)

    def run(self, *, check_only=False, retry_failed=False) -> dict:
        if not check_only:
            self.recover()
        elif self.transaction_path.exists():
            return {"disposition": "recovery_pending"}
        _, installed = self.current()
        pair = self.fetch_pair()
        if same_pair(installed, pair):
            return self.record("unchanged", main_pair=pair)
        if not self.can_advance(installed, pair):
            return self.record("remote_behind_installation", main_pair=pair)
        failed = self.state().get("failed_pair")
        if failed and same_pair(failed, pair) and not retry_failed:
            return self.record("failed_pair_held", main_pair=pair)
        if check_only:
            return self.record("candidate", main_pair=pair)
        self.record("verifying", main_pair=pair)
        try:
            release = self.prepare(pair)
            self.validate(release)
            if not same_pair(self.fetch_pair(), pair):
                return self.record("main_changed_during_verification", main_pair=pair)
            return self.promote(release)
        except Exception as error:
            self.record("failed", failed_pair=pair, error=str(error))
            raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    choice = parser.add_mutually_exclusive_group()
    choice.add_argument("--check-only", action="store_true")
    choice.add_argument("--status", action="store_true")
    choice.add_argument("--retry-failed", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    try:
        updater = Updater(load_json(args.config))
        if args.status:
            _, installed = updater.current()
            print(json.dumps({"installed": installed, "status": updater.state(),
                              "transaction": load_json(updater.transaction_path, {})}))
            return 0
        lock = updater.work / "update.lock"
        with lock.open("a") as handle:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                print(json.dumps({"disposition": "already_running"}))
                return 0
            result = updater.run(check_only=args.check_only, retry_failed=args.retry_failed)
            print(json.dumps(result))
        return 0
    except Exception as error:
        print(json.dumps({"disposition": "failed", "error": str(error)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

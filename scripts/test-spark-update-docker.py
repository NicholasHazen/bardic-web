#!/usr/bin/env python3
"""Opt-in, disposable Docker validation/promotion/rollback test; no live deployment.

Run: python3 scripts/test-spark-update-docker.py --run \
    --server-context /private/tmp/bardic-server-spark-auto-update
Requires the existing bfb5aa8-38a3f3f server/web images and an explicit server
source checkout. Only tracked files and Docker operations files are copied.
Builds use the real verify targets and may take several minutes when uncached.
No browser, audio, credentials, paid provider, Git fetch, or systemd is used.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
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
import uuid
from unittest.mock import patch


sys.dont_write_bytecode = True
WEB = Path(__file__).resolve().parent.parent
TEMP_BASE = (Path("/private/tmp") if Path("/private/tmp").is_dir() else Path(tempfile.gettempdir())).resolve()
BASELINE_TAG = "bfb5aa8-38a3f3f"
BASELINE_API_VERSION = "0.5.0"
NODE_IMAGE = "node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1"
PRIVATE_MARKER = b"Original synthetic private updater key marker; never a provider credential.\n"
FAILURE_MARKER = b"Original synthetic candidate failure evidence; keep separately.\n"
OPS_OVERLAYS = (
    "Dockerfile", ".dockerignore", "scripts/spark-update.py", "scripts/test-spark-update.py",
    "scripts/install-spark-updater.sh", "deploy/quiet-check.mjs",
    "deploy/quiet-check.test.mjs", "deploy/systemd/bardic-update.service",
    "deploy/systemd/bardic-update.timer",
)

SPEC = importlib.util.spec_from_file_location("spark_update_docker_test", WEB / "scripts/spark-update.py")
UPDATE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(UPDATE)


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def fixture_pair(seed):
    return {name: hashlib.sha256((seed + name).encode()).hexdigest()[:40] for name in ("server", "web")}


def export_head(checkout, destination):
    """Copy tracked sources only; exclude every local library, key and build artifact."""
    result = subprocess.run(["git", "-C", str(checkout), "archive", "--format=tar", "HEAD"],
                            capture_output=True, check=True)
    destination.mkdir(mode=0o700)
    with tarfile.open(fileobj=io.BytesIO(result.stdout)) as archive:
        for member in archive:
            parts = Path(member.name).parts
            require(not member.name.startswith("/") and ".." not in parts
                    and (member.isfile() or member.isdir()), "Unsafe tracked archive member")
            target = destination.joinpath(*parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as source, target.open("xb") as output:
                    shutil.copyfileobj(source, output)
                target.chmod(member.mode & 0o777)


class RecordingRunner(UPDATE.Runner):
    def __init__(self, root, project):
        super().__init__()
        self.root = root
        self.project = project
        self.projects = {project}

    def run(self, args, **kwargs):
        if args[:2] == ["docker", "compose"]:
            project = args[args.index("--project-name") + 1]
            files = [Path(args[i + 1]).resolve() for i, arg in enumerate(args[:-1]) if arg in ("-f", "--env-file")]
            require(files and all(path.is_relative_to(self.root) for path in files),
                    "A Compose input escaped the disposable installation")
            require(project == self.project or re.fullmatch(r"bardic-check-[0-9a-f]{10}", project),
                    "Unexpected Compose project")
            self.projects.add(project)
        return super().run(args, **kwargs)


def docker_helper(runner, image, root, command, *, readonly=False, binary=False):
    require(root.parent == TEMP_BASE and root.name.startswith("bardic-update-docker-"), "Unsafe helper mount")
    args = ["docker", "run", "--rm", "--network", "none", "--read-only", "--user", "0:0",
            "--entrypoint", "/bin/sh", "--mount",
            f"type=bind,src={root},dst=/fixture" + (",readonly" if readonly else ""),
            image, "-ec", command]
    return runner.run(args, binary=binary).stdout


def image_file(runner, image, path):
    require(path in ("/srv/index.html", "/srv/sw.js"), "Unexpected image file")
    return runner.run(["docker", "run", "--rm", "--network", "none", "--read-only",
                       "--entrypoint", "/bin/sh", image, "-ec", "cat " + path], binary=True).stdout


def marker(runner, image, root, directory, name):
    relative = directory.relative_to(root)
    require(name in ("synthetic-private-key.marker", "synthetic-failure.marker"), "Unexpected marker")
    return docker_helper(runner, image, root,
                         f'test "$(stat -c %a "/fixture/{relative}")" = 700 '
                         f'&& test "$(stat -c %a "/fixture/{relative}/{name}")" = 600 '
                         f'&& cat "/fixture/{relative}/{name}"', readonly=True, binary=True)


def release(root, pair, web_source, server_source, version, *, baseline=False):
    name = "baseline-" + root.name.removeprefix("bardic-update-docker-") if baseline else UPDATE.release_id(pair)
    destination = root / "releases" / name
    destination.mkdir(mode=0o700)
    shutil.copytree(web_source, destination / "bardic-web")
    shutil.copytree(server_source, destination / "bardic-server")
    tag = BASELINE_TAG if baseline else name
    UPDATE.atomic_json(destination / "release.json", {
        "version": 1, "id": name, **pair, "tag": tag, "api_version": version,
        "node_image": NODE_IMAGE, "source": "original-synthetic-docker-test", "verified": baseline,
    })
    UPDATE.atomic_text(destination / "release.env", f"BARDIC_IMAGE_TAG={tag}\nBARDIC_SERVER_CONTEXT=../bardic-server\n")
    return destination


def cleanup(runner, root, baseline, updater, images):
    errors = []
    runner.log = None
    try:
        updater.compose(baseline, ["down", "--remove-orphans", "--timeout", "300"], timeout=360)
    except Exception as error:
        errors.append(str(error))
    # Also cover a validation failure before its own finally completed. Only
    # exact project labels recorded with inputs beneath this root are considered.
    for project in runner.projects:
        for kind, list_args, remove_args in (
            ("container", ["ps", "-aq"], ["rm", "--force"]),
            ("network", ["network", "ls", "-q"], ["network", "rm"]),
        ):
            try:
                ids = runner.run(["docker", *list_args, "--filter", "label=com.docker.compose.project=" + project]).stdout.split()
                if ids:
                    runner.run(["docker", *remove_args, *ids])
            except Exception as error:
                errors.append(f"{project} {kind}: {error}")
    if errors:
        raise RuntimeError("Disposable containers could not be removed; retained root " + str(root) + ": " + "; ".join(errors))
    # Root helper sees only this generated fixture. Never prune Docker resources
    # or remove baseline images, host directories, or any live installation.
    docker_helper(runner, "bardic-server:" + BASELINE_TAG, root,
                  "rm -rf /fixture/data /fixture/updater/snapshots /fixture/updater/smoke-*")
    shutil.rmtree(root)
    for image in sorted(images):
        runner.run(["docker", "image", "rm", image], check=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true", help="explicitly enable disposable Docker builds and containers")
    parser.add_argument("--server-context", type=Path, required=True, help="read-only server source checkout for the paired build")
    args = parser.parse_args()
    if not args.run:
        parser.error("No Docker action performed. Pass --run to opt in.")
    os.umask(0o077)
    server = args.server_context.resolve(strict=True)
    require((server / "Dockerfile").is_file() and (server / "crates/bardic-server/migrations").is_dir()
            and (server / "docs/contract/openapi.yaml").is_file(), "Server context is missing packaging, migrations or contract")
    root = Path(tempfile.mkdtemp(prefix="bardic-update-docker-", dir=TEMP_BASE)).resolve()
    project = "bardic-update-docker-" + uuid.uuid4().hex[:12]
    runner = RecordingRunner(root, project)
    images = set()
    baseline = updater = None
    baseline_ids = {}
    try:
        for name in ("server", "web"):
            image = "bardic-" + name + ":" + BASELINE_TAG
            baseline_ids[image] = runner.run(["docker", "image", "inspect", "--format", "{{.Id}}", image]).stdout.strip()
        (root / "updater").mkdir(mode=0o700)
        (root / "releases").mkdir(mode=0o700)
        sources = root / "sources"
        sources.mkdir(mode=0o700)
        web_source, server_source = sources / "bardic-web", sources / "bardic-server"
        export_head(WEB, web_source)
        export_head(server, server_source)
        for relative in OPS_OVERLAYS:
            target = web_source / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(WEB / relative, target)
        for relative in ("Dockerfile", ".dockerignore"):
            shutil.copyfile(server / relative, server_source / relative)
        require((web_source / "contract/openapi.yaml").read_bytes()
                == (server_source / "docs/contract/openapi.yaml").read_bytes(), "Fixture contracts disagree")
        version = UPDATE.contract_version(web_source / "contract/openapi.yaml")
        baseline = release(root, fixture_pair(root.name + "baseline"), web_source, server_source, BASELINE_API_VERSION, baseline=True)
        candidate = release(root, fixture_pair(root.name + "candidate"), web_source, server_source, version)
        rejected = release(root, fixture_pair(root.name + "rejected"), web_source, server_source, version)
        for path in (candidate, rejected):
            tag = UPDATE.load_json(path / "release.json")["tag"]
            for name in ("server", "web", "server-verify", "web-verify"):
                image = "bardic-" + name + ":" + tag
                require(runner.run(["docker", "image", "inspect", image], check=False).returncode != 0,
                        "Generated fixture image tag already exists")
                images.add(image)
            images.add("bardic-web:" + tag + "-fresh")
        (root / "current").symlink_to(baseline.relative_to(root))
        data = root / "data"
        data.mkdir(mode=0o700)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        env = f"BARDIC_DATA_DIR={data}\nBARDIC_BIND_ADDRESS=127.0.0.1\nBARDIC_HTTP_PORT={port}\nBARDIC_IMAGE_TAG={BASELINE_TAG}\n"
        # An internal-only network suppresses published gateway ports on recent
        # Docker. Only the fixed Caddy gateway joins ingress; the server has no
        # external route and no provider is configured or called in this test.
        override = json.dumps({"networks": {"default": {"internal": True}, "ingress": {}}, "services": {
            "bardic-server": {"networks": ["default"], "environment": {
                "BARDIC_SERVER_NAME": "Original synthetic updater installation"}},
            "bardic-web": {"networks": ["default", "ingress"]}}}) + "\n"
        (root / ".env").write_text(env)
        (root / "compose.host.yaml").write_text(override)
        config = {"version": 1, "root": str(root), "project_name": project, "node_image": NODE_IMAGE,
                  "baseline": {name: UPDATE.load_json(baseline / "release.json")[name] for name in ("server", "web")},
                  "web_repo": "https://github.com/Synthetic/bardic-web.git",
                  "server_repo": "https://github.com/Synthetic/bardic-server.git"}
        UPDATE.atomic_json(root / "updater/config.json", config)
        shutil.copyfile(WEB / "deploy/quiet-check.mjs", root / "updater/quiet-check.mjs")
        (root / "updater/private-marker").write_bytes(PRIVATE_MARKER)
        (root / "updater/failure-marker").write_bytes(FAILURE_MARKER)
        docker_helper(runner, "bardic-server:" + BASELINE_TAG, root,
                      "chown 10001:10001 /fixture/data && chmod 700 /fixture/data "
                      "&& cp /fixture/updater/private-marker /fixture/data/synthetic-private-key.marker "
                      "&& chown 10001:10001 /fixture/data/synthetic-private-key.marker "
                      "&& chmod 600 /fixture/data/synthetic-private-key.marker")
        updater = UPDATE.Updater(config, runner)
        real_probe = updater.probe

        def report_probe_block(directory, path, **options):
            facts = real_probe(directory, path, **options)
            if facts.get("quiet") is not True:
                # Fixed diagnostic schema only, never book/config/marker values.
                print("Synthetic quiescence block: " + json.dumps({
                    key: facts.get(key) for key in ("quiet", "reasons", "schemaVersion", "counts", "usageCount")
                }), flush=True)
            return facts

        updater.probe = report_probe_block
        updater.check_compose(baseline)
        updater.compose(baseline, ["up", "-d", "--no-build", "--wait", "--wait-timeout", "120"], timeout=180)
        base = f"http://127.0.0.1:{port}"
        original = updater.gateway_check(port, BASELINE_API_VERSION)
        expected_current = {"id": original["id"], "api_version": version}
        require(json.loads(updater.get(base + "/api/listeners"))["items"] == [], "Baseline fixture was not empty")
        listener = json.loads(updater.get(base + "/api/listeners", method="POST", expected=201,
                                         body={"name": "Original synthetic updater listener"}, headers={
                                             "Origin": base, "Content-Type": "application/json",
                                             "X-Bardic-Device": "original-synthetic-updater-test"}))
        old_html = updater.get(base + "/").decode()
        old_assets = {path: updater.get(base + path) for path in set(re.findall(r'["\'](/assets/[^"\']+)["\']', old_html))}
        require(old_assets, "Baseline has no hashed assets")
        facts = updater.probe(data, baseline)
        require(facts["quiet"] and facts["usageCount"] == 0 and facts["serverId"] == original["id"], "Baseline is not quiet")
        print("Baseline synthetic listener, private marker and read-only probe ready.", flush=True)

        updater.validate(candidate)
        manifest = UPDATE.load_json(candidate / "release.json")
        require(manifest["verified"] and manifest["retained_assets_from"] == baseline.name
                and manifest["retained_asset_count"] > 0, "Old hashed assets were not retained")
        image = "bardic-web:" + manifest["tag"]
        fresh_html, fresh_sw = (image_file(runner, image + "-fresh", path) for path in ("/srv/index.html", "/srv/sw.js"))
        result = updater.promote(candidate)
        require(result["disposition"] == "updated" and updater.current()[0] == candidate, "Healthy promotion failed")
        require(updater.gateway_check(port, version) == expected_current, "Promotion changed identity or has the wrong API version")
        require(json.loads(updater.get(base + "/api/listeners"))["items"] == [listener], "Promotion lost the listener")
        require(marker(runner, "bardic-server:" + manifest["tag"], root, data, "synthetic-private-key.marker") == PRIVATE_MARKER,
                "Promotion lost the private marker")
        snapshot = Path(result["snapshot"]) / "data"
        require(snapshot.is_relative_to(root / "updater/snapshots"), "Snapshot escaped the fixture")
        require(marker(runner, "bardic-server:" + manifest["tag"], root, snapshot, "synthetic-private-key.marker") == PRIVATE_MARKER,
                "Stopped snapshot lost the private marker")
        require(updater.probe(snapshot, candidate, stopped=True)["serverId"] == original["id"], "Snapshot lost identity")
        require(updater.get(base + "/") == fresh_html and updater.get(base + "/sw.js") == fresh_sw,
                "Retaining old assets replaced current index/SW")
        require(all(updater.get(base + path) == content for path, content in old_assets.items()), "Old asset bytes changed")
        print("Actual verify/build/synthetic smoke and healthy promotion passed; old assets, fresh shell and full private snapshot checked.", flush=True)

        updater.validate(rejected)
        original_check = updater.server_check
        forced = False

        def fail_before_opening(path, expected_id):
            nonlocal forced
            checked = original_check(path, expected_id)
            if path == rejected and not forced:
                require(not updater.compose(path, ["ps", "--status", "running", "-q", "bardic-web"]).stdout.strip(),
                        "Gateway opened before injected failure")
                docker_helper(runner, "bardic-server:" + manifest["tag"], root,
                              "cp /fixture/updater/failure-marker /fixture/data/synthetic-failure.marker "
                              "&& chmod 600 /fixture/data/synthetic-failure.marker")
                forced = True
                raise UPDATE.UpdateError("original_synthetic_preopening_server_check_failure")
            return checked

        with patch.object(updater, "server_check", side_effect=fail_before_opening):
            try:
                updater.promote(rejected)
            except UPDATE.UpdateError as error:
                require(str(error) == "original_synthetic_preopening_server_check_failure", "Unexpected rollback trigger")
            else:
                raise AssertionError("Injected failure did not reject promotion")
        state = updater.state()
        require(forced and state["disposition"] == "rolled_back" and updater.current()[0] == candidate
                and not updater.transaction_path.exists(), "Rollback did not restore the previous release")
        failed_data = Path(state["recovery_data"])
        require(failed_data.is_relative_to(root / "updater/snapshots") and failed_data.name.endswith("-failed-data"),
                "Failed candidate data escaped the fixture")
        require(marker(runner, "bardic-server:" + manifest["tag"], root, failed_data, "synthetic-failure.marker") == FAILURE_MARKER,
                "Failed candidate evidence was discarded")
        require(marker(runner, "bardic-server:" + manifest["tag"], root, failed_data, "synthetic-private-key.marker") == PRIVATE_MARKER,
                "Failed candidate private data was discarded")
        docker_helper(runner, "bardic-server:" + manifest["tag"], root, "test ! -e /fixture/data/synthetic-failure.marker", readonly=True)
        require(marker(runner, "bardic-server:" + manifest["tag"], root, data, "synthetic-private-key.marker") == PRIVATE_MARKER,
                "Rollback lost the private marker")
        require(updater.gateway_check(port, version) == expected_current
                and json.loads(updater.get(base + "/api/listeners"))["items"] == [listener], "Rollback lost identity/listener")
        require(updater.probe(data, candidate)["usageCount"] == 0, "Unexpected provider usage")
        require((root / ".env").read_text() == env and (root / "compose.host.yaml").read_text() == override,
                "Host settings changed")
        print("Forced closed-gateway failure rolled back safely; previous identity/listener/key marker and separate failed data retained.", flush=True)
    except Exception:
        # Synthetic metadata only: never dump a database, private marker or
        # container environment. Keep a bounded clue before disposing fixtures.
        if updater is not None and baseline is not None:
            try:
                print("Disposable service state: " + updater.compose(baseline, ["ps", "--format", "json"]).stdout, file=sys.stderr)
                ids = updater.compose(baseline, ["ps", "-q", "bardic-web"]).stdout.split()
                for container in ids:
                    ports = runner.run(["docker", "inspect", "--format", "{{json .NetworkSettings.Ports}}", container]).stdout.strip()
                    print("Disposable gateway port bindings: " + ports, file=sys.stderr)
                for candidate_log in root.glob("releases/*/verification.log"):
                    print("Disposable verification tail: " + "\n".join(candidate_log.read_text().splitlines()[-25:]), file=sys.stderr)
            except Exception as error:
                print("Disposable diagnostics unavailable: " + str(error), file=sys.stderr)
        raise
    finally:
        if baseline is not None and updater is not None:
            cleanup(runner, root, baseline, updater, images)
        else:
            # Before the first Compose start, sources are owned by this process.
            # A helper may already have changed data ownership, so remove only
            # this generated root's fixture directories using the baseline image.
            try:
                if (root / "data").exists():
                    docker_helper(runner, "bardic-server:" + BASELINE_TAG, root, "rm -rf /fixture/data /fixture/updater/snapshots")
                shutil.rmtree(root)
            except Exception:
                print("Retained disposable root for cleanup: " + str(root), file=sys.stderr)
        for image, identity in baseline_ids.items():
            require(runner.run(["docker", "image", "inspect", "--format", "{{.Id}}", image]).stdout.strip() == identity,
                    "A baseline image was altered")
    print("PASS: disposable Docker validation, promotion and rollback; baseline images unchanged and generated resources removed.")


if __name__ == "__main__":
    main()

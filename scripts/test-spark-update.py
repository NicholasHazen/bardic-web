#!/usr/bin/env python3
"""Updater boundaries exercised with disposable files and entirely fake commands."""
from __future__ import annotations

import copy
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("spark_update", Path(__file__).with_name("spark-update.py"))
UPDATE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(UPDATE)

OLD = {"server": "a" * 40, "web": "b" * 40}
NEW = {"server": "c" * 40, "web": "d" * 40}
LATER = {"server": "e" * 40, "web": "f" * 40}
SERVER_ID = "original-synthetic-server"
KEY_BYTES = b"original synthetic provider key retained privately\n"
SAMPLE_PROBE = "api/voices/00000000000000000000000000/sample"


class FakeRunner:
    """No subprocess can escape a test; capture command inputs and ephemeral files."""
    def __init__(self, respond=None):
        self.calls = []
        self.log = None
        self.respond = respond

    def run(self, args, *, cwd=None, timeout=1800, check=True, binary=False):
        files = {}
        for i, arg in enumerate(args[:-1]):
            if arg in ("--env-file", "-f") and Path(args[i + 1]).is_file():
                files[args[i + 1]] = Path(args[i + 1]).read_text()
        self.calls.append({"args": list(args), "cwd": cwd, "timeout": timeout,
                           "check": check, "binary": binary, "files": files})
        value = self.respond(args, binary) if self.respond else None
        result = value or subprocess.CompletedProcess(args, 0, b"" if binary else "", b"" if binary else "")
        if check and result.returncode:
            raise UPDATE.UpdateError("synthetic_command_failed")
        return result


def write_release(root, pair, version="0.5.0", verified=True):
    path = root / "releases" / UPDATE.release_id(pair)
    path.mkdir(parents=True, exist_ok=True)
    manifest = {"version": 1, "id": path.name, **pair, "tag": path.name,
                "api_version": version, "verified": verified}
    UPDATE.atomic_json(path / "release.json", manifest)
    (path / "release.env").write_text(f"BARDIC_IMAGE_TAG={path.name}\nBARDIC_SERVER_CONTEXT=../bardic-server\n")
    web = path / "bardic-web"
    (web / "deploy").mkdir(parents=True, exist_ok=True)
    (web / "compose.yaml").write_text("services: {}\n")
    (web / "deploy/quiet-check.mjs").write_text("// original synthetic probe\n")
    return path


class Fixture(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="bardic-updater-unit-")
        self.addCleanup(self.temporary.cleanup)
        # macOS exposes the temp directory through /var -> /private/var. Use
        # one canonical spelling so filesystem identity assertions stay real.
        self.root = Path(self.temporary.name).resolve() / "installation"
        self.root.mkdir(mode=0o700)
        (self.root / "updater").mkdir(mode=0o700)
        self.data = self.root / "data"
        self.data.mkdir(mode=0o700)
        (self.data / "bardic.db").write_bytes(KEY_BYTES)
        (self.data / "audio").mkdir()
        (self.data / "audio/original-synthetic.wav").write_bytes(b"synthetic immutable audio")
        self.env_bytes = (f"BARDIC_DATA_DIR={self.data}\nBARDIC_BIND_ADDRESS=127.0.0.1\n"
                          "BARDIC_HTTP_PORT=18080\nBARDIC_IMAGE_TAG=host-default\n").encode()
        (self.root / ".env").write_bytes(self.env_bytes)
        (self.root / "compose.host.yaml").write_text("services: {}\n")
        self.previous = write_release(self.root, OLD)
        self.candidate = write_release(self.root, NEW)
        (self.root / "current").symlink_to(self.previous.relative_to(self.root))
        self.config = {"root": str(self.root), "node_image": "node:24-alpine@sha256:" + "0" * 64,
                       "server_repo": "https://github.com/Synthetic/bardic-server.git",
                       "web_repo": "https://github.com/Synthetic/bardic-web.git"}

    def updater(self, runner=None):
        return UPDATE.Updater(self.config, runner or FakeRunner())

    def fleet(self):
        return FakeFleet(self.config)

    def resolved_compose(self):
        tag = self.candidate.name
        return {"services": {
            "bardic-server": {"image": "bardic-server:" + tag,
                              "volumes": [{"type": "bind", "source": str(self.data), "target": "/data"}]},
            "bardic-web": {"image": "bardic-web:" + tag,
                           "ports": [{"host_ip": "127.0.0.1", "published": "18080", "target": 8080, "protocol": "tcp"}]}}}


class FakeFleet(UPDATE.Updater):
    """Run real promotion/recovery orchestration against a tiny filesystem fleet."""
    def __init__(self, config):
        super().__init__(config, FakeRunner())
        self.events = []
        self.probes = []
        self.failures = {}
        self.next_pairs = []
        self.next_pair = copy.deepcopy(NEW)
        self.advance = True
        self.gateway_open = True
        self.server_open = True
        self.stop_confirmed = False
        self.running_results = []
        self.probe_calls = []
        self.compose_calls = []
        self.user_write_on_open = False

    def fail(self, event):
        errors = self.failures.get(event, [])
        if errors:
            raise errors.pop(0)

    def fetch_pair(self):
        self.events.append("fetch")
        return copy.deepcopy(self.next_pairs.pop(0) if self.next_pairs else self.next_pair)

    def can_advance(self, installed, candidate):
        self.events.append("ancestry")
        return self.advance

    def prepare(self, pair):
        self.events.append("prepare")
        self.fail("prepare")
        return write_release(self.root, pair)

    def validate(self, release):
        self.events.append("validate")
        self.fail("validate")

    def check_compose(self, release):
        # Real resolved-config refusal is tested separately below.
        pass

    def probe(self, data, release, *, stopped=False):
        self.probe_calls.append({"data": data, "release": release, "stopped": stopped,
                                 "events_before": list(self.events)})
        if stopped and (self.server_open or not self.stop_confirmed):
            raise AssertionError("stopped probes require a confirmed stopped container")
        self.events.append("probe")
        if self.probes:
            value = self.probes.pop(0)
            if isinstance(value, BaseException):
                raise value
            return copy.deepcopy(value)
        return {"quiet": True, "reasons": [], "serverId": SERVER_ID, "usageCount": 7}

    def gateway_check(self, port, version, *, synthetic=False):
        self.events.append("gateway_check")
        self.fail("gateway_check")
        return {"id": SERVER_ID, "api_version": version}

    def server_check(self, release, expected_id):
        self.events.append("server_check")
        self.fail("server_check")
        return {"id": expected_id, "api_version": UPDATE.load_json(release / "release.json")["api_version"]}

    def compose(self, release, args, **kwargs):
        self.compose_calls.append({"release": release, "args": list(args)})
        role = "old" if release.name == UPDATE.release_id(OLD) else "candidate"
        action = args[0]
        if action == "stop":
            action += ":" + (args[1] if len(args) > 1 else "all")
        elif action == "up":
            action += ":" + ("server" if "--no-deps" in args else "all")
        event = role + ":" + action
        self.events.append(event)
        self.fail(event)
        if action == "ps" and "--status" in args and args[args.index("--status") + 1] == "running":
            result = self.running_results.pop(0) if self.running_results else ("original-synthetic-container\n" if self.server_open else "")
            if isinstance(result, BaseException):
                raise result
            self.stop_confirmed = not result.strip()
            return subprocess.CompletedProcess(args, 0, result, "")
        if action.startswith("stop"):
            if action != "stop:bardic-server":
                self.gateway_open = False
            if action != "stop:bardic-web":
                self.server_open = False
                self.stop_confirmed = False
        if action.startswith("up"):
            self.server_open = True
            self.stop_confirmed = False
            if action == "up:all":
                self.gateway_open = True
            if role == "candidate":
                (self.data / "candidate-migration").write_text("original synthetic migration state")
                if self.user_write_on_open and action == "up:all":
                    (self.data / "accepted-user-write").write_text("original synthetic user place")
        self.fail(event + ":after")
        return subprocess.CompletedProcess(args, 0, "", "")

    def snapshot(self, previous, destination):
        self.events.append("snapshot")
        if self.server_open or not self.stop_confirmed or not self.probe_calls[-1]["stopped"]:
            raise AssertionError("snapshot requires stopped, confirmed, successfully probed data")
        self.fail("snapshot")
        destination.mkdir(parents=True, mode=0o700)
        shutil.copytree(self.data, destination / "data")

    def install_self(self, release):
        self.events.append("install_self")


class RevisionTests(Fixture):
    def test_check_only_candidate_does_not_build_or_close_live_gateway(self):
        updater = self.fleet()
        self.assertEqual(updater.run(check_only=True)["disposition"], "candidate")
        self.assertEqual(updater.events, ["fetch", "ancestry"])
        self.assertEqual(updater.current()[0], self.previous)
        self.assertFalse(updater.transaction_path.exists())

    def test_both_repositories_must_be_ancestors_of_candidate(self):
        runner = FakeRunner()
        self.assertTrue(self.updater(runner).can_advance(OLD, NEW))
        self.assertEqual([c["args"][-2:] for c in runner.calls], [[OLD["server"], NEW["server"]], [OLD["web"], NEW["web"]]])
        self.assertTrue(all("--is-ancestor" in c["args"] and not c["check"] for c in runner.calls))

    def test_downgrade_rebase_and_unknown_ancestor_all_refuse(self):
        for repo, code in (("server", 1), ("web", 1), ("server", 128)):
            with self.subTest(repo=repo, code=code):
                def respond(args, binary):
                    failed = args[1].endswith(repo + ".git")
                    return subprocess.CompletedProcess(args, code if failed else 0, "", "")
                self.assertFalse(self.updater(FakeRunner(respond)).can_advance(OLD, NEW))

    def test_remote_behind_never_builds_or_touches_live_services(self):
        updater = self.fleet()
        updater.advance = False
        self.assertEqual(updater.run()["disposition"], "remote_behind_installation")
        self.assertEqual(updater.events, ["fetch", "ancestry"])
        self.assertEqual(updater.current()[0], self.previous)

    def test_fetch_is_fixed_main_and_rejects_non_commit_output(self):
        def respond(args, binary):
            if "rev-parse" in args:
                return subprocess.CompletedProcess(args, 0, "not-a-commit\n", "")
            return subprocess.CompletedProcess(args, 0, "", "")
        runner = FakeRunner(respond)
        with self.assertRaisesRegex(UPDATE.UpdateError, "invalid_main_commit"):
            self.updater(runner).fetch_pair()
        self.assertTrue(any("+refs/heads/main:refs/heads/main" in c["args"] for c in runner.calls))

    def test_non_github_repository_is_refused_before_any_command(self):
        self.config["server_repo"] = "file:///some-other-library"
        runner = FakeRunner()
        with self.assertRaisesRegex(UPDATE.UpdateError, "public_github_https"):
            self.updater(runner).fetch_pair()
        self.assertEqual(runner.calls, [])


class ContractTests(Fixture):
    def test_interrupted_atomic_json_keeps_last_complete_private_record(self):
        path = self.root / "updater/state.json"
        UPDATE.atomic_json(path, {"original": "complete"})
        original = path.read_bytes()
        with patch.object(UPDATE.os, "replace", side_effect=OSError("synthetic disk failure")):
            with self.assertRaisesRegex(OSError, "synthetic disk failure"):
                UPDATE.atomic_json(path, {"candidate": "complete"})
        self.assertEqual(path.read_bytes(), original)
        self.assertEqual(path.with_name("state.json.tmp").stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.updater().current()[0], self.previous)

    def prepare_with(self, server_contract, web_contract, docker="FROM source AS verify\n"):
        updater = self.updater()
        def export(name, sha, target):
            target.mkdir(parents=True)
            (target / "Dockerfile").write_text(docker)
            if name == "server":
                (target / "docs/contract").mkdir(parents=True)
                (target / "docs/contract/openapi.yaml").write_text(server_contract)
            else:
                (target / "contract").mkdir()
                (target / "contract/openapi.yaml").write_text(web_contract)
                (target / "compose.yaml").write_text("services: {}\n")
                (target / "deploy").mkdir()
                (target / "deploy/quiet-check.mjs").write_text("// synthetic probe\n")
        updater.export = export
        return updater.prepare(LATER)

    def test_matching_contracts_prepare_one_immutable_pair_without_switching(self):
        text = "openapi: 3.1.0\ninfo:\n  title: Synthetic\n  version: '0.5.1'\npaths: {}\n"
        path = self.prepare_with(text, text)
        manifest = UPDATE.load_json(path / "release.json")
        self.assertEqual({k: manifest[k] for k in ("server", "web")}, LATER)
        self.assertEqual(manifest["api_version"], "0.5.1")
        self.assertFalse(manifest["verified"])
        self.assertEqual((path / "release.env").read_text(), f"BARDIC_IMAGE_TAG={path.name}\nBARDIC_SERVER_CONTEXT=../bardic-server\n")
        self.assertEqual((path / "release.env").stat().st_mode & 0o777, 0o600)
        self.assertEqual((self.root / ".env").read_bytes(), self.env_bytes)
        self.assertEqual(self.updater().current()[0], self.previous)

    def test_release_env_rewrite_keeps_complete_old_selection_until_atomic_replace(self):
        contract = "info:\n  version: 0.5.1\n"
        release = self.prepare_with(contract, contract)
        environment = release / "release.env"
        old = "BARDIC_IMAGE_TAG=previous-complete-selection\nBARDIC_SERVER_CONTEXT=../bardic-server\n"
        expected = f"BARDIC_IMAGE_TAG={release.name}\nBARDIC_SERVER_CONTEXT=../bardic-server\n"
        environment.write_text(old)
        original_replace = UPDATE.os.replace
        observed = []

        def replace(source, target, *, interrupt):
            if Path(target) == environment:
                # Compose sees a complete existing selection up to the rename;
                # the replacement is already complete and private beforehand.
                self.assertEqual(environment.read_text(), old)
                self.assertNotEqual(Path(source), environment)
                self.assertEqual(Path(source).read_text(), expected)
                self.assertEqual(Path(source).stat().st_mode & 0o777, 0o600)
                observed.append(interrupt)
                if interrupt:
                    raise OSError("synthetic release selection interruption")
            return original_replace(source, target)

        with patch.object(UPDATE.os, "replace", side_effect=lambda source, target: replace(source, target, interrupt=True)):
            with self.assertRaisesRegex(OSError, "synthetic release selection interruption"):
                self.updater().prepare(LATER)
        self.assertEqual(environment.read_text(), old)
        self.assertEqual(self.updater().current()[0], self.previous)
        with patch.object(UPDATE.os, "replace", side_effect=lambda source, target: replace(source, target, interrupt=False)):
            self.updater().prepare(LATER)
        self.assertEqual(observed, [True, False])
        self.assertEqual(environment.read_text(), expected)
        self.assertEqual(environment.stat().st_mode & 0o777, 0o600)
        self.assertEqual((self.root / ".env").read_bytes(), self.env_bytes)
        self.assertEqual(self.updater().current()[0], self.previous)

    def test_same_version_but_different_contract_bytes_is_refused(self):
        text = "info:\n  version: 0.5.1\n"
        with self.assertRaisesRegex(UPDATE.UpdateError, "contracts_do_not_match"):
            self.prepare_with(text, text + "# a different endpoint definition\n")

    def test_missing_verify_gate_is_refused(self):
        text = "info:\n  version: 0.5.1\n"
        with self.assertRaisesRegex(UPDATE.UpdateError, "missing_verify_target"):
            self.prepare_with(text, text, "FROM source AS build\n")

    def test_missing_contract_version_does_not_guess(self):
        with self.assertRaisesRegex(UPDATE.UpdateError, "contract_version_missing"):
            self.prepare_with("info:\n  title: Synthetic\n", "info:\n  title: Synthetic\n")

    def test_atomic_pointer_keeps_the_host_configuration_outside_release(self):
        updater = self.updater()
        original_replace = UPDATE.os.replace
        observed = []
        def replace(source, target):
            if Path(target) == self.root / "current":
                self.assertEqual(updater.current()[0], self.previous)
                self.assertTrue(Path(source).is_symlink())
                observed.append(Path(source).resolve())
            return original_replace(source, target)
        with patch.object(UPDATE.os, "replace", side_effect=replace):
            updater.switch(self.candidate)
        self.assertEqual(observed, [self.candidate])
        self.assertEqual(updater.current()[0], self.candidate)
        self.assertEqual((self.root / ".env").read_bytes(), self.env_bytes)
        self.assertEqual(list(self.root.glob(".current-*")), [])


class PromotionTests(Fixture):
    def test_stopped_probe_follows_confirmed_stop_and_candidate_running_probe_stays_live(self):
        updater = self.fleet()
        self.assertEqual(updater.promote(self.candidate)["disposition"], "updated")
        self.assertEqual([call["stopped"] for call in updater.probe_calls], [False, False, True, False])
        closed = updater.probe_calls[2]["events_before"]
        self.assertLess(closed.index("old:stop:bardic-server"), closed.index("old:ps"))
        running = updater.probe_calls[3]["events_before"]
        self.assertIn("candidate:up:server", running)
        self.assertIn("server_check", running)
        confirmed = [call["args"] for call in updater.compose_calls if call["args"][0] == "ps"]
        self.assertEqual(confirmed, [["ps", "--status", "running", "-q", "bardic-server"]])

    def test_stop_without_empty_running_confirmation_never_probes_stopped_or_snapshots(self):
        for result, expected in (("original-synthetic-container-still-running\n", "server_still_running"),
                                 (UPDATE.UpdateError("cannot_confirm_stop"), "cannot_confirm_stop")):
            with self.subTest(expected=expected):
                updater = self.fleet()
                updater.running_results = [result]
                with self.assertRaisesRegex(UPDATE.UpdateError, expected):
                    updater.promote(self.candidate)
                self.assertEqual([call["stopped"] for call in updater.probe_calls], [False, False])
                self.assertNotIn("snapshot", updater.events)
                self.assertNotIn("candidate:up:server", updater.events)
                self.assertEqual(updater.current()[0], self.previous)
                self.assertEqual((self.data / "bardic.db").read_bytes(), KEY_BYTES)
                self.assertTrue(updater.server_open and updater.gateway_open)
                self.assertFalse(updater.transaction_path.exists())

    def test_rollback_stopped_probes_follow_candidate_confirmation(self):
        updater = self.fleet()
        updater.failures["server_check"] = [UPDATE.UpdateError("original synthetic candidate failure")]
        with self.assertRaisesRegex(UPDATE.UpdateError, "candidate failure"):
            updater.promote(self.candidate)
        self.assertEqual([call["stopped"] for call in updater.probe_calls], [False, False, True, True, True])
        after_stop, after_restore = updater.probe_calls[-2:]
        self.assertLess(after_stop["events_before"].index("candidate:stop:all"),
                        after_stop["events_before"].index("candidate:ps"))
        self.assertEqual(after_stop["release"], self.candidate)
        self.assertEqual(after_restore["release"], self.previous)
        self.assertEqual(after_restore["events_before"].count("candidate:ps"), 2)
        self.assertEqual((self.data / "bardic.db").read_bytes(), KEY_BYTES)

    def test_rollback_refuses_rename_when_candidate_stop_is_not_confirmed(self):
        updater = self.fleet()
        updater.running_results = ["", "original-synthetic-candidate-still-running\n"]
        updater.failures["server_check"] = [UPDATE.UpdateError("original synthetic candidate failure")]
        with self.assertRaisesRegex(UPDATE.UpdateError, "server_still_running"):
            updater.promote(self.candidate)
        self.assertEqual([call["stopped"] for call in updater.probe_calls], [False, False, True])
        self.assertEqual(updater.current()[0], self.candidate)
        self.assertTrue((self.data / "candidate-migration").exists())
        self.assertEqual((self.data / "bardic.db").read_bytes(), KEY_BYTES)
        self.assertEqual(UPDATE.load_json(updater.transaction_path)["phase"], "candidate_starting")
        self.assertFalse(list((updater.work / "snapshots").glob("*-failed-data")))
        self.assertFalse(updater.gateway_open)

    def test_busy_preflight_does_not_close_the_gateway(self):
        updater = self.fleet()
        updater.probes = [{"quiet": False, "reasons": ["synthetic_job"]}]
        self.assertEqual(updater.promote(self.candidate)["disposition"], "busy")
        self.assertEqual(updater.events, ["probe"])
        self.assertTrue(updater.gateway_open)
        self.assertFalse(updater.transaction_path.exists())

    def test_new_work_after_gateway_close_reopens_previous_without_snapshot(self):
        updater = self.fleet()
        updater.probes = [updater.probe(self.data, self.candidate), {"quiet": False, "reasons": ["synthetic_pending_sample"]}]
        updater.events.clear()
        self.assertEqual(updater.promote(self.candidate)["disposition"], "busy")
        self.assertEqual(updater.events, ["probe", "gateway_check", "old:stop:bardic-web", "probe", "old:up:all"])
        self.assertEqual(updater.current()[0], self.previous)
        self.assertTrue(updater.server_open and updater.gateway_open)
        self.assertFalse(updater.transaction_path.exists())

    def test_stop_and_snapshot_failures_resume_the_previous_stack(self):
        for event in ("old:stop:bardic-web", "old:stop:bardic-server", "snapshot"):
            with self.subTest(event=event):
                updater = self.fleet()
                updater.failures[event] = [UPDATE.UpdateError("synthetic failure")]
                with self.assertRaisesRegex(UPDATE.UpdateError, "synthetic failure"):
                    updater.promote(self.candidate)
                self.assertEqual(updater.current()[0], self.previous)
                self.assertTrue(updater.gateway_open and updater.server_open)
                self.assertFalse(updater.transaction_path.exists())
                self.assertEqual((self.data / "bardic.db").read_bytes(), KEY_BYTES)

    def test_closed_gateway_failure_restores_keys_and_retains_failed_candidate_data(self):
        updater = self.fleet()
        updater.failures["server_check"] = [UPDATE.UpdateError("candidate image refused")]
        with self.assertRaisesRegex(UPDATE.UpdateError, "candidate image refused"):
            updater.promote(self.candidate)
        self.assertEqual(updater.current()[0], self.previous)
        self.assertEqual((self.data / "bardic.db").read_bytes(), KEY_BYTES)
        self.assertFalse((self.data / "candidate-migration").exists())
        failed = Path(updater.state()["recovery_data"])
        self.assertTrue((failed / "candidate-migration").exists())
        self.assertEqual((failed / "bardic.db").read_bytes(), KEY_BYTES)
        self.assertTrue(updater.gateway_open and updater.server_open)
        self.assertFalse(updater.transaction_path.exists())

    def test_changed_usage_or_unknown_probe_requires_manual_recovery(self):
        updater = self.fleet()
        quiet = updater.probe(self.data, self.candidate)
        updater.events.clear()
        updater.probes = [quiet, quiet, quiet, {**quiet, "usageCount": 8}, {**quiet, "usageCount": 8}]
        with self.assertRaisesRegex(UPDATE.UpdateError, "manual_recovery_required"):
            updater.promote(self.candidate)
        self.assertEqual(UPDATE.load_json(updater.transaction_path)["phase"], "needs_recovery")
        self.assertEqual(updater.current()[0], self.candidate)
        self.assertTrue((self.data / "candidate-migration").exists())
        self.assertFalse(updater.gateway_open)
        self.assertFalse(list((updater.work / "snapshots").glob("*-failed-data")))

    def test_unreadable_candidate_probe_never_rewinds_data(self):
        updater = self.fleet()
        quiet = updater.probe(self.data, self.candidate)
        updater.events.clear()
        updater.probes = [quiet, quiet, quiet, UPDATE.UpdateError("schema_unreadable"),
                          UPDATE.UpdateError("schema_unreadable")]
        with self.assertRaisesRegex(UPDATE.UpdateError, "schema_unreadable"):
            updater.promote(self.candidate)
        self.assertEqual(UPDATE.load_json(updater.transaction_path)["phase"], "candidate_starting")
        self.assertEqual(updater.current()[0], self.candidate)
        self.assertTrue((self.data / "candidate-migration").exists())
        self.assertEqual((self.data / "bardic.db").read_bytes(), KEY_BYTES)
        self.assertFalse(updater.gateway_open)
        self.assertFalse(list((updater.work / "snapshots").glob("*-failed-data")))

    def test_opening_gateway_failure_never_rewinds_accepted_writes(self):
        updater = self.fleet()
        updater.user_write_on_open = True
        updater.failures["candidate:up:all:after"] = [UPDATE.UpdateError("gateway readiness failed")]
        result = updater.promote(self.candidate)
        self.assertEqual(result["disposition"], "updated")
        self.assertIsNone(result["failed_pair"])
        self.assertEqual(updater.current()[0], self.candidate)
        self.assertTrue((self.data / "accepted-user-write").exists())
        self.assertTrue((self.data / "candidate-migration").exists())
        self.assertNotIn("candidate:stop:all", updater.events)
        self.assertTrue(updater.gateway_open)

    def test_new_compatible_api_version_can_promote_without_false_identity_failure(self):
        write_release(self.root, NEW, version="0.5.1")
        updater = self.fleet()
        self.assertEqual(updater.promote(self.candidate)["disposition"], "updated")
        self.assertEqual(updater.current()[0], self.candidate)
        self.assertFalse(updater.transaction_path.exists())

    def test_success_has_a_private_snapshot_and_never_exposes_candidate_before_server_check(self):
        updater = self.fleet()
        result = updater.promote(self.candidate)
        self.assertEqual(result["disposition"], "updated")
        snapshot = Path(result["snapshot"])
        self.assertEqual((snapshot / "data/bardic.db").read_bytes(), KEY_BYTES)
        self.assertEqual(snapshot.stat().st_mode & 0o777, 0o700)
        self.assertLess(updater.events.index("server_check"), updater.events.index("candidate:up:all"))
        self.assertEqual(updater.current()[0], self.candidate)


class RecoveryTests(Fixture):
    def transaction(self, phase):
        updater = self.fleet()
        snapshot = updater.work / "snapshots/attempt"
        # Seed a historical snapshot directly; only real promote calls exercise
        # the fake snapshot's stop-confirmation assertions.
        snapshot.mkdir(parents=True, mode=0o700)
        shutil.copytree(self.data, snapshot / "data")
        if phase in ("stopped", "snapshot_ready", "candidate_starting", "restoring", "rollback_opening"):
            updater.server_open = False
            updater.stop_confirmed = True
        tx = {"previous": str(self.previous), "candidate": str(self.candidate), "attempt": "attempt",
              "snapshot": str(snapshot), "failed_data": str(updater.work / "snapshots/attempt-failed-data"),
              "before": updater.probe(self.data, self.candidate)}
        updater.transaction(tx, phase)
        return updater, tx, snapshot

    def test_crash_before_candidate_start_resumes_old_release(self):
        for phase in ("closing", "stopped", "snapshot_ready"):
            with self.subTest(phase=phase):
                updater, tx, snapshot = self.transaction(phase)
                updater.switch(self.candidate)
                updater.recover()
                self.assertEqual(updater.current()[0], self.previous)
                self.assertFalse(updater.transaction_path.exists())
                self.assertEqual((self.data / "bardic.db").read_bytes(), KEY_BYTES)
                shutil.rmtree(snapshot)

    def test_crash_while_closed_candidate_is_starting_rolls_back_with_failed_data(self):
        updater, tx, snapshot = self.transaction("candidate_starting")
        updater.switch(self.candidate)
        (self.data / "candidate-migration").write_text("original synthetic candidate")
        updater.recover()
        self.assertEqual(updater.current()[0], self.previous)
        self.assertFalse((self.data / "candidate-migration").exists())
        self.assertTrue((Path(updater.state()["recovery_data"]) / "candidate-migration").exists())

    def test_crash_in_opening_phase_preserves_new_data_and_never_calls_rollback(self):
        updater, tx, snapshot = self.transaction("opening")
        updater.switch(self.candidate)
        (self.data / "accepted-user-write").write_text("original synthetic new place")
        updater.recover()
        self.assertEqual(updater.current()[0], self.candidate)
        self.assertTrue((self.data / "accepted-user-write").exists())
        self.assertNotIn("candidate:stop:all", updater.events)
        self.assertFalse(updater.transaction_path.exists())

    def test_crash_after_opening_journal_before_gateway_start_converges_forward(self):
        updater, tx, snapshot = self.transaction("opening")
        updater.switch(self.candidate)
        updater.gateway_open = False
        (self.data / "accepted-user-write").write_text("original synthetic place retained")
        original_check = updater.gateway_check

        def gateway_check(port, version, **kwargs):
            self.assertTrue(updater.gateway_open, "opening recovery must start the gateway before checking it")
            return original_check(port, version, **kwargs)

        updater.gateway_check = gateway_check
        updater.events.clear()
        updater.recover()
        self.assertTrue(updater.gateway_open)
        self.assertEqual(updater.current()[0], self.candidate)
        self.assertEqual((self.data / "accepted-user-write").read_text(), "original synthetic place retained")
        self.assertEqual((snapshot / "data/bardic.db").read_bytes(), KEY_BYTES)
        self.assertIn("candidate:up:all", updater.events)
        self.assertIn("install_self", updater.events)
        self.assertFalse(any(":stop:" in event for event in updater.events))
        self.assertFalse(updater.transaction_path.exists())

    def test_unhealthy_opening_recovery_preserves_transaction_for_retry(self):
        updater, tx, snapshot = self.transaction("opening")
        updater.switch(self.candidate)
        updater.failures["server_check"] = [UPDATE.UpdateError("candidate still unhealthy")]
        with self.assertRaisesRegex(UPDATE.UpdateError, "still unhealthy"):
            updater.recover()
        self.assertEqual(UPDATE.load_json(updater.transaction_path)["phase"], "opening")
        self.assertEqual(updater.current()[0], self.candidate)
        self.assertEqual((snapshot / "data/bardic.db").read_bytes(), KEY_BYTES)

    def test_restoring_crash_before_first_rename_finishes_safely(self):
        self.assert_restoring_boundary("before")

    def test_restoring_crash_between_data_renames_finishes_safely(self):
        self.assert_restoring_boundary("between")

    def test_new_updater_process_recovers_missing_data_between_renames(self):
        updater, tx, snapshot = self.transaction("restoring")
        updater.switch(self.candidate)
        (self.data / "candidate-migration").write_text("original synthetic candidate")
        os.replace(self.data, Path(tx["failed_data"]))
        self.assertFalse(self.data.exists())
        restarted = self.fleet()
        restarted.gateway_open = restarted.server_open = False
        restarted.recover()
        self.assertEqual(restarted.current()[0], self.previous)
        self.assertEqual((self.data / "bardic.db").read_bytes(), KEY_BYTES)
        self.assertEqual((self.data / "audio/original-synthetic.wav").read_bytes(), b"synthetic immutable audio")
        self.assertTrue((Path(tx["failed_data"]) / "candidate-migration").exists())
        self.assertFalse((self.data / "candidate-migration").exists())
        self.assertEqual([call["stopped"] for call in restarted.probe_calls], [True])
        self.assertIn("candidate:ps", restarted.probe_calls[0]["events_before"])
        self.assertFalse(restarted.transaction_path.exists())

    def test_restoring_refuses_renames_without_confirmed_stopped_server(self):
        updater, tx, snapshot = self.transaction("restoring")
        updater.switch(self.candidate)
        (self.data / "candidate-migration").write_text("original synthetic candidate")
        updater.running_results = ["original-synthetic-candidate-still-running\n"]
        updater.probe_calls.clear()
        with self.assertRaisesRegex(UPDATE.UpdateError, "server_still_running"):
            updater.recover()
        self.assertEqual(updater.probe_calls, [])
        self.assertTrue((self.data / "candidate-migration").exists())
        self.assertTrue((snapshot / "data/bardic.db").exists())
        self.assertFalse(Path(tx["failed_data"]).exists())
        self.assertEqual(UPDATE.load_json(updater.transaction_path)["phase"], "restoring")

    def test_missing_data_without_restoring_journal_is_always_refused(self):
        shutil.rmtree(self.data)
        runner = FakeRunner()
        for phase in (None, "stopped", "candidate_starting", "opening", "needs_recovery"):
            with self.subTest(phase=phase):
                if phase:
                    UPDATE.atomic_json(self.root / "updater/transaction.json", {"phase": phase})
                with self.assertRaisesRegex(UPDATE.UpdateError, "data_directory_must_be"):
                    UPDATE.Updater(self.config, runner)
                self.assertFalse(self.data.exists())
        self.assertEqual(runner.calls, [])

    def test_restoring_crash_after_both_data_renames_finishes_safely(self):
        self.assert_restoring_boundary("after")

    def assert_restoring_boundary(self, boundary):
        updater, tx, snapshot = self.transaction("restoring")
        updater.switch(self.candidate)
        updater.gateway_open = updater.server_open = False
        (self.data / "candidate-migration").write_text("original synthetic candidate")
        failed = updater.work / "snapshots/attempt-failed-data"
        if boundary in ("between", "after"):
            os.replace(self.data, failed)
        if boundary == "after":
            os.replace(snapshot / "data", self.data)
        synced = []
        original_sync = UPDATE.sync_directory
        original_compose = updater.compose
        required_parents = {self.data.parent, failed.parent, snapshot}

        def sync_directory(path):
            synced.append(Path(path))
            original_sync(path)

        def compose(release, args, **kwargs):
            if release == self.previous and args[0] == "up":
                self.assertTrue(required_parents.issubset(set(synced)),
                                "all rename parents must be durable before reopening, including after an interrupted fsync")
            return original_compose(release, args, **kwargs)

        updater.compose = compose
        with patch.object(UPDATE, "sync_directory", side_effect=sync_directory):
            updater.recover()
        self.assertEqual(updater.current()[0], self.previous)
        self.assertEqual((self.data / "bardic.db").read_bytes(), KEY_BYTES)
        self.assertFalse((self.data / "candidate-migration").exists())
        self.assertTrue((failed / "candidate-migration").exists())
        self.assertFalse(updater.transaction_path.exists())
        self.assertTrue(updater.gateway_open and updater.server_open)

    def test_ambiguous_restoring_directories_are_retained_for_manual_recovery(self):
        updater, tx, snapshot = self.transaction("restoring")
        updater.switch(self.candidate)
        updater.gateway_open = updater.server_open = False
        (self.data / "candidate-migration").write_text("original synthetic candidate")
        failed = Path(tx["failed_data"])
        shutil.copytree(self.data, failed)
        with self.assertRaisesRegex(UPDATE.UpdateError, "manual_recovery_required"):
            updater.recover()
        self.assertEqual((snapshot / "data/bardic.db").read_bytes(), KEY_BYTES)
        self.assertTrue((self.data / "candidate-migration").exists())
        self.assertTrue((failed / "candidate-migration").exists())
        self.assertTrue(updater.transaction_path.exists())
        self.assertFalse(updater.gateway_open or updater.server_open)

    def test_missing_restore_directories_are_not_fabricated(self):
        updater, tx, snapshot = self.transaction("restoring")
        updater.gateway_open = updater.server_open = False
        shutil.rmtree(self.data)
        shutil.rmtree(snapshot / "data")
        with self.assertRaisesRegex(UPDATE.UpdateError, "manual_recovery_required"):
            updater.recover()
        self.assertFalse(self.data.exists())
        self.assertTrue(updater.transaction_path.exists())
        self.assertFalse(updater.gateway_open or updater.server_open)

    def test_restored_snapshot_must_match_before_gateway_reopens(self):
        updater, tx, snapshot = self.transaction("restoring")
        updater.switch(self.candidate)
        updater.gateway_open = updater.server_open = False
        (self.data / "candidate-migration").write_text("original synthetic candidate")
        os.replace(self.data, Path(tx["failed_data"]))
        os.replace(snapshot / "data", self.data)
        updater.probes = [{**tx["before"], "usageCount": 99}]
        with self.assertRaisesRegex(UPDATE.UpdateError, "manual_recovery_required"):
            updater.recover()
        self.assertEqual(updater.current()[0], self.candidate)
        self.assertEqual((self.data / "bardic.db").read_bytes(), KEY_BYTES)
        self.assertTrue((Path(tx["failed_data"]) / "candidate-migration").exists())
        self.assertTrue(updater.transaction_path.exists())
        self.assertFalse(updater.gateway_open or updater.server_open)

    def test_rollback_opening_crash_never_restores_again_after_new_writes(self):
        updater, tx, snapshot = self.transaction("rollback_opening")
        shutil.copytree(self.data, Path(tx["failed_data"]))
        (self.data / "accepted-user-write").write_text("original synthetic place after rollback")
        updater.recover()
        self.assertEqual(updater.current()[0], self.previous)
        self.assertTrue((self.data / "accepted-user-write").exists())
        self.assertEqual((snapshot / "data/bardic.db").read_bytes(), KEY_BYTES)
        self.assertFalse(updater.transaction_path.exists())
        self.assertNotIn("candidate:stop:all", updater.events)

    def test_check_only_with_recovery_pending_does_not_fetch_or_touch_services(self):
        updater, tx, snapshot = self.transaction("opening")
        updater.events.clear()
        self.assertEqual(updater.run(check_only=True), {"disposition": "recovery_pending"})
        self.assertEqual(updater.events, [])


class FailedPairTests(Fixture):
    def test_failed_pair_is_latched_and_explicit_retry_can_recover(self):
        updater = self.fleet()
        updater.failures["validate"] = [UPDATE.UpdateError("synthetic verification rejected")]
        with self.assertRaises(UPDATE.UpdateError):
            updater.run()
        self.assertEqual(updater.state()["failed_pair"], NEW)
        count = updater.events.count("validate")
        self.assertEqual(updater.run()["disposition"], "failed_pair_held")
        self.assertEqual(updater.events.count("validate"), count)
        self.assertEqual(updater.run(retry_failed=True)["disposition"], "updated")
        self.assertIsNone(updater.state()["failed_pair"])

    def test_different_pair_is_not_blocked_by_previous_failed_pair(self):
        updater = self.fleet()
        updater.record("failed", failed_pair=NEW)
        updater.next_pair = copy.deepcopy(LATER)
        self.assertEqual(updater.run()["disposition"], "updated")
        self.assertEqual(updater.current()[1]["server"], LATER["server"])

    def test_changed_main_after_validation_never_promotes_stale_pair(self):
        updater = self.fleet()
        updater.next_pairs = [NEW, LATER]
        self.assertEqual(updater.run()["disposition"], "main_changed_during_verification")
        self.assertEqual(updater.current()[0], self.previous)
        self.assertFalse(any(event.startswith("old:stop") for event in updater.events))

    def test_prepare_failure_is_latched_like_verification_failure(self):
        updater = self.fleet()
        updater.failures["prepare"] = [UPDATE.UpdateError("contracts_do_not_match")]
        with self.assertRaisesRegex(UPDATE.UpdateError, "contracts_do_not_match"):
            updater.run()
        self.assertEqual(updater.state().get("failed_pair"), NEW)
        self.assertEqual(updater.run()["disposition"], "failed_pair_held")


class SmokeUpdater(UPDATE.Updater):
    def __init__(self, config, runner):
        super().__init__(config, runner)
        self.http = []
        self.listeners = []
        self.synthetic_data = []

    def get(self, url, *, method="GET", body=None, headers=None, expected=200):
        self.http.append((url, method, body, headers or {}, expected))
        path = url.split("/", 3)[-1]
        if path == "api/health":
            return b'{"ok":true}'
        if path == "api/server":
            return json.dumps({"id": SERVER_ID, "api_version": "0.5.0"}).encode()
        if path == "":
            return b'<script type="module" src="/assets/entry-synthetic.js"></script>'
        if path in ("assets/entry-synthetic.js", "sw.js"):
            return b"// original synthetic production code"
        if path == SAMPLE_PROBE and method == "HEAD":
            return b""
        if path == "api/listeners" and method == "POST":
            self.listeners.append({"id": "original-synthetic-listener", **body})
            return json.dumps(self.listeners[-1]).encode()
        if path == "api/listeners":
            return json.dumps({"items": self.listeners}).encode()
        raise AssertionError("unapproved synthetic HTTP request: " + method + " " + path)

    def probe(self, data, release, *, stopped=False):
        if stopped:
            raise AssertionError("synthetic running smoke must use the live probe")
        self.synthetic_data.append(data)
        return {"quiet": True, "reasons": [], "serverId": SERVER_ID, "usageCount": 0}


class IsolationTests(Fixture):
    def test_probe_cli_stopped_mode_is_explicit_and_running_default_has_no_flag(self):
        runner = FakeRunner(lambda args, binary: subprocess.CompletedProcess(args, 0,
                            json.dumps({"quiet": True, "reasons": [], "serverId": SERVER_ID, "usageCount": 7}), ""))
        updater = self.updater(runner)
        updater.probe(self.data, self.candidate)
        updater.probe(self.data, self.candidate, stopped=True)
        self.assertNotIn("--stopped", runner.calls[0]["args"])
        self.assertEqual(runner.calls[1]["args"][-2:], ["/probe.mjs", "--stopped"])
        for call in runner.calls:
            self.assertIn(f"type=bind,src={self.data},dst=/data,readonly", call["args"])
            self.assertEqual(call["args"][call["args"].index("--network") + 1], "none")

    def test_resolved_compose_permits_only_expected_private_release_pair(self):
        runner = FakeRunner(lambda args, binary: subprocess.CompletedProcess(args, 0, json.dumps(self.resolved_compose()), ""))
        self.updater(runner).check_compose(self.candidate)
        self.assertEqual(runner.calls[-1]["args"][-3:], ["config", "--format", "json"])
        self.assertFalse(any("up" in call["args"] for call in runner.calls))

    def test_resolved_compose_rejects_unsafe_images_services_mounts_and_bindings(self):
        changes = {
            "wrong_image": lambda c: c["services"]["bardic-web"].update(image="bardic-web:unverified"),
            "extra_service": lambda c: c["services"].update(unapproved={"image": "synthetic"}),
            "server_port": lambda c: c["services"]["bardic-server"].update(ports=[{"published": "8765", "target": 8765}]),
            "wrong_data": lambda c: c["services"]["bardic-server"]["volumes"][0].update(source="/unapproved-live-library"),
            "wrong_mount_target": lambda c: c["services"]["bardic-server"]["volumes"][0].update(target="/other-data"),
            "extra_server_mount": lambda c: c["services"]["bardic-server"]["volumes"].append({"type": "bind", "source": "/var/run/docker.sock", "target": "/socket"}),
            "readonly_data": lambda c: c["services"]["bardic-server"]["volumes"][0].update(read_only=True),
            "gateway_mount": lambda c: c["services"]["bardic-web"].update(volumes=[{"type": "bind", "source": str(self.data), "target": "/live-data"}]),
            "public_binding": lambda c: c["services"]["bardic-web"]["ports"][0].update(host_ip="0.0.0.0"),
            "wrong_published_port": lambda c: c["services"]["bardic-web"]["ports"][0].update(published="443"),
            "extra_gateway_port": lambda c: c["services"]["bardic-web"]["ports"].append({"host_ip": "127.0.0.1", "published": "18081", "target": 8081}),
            "udp": lambda c: c["services"]["bardic-web"]["ports"][0].update(protocol="udp"),
            "host_network": lambda c: c["services"]["bardic-server"].update(network_mode="host"),
            "privileged": lambda c: c["services"]["bardic-server"].update(privileged=True)}
        for name, change in changes.items():
            with self.subTest(name=name):
                config = self.resolved_compose()
                change(config)
                runner = FakeRunner(lambda args, binary: subprocess.CompletedProcess(args, 0, json.dumps(config), ""))
                with self.assertRaises(UPDATE.UpdateError):
                    self.updater(runner).check_compose(self.candidate)
                self.assertEqual(len(runner.calls), 1)
                self.assertFalse(any("up" in call["args"] for call in runner.calls))
                self.assertEqual((self.data / "bardic.db").read_bytes(), KEY_BYTES)

    def test_snapshot_copy_requires_durability_before_returning(self):
        destination = self.root / "updater/snapshots/production-helper"

        def respond(args, binary):
            if args[:2] == ["docker", "run"]:
                self.assertEqual(args[-1], "cp -a /data /snapshot/data && sync -f /snapshot/data")
                self.assertIn(f"type=bind,src={self.data},dst=/data,readonly", args)
                self.assertEqual(args[args.index("--network") + 1], "none")
                shutil.copytree(self.data, destination / "data")

        runner = FakeRunner(respond)
        self.updater(runner).snapshot(self.previous, destination)
        self.assertEqual((destination / "data/bardic.db").read_bytes(), KEY_BYTES)
        self.assertEqual((destination / "data/audio/original-synthetic.wav").read_bytes(), b"synthetic immutable audio")
        self.assertEqual(destination.stat().st_mode & 0o777, 0o700)

    def test_verified_release_skips_all_builds_and_synthetic_mutations(self):
        runner = FakeRunner()
        updater = SmokeUpdater(self.config, runner)
        updater.validate(self.candidate)
        self.assertEqual(runner.calls, [])
        self.assertEqual(updater.http, [])

    def test_runner_ignores_exported_release_selection_without_logging_payloads(self):
        runner = UPDATE.Runner()
        response = subprocess.CompletedProcess(["docker", "compose"], 0, "", "")
        with patch.dict(UPDATE.os.environ, {"BARDIC_IMAGE_TAG": "wrong-exported-tag",
                                            "BARDIC_SERVER_CONTEXT": "/wrong-checkout"}), \
             patch.object(UPDATE.subprocess, "run", return_value=response) as run:
            runner.run(["docker", "compose"])
        environment = run.call_args.kwargs["env"]
        self.assertNotIn("BARDIC_IMAGE_TAG", environment)
        self.assertNotIn("BARDIC_SERVER_CONTEXT", environment)
        self.assertEqual(environment["GIT_TERMINAL_PROMPT"], "0")
        self.assertTrue(run.call_args.kwargs["capture_output"])
        self.assertEqual(run.call_args.args[0], ["docker", "compose"])

    def test_exported_compose_configuration_cannot_override_live_or_synthetic_files(self):
        hostile = {"BARDIC_IMAGE_TAG": "unverified-exported-tag",
                   "BARDIC_SERVER_CONTEXT": "/unverified-exported-checkout",
                   "BARDIC_DATA_DIR": str(self.data),
                   "BARDIC_BIND_ADDRESS": "0.0.0.0", "BARDIC_HTTP_PORT": "443",
                   "BARDIC_ALLOW_HOSTS": "foreign.invalid", "BARDIC_ALLOW_ORIGINS": "https://foreign.invalid",
                   "COMPOSE_FILE": "/unverified-override.yaml", "COMPOSE_PROFILES": "unverified-extra-services",
                   "COMPOSE_ENV_FILES": str(self.root / ".env"), "COMPOSE_PROJECT_NAME": "wrong-live-project",
                   "DOCKER_HOST": "unix:///original-synthetic-docker.sock", "DOCKER_CONTEXT": "original-synthetic-context"}
        smoke = self.root / "updater/synthetic.env"
        smoke.write_text("BARDIC_DATA_DIR=/original-synthetic-disposable-data\nBARDIC_BIND_ADDRESS=127.0.0.1\nBARDIC_HTTP_PORT=18181\n")
        updater = self.updater(UPDATE.Runner())
        response = subprocess.CompletedProcess(["docker", "compose"], 0, "", "")
        with patch.dict(UPDATE.os.environ, hostile), \
             patch.object(UPDATE.subprocess, "run", return_value=response) as run:
            updater.compose(self.candidate, ["up", "-d"])
            updater.compose(self.candidate, ["up", "-d"], project="bardic-check-original-synthetic",
                            env_file=smoke, override=False)
        self.assertEqual(run.call_count, 2)
        for i, call in enumerate(run.call_args_list):
            environment = call.kwargs["env"]
            self.assertFalse(any(name.startswith(("BARDIC_", "COMPOSE_")) for name in environment))
            self.assertEqual(environment["DOCKER_HOST"], hostile["DOCKER_HOST"])
            self.assertEqual(environment["DOCKER_CONTEXT"], hostile["DOCKER_CONTEXT"])
            arguments = call.args[0]
            files = [arguments[j + 1] for j, arg in enumerate(arguments[:-1]) if arg == "--env-file"]
            self.assertEqual(files, [str(self.root / ".env" if i == 0 else smoke), str(self.candidate / "release.env")])
            expected_project = "bardic-v2" if i == 0 else "bardic-check-original-synthetic"
            self.assertEqual(arguments[arguments.index("--project-name") + 1], expected_project)
            if i == 1:
                self.assertNotIn(str(self.root / "compose.host.yaml"), arguments)
        self.assertEqual((self.data / "bardic.db").read_bytes(), KEY_BYTES)

    def test_probe_unknown_or_invalid_payload_cannot_claim_quiet(self):
        for payload in ("not JSON", "null", '{"quiet":1,"reasons":[]}', '{"quiet":true,"reasons":"unknown"}'):
            with self.subTest(payload=payload):
                runner = FakeRunner(lambda args, binary: subprocess.CompletedProcess(args, 0, payload, ""))
                with self.assertRaisesRegex(UPDATE.UpdateError, "invalid_quiescence_probe"):
                    self.updater(runner).probe(self.data, self.candidate)
                args = runner.calls[0]["args"]
                self.assertIn("--read-only", args)
                self.assertEqual(args[args.index("--network") + 1], "none")
                self.assertTrue(any(arg.endswith("dst=/data,readonly") for arg in args))

    def test_validation_uses_full_verify_targets_and_isolated_disposable_smoke(self):
        write_release(self.root, NEW, verified=False)
        def respond(args, binary):
            if args[-3:] == ["config", "--format", "json"]:
                return subprocess.CompletedProcess(args, 0, json.dumps(self.resolved_compose()), "")
        runner = FakeRunner(respond)
        updater = SmokeUpdater(self.config, runner)
        # Port selection is the only socket operation in validate(). No real
        # bind or external process is needed to exercise the isolation plan.
        with patch.object(UPDATE.socket, "socket") as socket:
            socket.return_value.getsockname.return_value = ("127.0.0.1", 18181)
            updater.validate(self.candidate)
        builds = [c["args"] for c in runner.calls if c["args"][:2] == ["docker", "build"]]
        self.assertEqual(len(builds), 2)
        self.assertTrue(all(args[args.index("--target") + 1] == "verify" for args in builds))
        web = next(args for args in builds if args[-1] == str(self.candidate / "bardic-web"))
        self.assertEqual(web[web.index("--build-context") + 1], "bardic_server=" + str(self.candidate / "bardic-server"))
        compose = [c for c in runner.calls if c["args"][:2] == ["docker", "compose"]]
        smoke = [c for c in compose if "bardic-check-" in " ".join(c["args"])]
        self.assertGreaterEqual(len(smoke), 4)
        projects = {c["args"][c["args"].index("--project-name") + 1] for c in smoke}
        self.assertEqual(len(projects), 1)
        for command in smoke:
            self.assertNotIn(str(self.root / "compose.host.yaml"), command["args"])
            self.assertNotIn(str(self.root / ".env"), command["args"])
            files = command["files"]
            env = next(text for path, text in files.items() if Path(path).name == ".env")
            values = dict(line.split("=", 1) for line in env.splitlines())
            self.assertNotEqual(Path(values["BARDIC_DATA_DIR"]), self.data)
            self.assertTrue(Path(values["BARDIC_DATA_DIR"]).is_relative_to(updater.work))
            network = next(json.loads(text) for path, text in files.items() if Path(path).name == "isolated.json")
            self.assertIs(network["networks"]["default"]["internal"], True)
        mutations = [(url, method, body) for url, method, body, headers, expected in updater.http if method != "GET"]
        self.assertEqual(sum(method == "POST" for url, method, body in mutations), 1)
        self.assertTrue(all(url.endswith("/api/listeners") if method == "POST" else url.endswith("/" + SAMPLE_PROBE) and method == "HEAD"
                            for url, method, body in mutations))
        self.assertEqual((self.data / "bardic.db").read_bytes(), KEY_BYTES)
        self.assertTrue(all(path != self.data and not path.exists() for path in updater.synthetic_data))
        self.assertTrue(UPDATE.load_json(self.candidate / "release.json")["verified"])
        self.assertIsNone(runner.log)

    def test_live_gateway_check_never_creates_listeners_or_provider_work(self):
        updater = SmokeUpdater(self.config, FakeRunner())
        updater.gateway_check(18080, "0.5.0")
        self.assertEqual(updater.listeners, [])
        self.assertTrue(all(method in ("GET", "HEAD") for url, method, body, headers, expected in updater.http))
        foreign = [entry for entry in updater.http if entry[-1] == 403]
        self.assertEqual(foreign[0][3]["Origin"], "https://foreign.invalid")

    def test_compose_uses_release_env_after_host_env_without_modifying_either(self):
        runner = FakeRunner()
        updater = self.updater(runner)
        updater.compose(self.candidate, ["up", "-d"])
        args = runner.calls[-1]["args"]
        environments = [args[i + 1] for i, arg in enumerate(args[:-1]) if arg == "--env-file"]
        self.assertEqual(environments, [str(self.root / ".env"), str(self.candidate / "release.env")])
        self.assertEqual(args[args.index("--project-name") + 1], "bardic-v2")
        self.assertEqual((self.root / ".env").read_bytes(), self.env_bytes)

    def test_private_real_data_and_pinned_probe_image_are_required(self):
        for name, value, expected in (("node_image", "node:latest", "digest_pinned"), ("root", "/", "invalid_installation_root")):
            with self.subTest(name=name):
                config = {**self.config, name: value}
                with self.assertRaisesRegex(UPDATE.UpdateError, expected):
                    UPDATE.Updater(config, FakeRunner())
        (self.root / ".env").write_text(self.env_bytes.decode().replace("127.0.0.1", "0.0.0.0"))
        with self.assertRaisesRegex(UPDATE.UpdateError, "private_loopback_gateway"):
            self.updater()


class AssetRetentionTests(Fixture):
    def runner_with_assets(self, *, collision=False, symlink=False):
        containers = {}
        builds = []
        old_image = "bardic-web:" + self.previous.name
        old = {"old-only-synthetic-hash.js": b"// original synthetic old lazy reader",
               "shared-synthetic-hash.css": b"/* original synthetic shared style */"}
        fresh = {"new-only-synthetic-hash.js": b"// original synthetic new reader",
                 "shared-synthetic-hash.css": b"/* original synthetic shared style */"}
        if collision:
            fresh["shared-synthetic-hash.css"] = b"/* original synthetic conflicting bytes */"

        def respond(args, binary):
            if args[:2] == ["docker", "create"]:
                self.assertEqual(args[args.index("--network") + 1], "none")
                containers[args[args.index("--name") + 1]] = args[-1]
            if args[:2] == ["docker", "cp"]:
                container = args[2].split(":", 1)[0]
                source = old if containers[container] == old_image else fresh
                destination = Path(args[3])
                for name, value in source.items():
                    (destination / name).write_bytes(value)
                if symlink and containers[container] == old_image:
                    (destination / "unapproved-symlink.js").symlink_to(self.data / "bardic.db")
            if args[:2] == ["docker", "build"]:
                context = Path(args[-1])
                builds.append({"args": list(args), "dockerfile": (context / "Dockerfile").read_text(),
                               "retained": {str(path.relative_to(context / "retained")): path.read_bytes()
                                            for path in (context / "retained").rglob("*") if path.is_file()}})
        return FakeRunner(respond), builds, old

    def test_old_lazy_chunks_are_retained_without_replacing_new_assets(self):
        runner, builds, old = self.runner_with_assets()
        self.updater(runner).retain_previous_assets(self.candidate)
        self.assertEqual(len(builds), 1)
        self.assertEqual(builds[0]["retained"], {"old-only-synthetic-hash.js": old["old-only-synthetic-hash.js"]})
        self.assertEqual(builds[0]["dockerfile"], f"FROM bardic-web:{self.candidate.name}-fresh\nCOPY retained/ /srv/assets/\n")
        self.assertEqual(builds[0]["args"][2:4], ["-t", "bardic-web:" + self.candidate.name])
        manifest = UPDATE.load_json(self.candidate / "release.json")
        self.assertEqual(manifest["retained_assets_from"], self.previous.name)
        self.assertEqual(manifest["retained_asset_count"], 1)
        self.assertEqual(sum(call["args"][:2] == ["docker", "rm"] for call in runner.calls), 2)
        self.assertFalse(any(call["args"][:2] in (["docker", "start"], ["docker", "run"]) for call in runner.calls))
        self.assertEqual(list((self.root / "updater").glob("retained-assets-*")), [])

    def test_asset_collision_or_symlink_aborts_before_candidate_image_replacement(self):
        for collision, symlink, expected in ((True, False, "hashed_asset_collision"),
                                             (False, True, "unexpected_asset_type")):
            with self.subTest(collision=collision, symlink=symlink):
                runner, builds, old = self.runner_with_assets(collision=collision, symlink=symlink)
                with self.assertRaisesRegex(UPDATE.UpdateError, expected):
                    self.updater(runner).retain_previous_assets(self.candidate)
                self.assertEqual(builds, [])
                self.assertFalse(any(call["args"][:3] == ["docker", "image", "tag"] for call in runner.calls))
                self.assertEqual(sum(call["args"][:2] == ["docker", "rm"] for call in runner.calls), 2)
                self.assertEqual((self.data / "bardic.db").read_bytes(), KEY_BYTES)
                self.assertEqual(list((self.root / "updater").glob("retained-assets-*")), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)

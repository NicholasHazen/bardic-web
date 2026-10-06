// node --test deploy/quiet-check.test.mjs (Node 24; adjacent server checkout required)
// BARDIC_PROBE_DOCKER_TEST=1 also exercises the exact pinned Node image with a
// genuinely read-only bind. This external proof requires Docker on the host;
// the image's verify stage runs the remaining synthetic tests without Docker.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkQuiescence, SUPPORTED_SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS } from './quiet-check.mjs';

const script = fileURLToPath(new URL('./quiet-check.mjs', import.meta.url));
const pinnedNode = 'node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1';
const server = process.env.BARDIC_SERVER_CONTEXT
  ? resolve(process.env.BARDIC_SERVER_CONTEXT)
  : fileURLToPath(new URL('../../bardic-server/', import.meta.url));
const migrationsPath = join(server, 'crates/bardic-server/migrations');
const serverId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const at = '2026-10-05T00:00:00.000Z';
const migrations = readdirSync(migrationsPath)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort()
  .map((name) => readFileSync(join(migrationsPath, name), 'utf8'));

function fixture(t, { migrated = true, identity = true, wal = false, schemaVersion = SUPPORTED_SCHEMA_VERSION } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'bardic-quiet-synthetic-'));
  const path = join(directory, 'bardic.db');
  const db = new DatabaseSync(path);
  let closed = false;
  t.after(() => {
    if (!closed) db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  db.exec('PRAGMA foreign_keys = ON');
  if (wal) db.exec('PRAGMA journal_mode = WAL');
  if (migrated) {
    migrations.slice(0, schemaVersion).forEach((sql, index) => {
      db.exec(`BEGIN; ${sql} PRAGMA user_version = ${index + 1}; COMMIT;`);
    });
    if (identity) db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('server_id', serverId);
  }
  return { db, path, directory, close: () => { db.close(); closed = true; } };
}

function job(db, state, { id = 'synthetic-job', current = null, kind = 'make_audio', plan = null } = {}) {
  db.prepare(`INSERT INTO jobs(id,kind,state,current_chapter_id,plan_id,started_by,created_at,updated_at)
    VALUES(?,?,?,?,?,'{}',?,?)`).run(id, kind, state, current, plan, at, at);
}

function usage(db, status, { id = 'synthetic-spend', plan = null, chapter = null } = {}) {
  db.prepare('INSERT INTO spend(id,status,plan_id,chapter_id,at,reserved) VALUES(?,?,?,?,?,123)')
    .run(id, status, plan, chapter, at);
}

function audiobook(db) {
  db.prepare("INSERT INTO books(id,title,state,added_at) VALUES('synthetic-book','An Original Test Story','readable',?)").run(at);
  db.prepare(`INSERT INTO voices(id,source_id,external_id,name,tier,language,revision,updated_at)
    VALUES('synthetic-voice','breeze','synthetic','Synthetic Voice','free','en','r1',?)`).run(at);
  db.prepare(`INSERT INTO audiobooks(id,book_id,voice_id,voice_name,voice_revision,created_at)
    VALUES('synthetic-audiobook','synthetic-book','synthetic-voice','Synthetic Voice','r1',?)`).run(at);
}

function retainedRequest(db) {
  audiobook(db);
  const text = 'An original synthetic passage waits beside the paper lantern.';
  db.prepare(`INSERT INTO chapters(id,book_id,idx,title,kind,text,text_sha256,word_count)
    VALUES('synthetic-chapter','synthetic-book',0,'Synthetic chapter','story',?,?,10)`)
    .run(text, createHash('sha256').update(text).digest('hex'));
  db.prepare(`INSERT INTO chapter_parts(audiobook_id,chapter_id,audio_id,chunk_chars,chunks_done,pcm_bytes,timings)
    VALUES('synthetic-audiobook','synthetic-chapter','synthetic-retained-audio',2500,0,0,'[]')`).run();
  // Index 1 is complete while index 0 is still missing: the reviewed table
  // stores durable output independently of the ordered chapter_parts prefix.
  db.prepare(`INSERT INTO chapter_requests(audiobook_id,chapter_id,request_index,audio_id,pcm_bytes,timings,sha256)
    VALUES('synthetic-audiobook','synthetic-chapter',1,'synthetic-retained-audio',4800,?,?)`)
    .run(JSON.stringify([{ line_id: 'synthetic-line', start_ms: 0, end_ms: 100 }]), 'a'.repeat(64));
}

function expectsBlocked(result, reason, countField, expected = 1, schemaVersion = SUPPORTED_SCHEMA_VERSION) {
  assert.equal(result.quiet, false);
  assert.ok(result.reasons.includes(reason), JSON.stringify(result));
  assert.equal(result.schemaVersion, schemaVersion);
  assert.equal(result.serverId, serverId);
  if (countField) assert.equal(result.counts[countField], expected);
}

test('actual shipped migrations produce the supported schema and an empty server is quiet', (t) => {
  assert.equal(migrations.length, SUPPORTED_SCHEMA_VERSION);
  const { db, path } = fixture(t);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, SUPPORTED_SCHEMA_VERSION);
  const result = checkQuiescence(path);
  assert.equal(result.quiet, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.schemaVersion, SUPPORTED_SCHEMA_VERSION);
  assert.equal(result.serverId, serverId);
  assert.equal(result.usageCount, 0);
  assert.ok(Object.values(result.counts).every((value) => value === 0));
});

for (const schemaVersion of SUPPORTED_SCHEMA_VERSIONS) {
  test(`real migration prefix ${schemaVersion} supports installed/candidate live and stopped checks`, (t) => {
    const { db, path, directory, close } = fixture(t, { schemaVersion, wal: true });
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, schemaVersion);
    const result = checkQuiescence(path);
    assert.equal(result.quiet, true);
    assert.equal(result.schemaVersion, schemaVersion);
    assert.equal(result.serverId, serverId);
    assert.equal(result.usageCount, 0);
    close();
    const before = createHash('sha256').update(readFileSync(path)).digest('hex');
    const stopped = checkQuiescence(path, { stopped: true });
    assert.equal(stopped.quiet, true);
    assert.equal(stopped.schemaVersion, schemaVersion);
    assert.equal(stopped.serverId, serverId);
    assert.deepEqual(readdirSync(directory), ['bardic.db']);
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), before);
  });

  test(`real migration prefix ${schemaVersion} still blocks work, paid WAL reservations and unknown states`, (t) => {
    const { db, path } = fixture(t, { schemaVersion, wal: true });
    job(db, 'running');
    expectsBlocked(checkQuiescence(path), 'active_jobs', 'activeJobs', 1, schemaVersion);
    db.exec("UPDATE jobs SET state='paused', current_chapter_id='synthetic-chapter'");
    expectsBlocked(checkQuiescence(path), 'paused_chapter_in_flight', 'pausedInFlightJobs', 1, schemaVersion);
    db.exec('UPDATE jobs SET current_chapter_id=NULL; PRAGMA wal_checkpoint(TRUNCATE)');
    usage(db, 'reserved');
    expectsBlocked(checkQuiescence(path), 'reserved_paid_requests', 'reservedUsage', 1, schemaVersion);
    assert.ok(statSync(`${path}-wal`).size > 0);
    assert.deepEqual(checkQuiescence(path, { stopped: true }), {
      quiet: false, reasons: ['stopped_wal_not_empty'], schemaVersion: null,
    });
    db.exec("UPDATE spend SET status='known'; PRAGMA ignore_check_constraints=ON; UPDATE jobs SET state='a_future_state',kind='a_future_worker'");
    const unknown = checkQuiescence(path);
    expectsBlocked(unknown, 'unknown_work_state', 'unknownStates', 1, schemaVersion);
    assert.ok(unknown.reasons.includes('unknown_job_kind'));
  });
}

for (const [schemaVersion, table, column] of [[12, 'chapters', 'page_count'], [13, 'jobs', 'generation']]) {
  test(`schema ${schemaVersion} missing its added ${column} metadata fails closed`, (t) => {
    const { db, path } = fixture(t, { schemaVersion });
    db.exec(`ALTER TABLE ${table} RENAME COLUMN ${column} TO synthetic_missing_column`);
    assert.deepEqual(checkQuiescence(path), { quiet: false, reasons: ['schema_mismatch'], schemaVersion });
  });
}

test('schema 14 retained out-of-order requests are settled work and survive live/stopped probes unchanged', (t) => {
  const { db, path, close } = fixture(t, { schemaVersion: 14, wal: true });
  retainedRequest(db);
  job(db, 'paused');
  const result = checkQuiescence(path);
  assert.equal(result.quiet, true);
  assert.equal(result.schemaVersion, 14);
  assert.equal(result.usageCount, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM chapter_requests').get().count, 1);
  assert.equal(db.prepare('SELECT chunks_done FROM chapter_parts').get().chunks_done, 0);
  assert.ok(!JSON.stringify(result).includes('synthetic-retained-audio'));
  close();
  const before = createHash('sha256').update(readFileSync(path)).digest('hex');
  assert.equal(checkQuiescence(path, { stopped: true }).quiet, true);
  assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), before);
});

test('schema 14 retained output does not hide a running or paused in-flight chapter', (t) => {
  const { db, path } = fixture(t, { schemaVersion: 14 });
  retainedRequest(db);
  job(db, 'running', { current: 'synthetic-chapter' });
  db.prepare("INSERT INTO job_items(job_id,chapter_id,position,state) VALUES('synthetic-job','synthetic-chapter',0,'queued')").run();
  expectsBlocked(checkQuiescence(path), 'active_jobs', 'activeJobs');
  db.exec("UPDATE jobs SET state='paused'");
  expectsBlocked(checkQuiescence(path), 'paused_chapter_in_flight', 'pausedInFlightJobs');
});

for (const column of ['audiobook_id', 'chapter_id', 'request_index', 'audio_id', 'pcm_bytes', 'timings', 'sha256']) {
  test(`schema 14 missing indexed request column ${column} fails closed`, (t) => {
    const { db, path } = fixture(t, { schemaVersion: 14 });
    db.exec(`ALTER TABLE chapter_requests RENAME COLUMN ${column} TO synthetic_missing_column`);
    assert.deepEqual(checkQuiescence(path), { quiet: false, reasons: ['schema_mismatch'], schemaVersion: 14 });
  });
}

test('schema 14 unexpected indexed request metadata fails closed', (t) => {
  const { db, path } = fixture(t, { schemaVersion: 14 });
  db.exec('ALTER TABLE chapter_requests ADD COLUMN synthetic_future_work_state TEXT');
  assert.deepEqual(checkQuiescence(path), { quiet: false, reasons: ['schema_mismatch'], schemaVersion: 14 });
});

for (const [label, pattern, replacement] of [
  ['request index constraint', /CHECK\s*\(request_index\s*>=\s*0\)/, ''],
  ['PCM size constraint', /CHECK\s*\(pcm_bytes\s*>\s*0\)/, ''],
  ['request index type', /request_index\s+INTEGER/, 'request_index TEXT'],
  ['parent cascade', /ON DELETE CASCADE/, 'ON DELETE SET NULL'],
]) {
  test(`schema 14 altered ${label} fails closed`, (t) => {
    const { db, path } = fixture(t, { schemaVersion: 14 });
    assert.match(migrations[13], pattern);
    db.exec('DROP TABLE chapter_requests');
    db.exec(migrations[13].replace(pattern, replacement));
    assert.deepEqual(checkQuiescence(path), { quiet: false, reasons: ['schema_mismatch'], schemaVersion: 14 });
  });
}

for (const state of ['queued', 'running', 'waiting']) {
  test(`${state} job blocks deployment, including future quota wakeups`, (t) => {
    const { db, path } = fixture(t);
    job(db, state);
    if (state === 'waiting') db.exec("UPDATE jobs SET wake_at='2099-01-01T00:00:00.000Z'");
    expectsBlocked(checkQuiescence(path), 'active_jobs', 'activeJobs');
  });
}

test('paused premium chapter blocks between paid chunks even with no outstanding reservation', (t) => {
  const { db, path } = fixture(t);
  job(db, 'paused', { current: 'synthetic-chapter', plan: 'synthetic-plan' });
  db.exec("INSERT INTO job_items(job_id,chapter_id,position,state) VALUES('synthetic-job','synthetic-chapter',0,'queued')");
  usage(db, 'known', { plan: 'synthetic-plan', chapter: 'synthetic-chapter' });
  const result = checkQuiescence(path);
  expectsBlocked(result, 'paused_chapter_in_flight', 'pausedInFlightJobs');
  assert.equal(result.counts.reservedUsage, 0);
  assert.equal(result.usageCount, 1);
  db.exec("UPDATE job_items SET state='done'");
  assert.equal(checkQuiescence(path).quiet, true, 'a completed chapter boundary permits the update');
});

test('paused current chapter without its job item fails closed', (t) => {
  const { db, path } = fixture(t);
  job(db, 'paused', { current: 'synthetic-chapter' });
  expectsBlocked(checkQuiescence(path), 'paused_chapter_in_flight', 'pausedInFlightJobs');
});

test('idle paused/needs-you and terminal jobs do not auto-resume and are quiet', (t) => {
  const { db, path } = fixture(t);
  ['paused', 'needs_you', 'completed', 'stopped', 'failed'].forEach((state) => job(db, state, { id: state }));
  assert.equal(checkQuiescence(path).quiet, true);
});

for (const state of ['paused', 'stopped']) {
  test(`reserved paid request blocks even when its plan was ${state}`, (t) => {
    const { db, path } = fixture(t);
    job(db, state, { plan: 'synthetic-plan' });
    usage(db, 'reserved', { plan: 'synthetic-plan' });
    const result = checkQuiescence(path);
    expectsBlocked(result, 'reserved_paid_requests', 'reservedUsage');
    assert.equal(result.counts.activeJobs, 0);
  });
}

test('a reserved premium sample blocks without any job or plan', (t) => {
  const { db, path } = fixture(t);
  usage(db, 'reserved');
  expectsBlocked(checkQuiescence(path), 'reserved_paid_requests', 'reservedUsage');
});

test('settled known/unknown/no-charge requests are retained as rollback evidence', (t) => {
  const { db, path } = fixture(t);
  ['known', 'unknown', 'none'].forEach((status) => usage(db, status, { id: status }));
  const result = checkQuiescence(path);
  assert.equal(result.quiet, true);
  assert.equal(result.usageCount, 3);
  assert.equal(result.counts.knownUsage, 1);
  assert.equal(result.counts.unknownUsage, 1);
  assert.equal(result.counts.noChargeUsage, 1);
});

for (const state of ['queued', 'reading', 'finding_chapters', 'preparing_text', 'a_future_import_stage']) {
  test(`unfinished import ${state} blocks`, (t) => {
    const { db, path } = fixture(t);
    db.prepare('INSERT INTO imports(id,state,file_name,created_at) VALUES(?,?,?,?)')
      .run('synthetic-import', state, 'synthetic.txt', at);
    const result = checkQuiescence(path);
    expectsBlocked(result, 'active_imports', 'activeImports');
    if (state === 'a_future_import_stage') assert.ok(result.reasons.includes('unknown_work_state'));
  });
}

for (const state of ['queued', 'running']) {
  test(`${state} export blocks independently of jobs`, (t) => {
    const { db, path } = fixture(t);
    audiobook(db);
    db.prepare(`INSERT INTO exports(id,audiobook_id,state,format,job_id,created_at)
      VALUES('synthetic-export','synthetic-audiobook',?,'m4b','synthetic-job',?)`).run(state, at);
    expectsBlocked(checkQuiescence(path), 'active_exports', 'activeExports');
  });
}

test('running backup blocks independently of jobs', (t) => {
  const { db, path } = fixture(t);
  db.prepare("INSERT INTO backups(id,state,created_at) VALUES('synthetic-backup','running',?)").run(at);
  expectsBlocked(checkQuiescence(path), 'active_backups', 'activeBackups');
});

test('pending deletion blocks even when scheduled far in the future', (t) => {
  const { db, path } = fixture(t);
  db.prepare(`INSERT INTO deletions(book_id,prior_state,state,scheduled_at,executes_at,scheduled_by)
    VALUES('synthetic-book','readable','pending',?,'2099-01-01T00:00:00.000Z','{}')`).run(at);
  expectsBlocked(checkQuiescence(path), 'pending_deletions', 'pendingDeletions');
});

test('terminal imports/exports/backups/deletions are quiet', (t) => {
  const { db, path } = fixture(t);
  audiobook(db);
  for (const state of ['done', 'failed', 'cancelled']) {
    db.prepare('INSERT INTO imports(id,state,file_name,created_at) VALUES(?,?,?,?)').run(state, state, 'synthetic.txt', at);
  }
  for (const state of ['ready', 'failed']) {
    db.prepare(`INSERT INTO exports(id,audiobook_id,state,format,job_id,created_at)
      VALUES(?,'synthetic-audiobook',?,'m4b','synthetic-job',?)`).run(state, state, at);
  }
  for (const state of ['done', 'failed']) {
    db.prepare('INSERT INTO backups(id,state,created_at) VALUES(?,?,?)').run(state, state, at);
  }
  for (const state of ['cancelled', 'done']) {
    db.prepare(`INSERT INTO deletions(book_id,prior_state,state,scheduled_at,executes_at,scheduled_by)
      VALUES(?,'readable',?,?,?,'{}')`).run(state, state, at, at);
  }
  assert.equal(checkQuiescence(path).quiet, true);
});

test('unknown job kinds and unknown persisted states fail closed', (t) => {
  const { db, path } = fixture(t);
  job(db, 'completed', { kind: 'a_future_worker' });
  db.exec("PRAGMA ignore_check_constraints=ON; UPDATE jobs SET state='a_future_state'");
  const result = checkQuiescence(path);
  expectsBlocked(result, 'unknown_job_kind', 'unknownJobKinds');
  assert.ok(result.reasons.includes('unknown_work_state'));
  assert.equal(result.counts.unknownStates, 1);
});

test('all busy categories are reported together in stable order', (t) => {
  const { db, path } = fixture(t);
  job(db, 'running');
  job(db, 'paused', { id: 'paused', current: 'synthetic-chapter' });
  db.prepare("INSERT INTO imports(id,state,file_name,created_at) VALUES('i','queued','synthetic.txt',?)").run(at);
  audiobook(db);
  db.prepare(`INSERT INTO exports(id,audiobook_id,state,format,job_id,created_at)
    VALUES('e','synthetic-audiobook','running','m4b','synthetic-job',?)`).run(at);
  db.prepare("INSERT INTO backups(id,state,created_at) VALUES('b','running',?)").run(at);
  usage(db, 'reserved');
  db.prepare(`INSERT INTO deletions(book_id,prior_state,state,scheduled_at,executes_at,scheduled_by)
    VALUES('d','readable','pending',?,?,'{}')`).run(at, at);
  assert.deepEqual(checkQuiescence(path).reasons, [
    'active_jobs', 'paused_chapter_in_flight', 'active_imports', 'active_exports',
    'active_backups', 'reserved_paid_requests', 'pending_deletions',
  ]);
});

test('a live WAL snapshot sees an uncheckpointed reservation', (t) => {
  const { db, path } = fixture(t, { wal: true });
  assert.equal(checkQuiescence(path).quiet, true);
  usage(db, 'reserved');
  assert.ok(existsSync(`${path}-wal`));
  expectsBlocked(checkQuiescence(path), 'reserved_paid_requests', 'reservedUsage');
  db.exec("UPDATE spend SET status='known'");
  assert.equal(checkQuiescence(path).quiet, true);
});

test('stopped WAL database is read without recreating sidecars or changing its bytes', (t) => {
  const { path, directory, close } = fixture(t, { wal: true });
  close();
  assert.equal(existsSync(`${path}-wal`), false);
  assert.equal(existsSync(`${path}-shm`), false);
  const before = createHash('sha256').update(readFileSync(path)).digest('hex');
  chmodSync(directory, 0o500);
  try {
    const result = checkQuiescence(path, { stopped: true });
    assert.equal(result.quiet, true);
    assert.equal(result.serverId, serverId);
    assert.equal(result.usageCount, 0);
    assert.deepEqual(readdirSync(directory), ['bardic.db']);
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), before);
  } finally {
    chmodSync(directory, 0o700);
  }
});

test('stopped probe refuses a committed paid reservation still in the WAL', (t) => {
  const { db, path } = fixture(t, { wal: true });
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  usage(db, 'reserved');
  assert.ok(statSync(`${path}-wal`).size > 0);
  expectsBlocked(checkQuiescence(path), 'reserved_paid_requests', 'reservedUsage');
  assert.deepEqual(checkQuiescence(path, { stopped: true }), {
    quiet: false, reasons: ['stopped_wal_not_empty'], schemaVersion: null,
  });
});

test('stopped probe allows an empty WAL but rejects any rollback journal', (t) => {
  const { path, close } = fixture(t, { wal: true });
  close();
  writeFileSync(`${path}-wal`, '');
  assert.equal(checkQuiescence(path, { stopped: true }).quiet, true);
  for (const body of ['', 'synthetic unfinished rollback']) {
    writeFileSync(`${path}-journal`, body);
    assert.deepEqual(checkQuiescence(path, { stopped: true }), {
      quiet: false, reasons: ['stopped_journal_present'], schemaVersion: null,
    });
  }
});

test('stopped sidecar guard rejects a non-file WAL and a dangling journal symlink', (t) => {
  const { path, close } = fixture(t, { wal: true });
  close();
  symlinkSync(`${path}-not-a-file`, `${path}-wal`);
  assert.deepEqual(checkQuiescence(path, { stopped: true }), {
    quiet: false, reasons: ['stopped_wal_not_empty'], schemaVersion: null,
  });
  rmSync(`${path}-wal`);
  symlinkSync(`${path}-not-a-file`, `${path}-journal`);
  assert.deepEqual(checkQuiescence(path, { stopped: true }), {
    quiet: false, reasons: ['stopped_journal_present'], schemaVersion: null,
  });
});

test('stopped URI safely represents literal path punctuation and CLI accepts either flag position', (t) => {
  const { path, directory, close } = fixture(t, { wal: true });
  close();
  const punctuated = join(directory, 'synthetic ?#% database.db');
  renameSync(path, punctuated);
  assert.equal(checkQuiescence(punctuated, { stopped: true }).quiet, true);
  for (const args of [[punctuated, '--stopped'], ['--stopped', punctuated]]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).quiet, true);
  }
  const invalid = spawnSync(process.execPath, [script, punctuated, '--stopped', '--stopped'], { encoding: 'utf8' });
  assert.equal(invalid.status, 0);
  assert.deepEqual(JSON.parse(invalid.stdout), { quiet: false, reasons: ['invalid_arguments'], schemaVersion: null });
});

test('pinned Node 24 stopped probe works on an actual read-only WAL bind', {
  skip: process.env.BARDIC_PROBE_DOCKER_TEST !== '1',
}, (t) => {
  const { db, path, directory, close } = fixture(t, { wal: true });
  retainedRequest(db);
  close();
  assert.equal(existsSync(`${path}-wal`), false);
  assert.equal(existsSync(`${path}-shm`), false);
  const before = createHash('sha256').update(readFileSync(path)).digest('hex');
  const run = (args) => {
    const processResult = spawnSync('docker', [
      'run', '--rm', '--network', 'none', '--read-only',
      '--mount', `type=bind,src=${realpathSync(directory)},dst=/data,readonly`,
      '--mount', `type=bind,src=${realpathSync(script)},dst=/probe.mjs,readonly`,
      pinnedNode, 'node', '--no-warnings', '/probe.mjs', ...args,
    ], { encoding: 'utf8', timeout: 60_000 });
    assert.equal(processResult.status, 0, 'disposable readonly Docker probe failed');
    return JSON.parse(processResult.stdout);
  };
  assert.equal(run([]).quiet, false, 'ordinary WAL reader cannot create sidecars on the read-only bind');
  for (const args of [['--stopped'], ['/data/bardic.db', '--stopped']]) {
    const result = run(args);
    assert.equal(result.quiet, true);
    assert.equal(result.serverId, serverId);
    assert.equal(result.usageCount, 0);
  }
  writeFileSync(`${path}-wal`, 'synthetic nonempty WAL guard');
  assert.deepEqual(run(['--stopped']), { quiet: false, reasons: ['stopped_wal_not_empty'], schemaVersion: null });
  rmSync(`${path}-wal`);
  assert.deepEqual(readdirSync(directory), ['bardic.db']);
  assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), before);
});

test('probing neither mutates the database nor reflects synthetic secrets/text', (t) => {
  const { db, path, close } = fixture(t);
  const privateMarker = 'SYNTHETIC-PRIVATE-NOT-FOR-OUTPUT';
  db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('private-test-value', privateMarker);
  db.prepare("UPDATE voice_sources SET config=? WHERE id='gemini'").run(JSON.stringify({ api_key: privateMarker }));
  db.prepare("INSERT INTO books(id,title,state,added_at) VALUES('synthetic',?,'readable',?)").run(privateMarker, at);
  close();
  const before = createHash('sha256').update(readFileSync(path)).digest('hex');
  const beforeStat = statSync(path);
  const output = JSON.stringify(checkQuiescence(path));
  assert.equal(JSON.parse(output).quiet, true);
  assert.ok(!output.includes(privateMarker));
  assert.ok(!output.includes(path));
  assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), before);
  assert.equal(statSync(path).mtimeMs, beforeStat.mtimeMs);
});

for (const version of [0, 10, 15]) {
  test(`unsupported schema ${version} fails closed`, (t) => {
    const { db, path } = fixture(t);
    db.exec(`PRAGMA user_version=${version}`);
    assert.deepEqual(checkQuiescence(path), { quiet: false, reasons: ['unsupported_schema'], schemaVersion: version });
  });
}

test('a bootstrap database is not silently treated as quiet', (t) => {
  const { path } = fixture(t, { migrated: false });
  assert.deepEqual(checkQuiescence(path), { quiet: false, reasons: ['unsupported_schema'], schemaVersion: 0 });
});

test('a missing database fails closed without creating a file', (t) => {
  const { directory } = fixture(t);
  const missing = join(directory, 'not-created.db');
  assert.deepEqual(checkQuiescence(missing), { quiet: false, reasons: ['database_missing'], schemaVersion: null });
  assert.equal(existsSync(missing), false);
});

test('a non-database file and a directory fail closed without leaking errors', (t) => {
  const { directory } = fixture(t);
  const invalid = join(directory, 'not-sqlite');
  writeFileSync(invalid, 'synthetic-private-garbage');
  const result = checkQuiescence(invalid);
  assert.equal(result.quiet, false);
  assert.ok(['database_unavailable', 'query_failed'].includes(result.reasons[0]));
  assert.equal(result.schemaVersion, null);
  assert.equal(checkQuiescence(directory).quiet, false);
  assert.ok(!JSON.stringify(result).includes('synthetic-private-garbage'));
});

for (const table of ['jobs', 'imports', 'exports', 'backups', 'spend', 'job_items', 'deletions', 'voice_sources', 'chapter_parts', 'chapter_requests']) {
  test(`schema claiming version ${SUPPORTED_SCHEMA_VERSION} but missing ${table} fails closed`, (t) => {
    const { db, path } = fixture(t);
    db.exec(`DROP TABLE ${table}`);
    assert.deepEqual(checkQuiescence(path), { quiet: false, reasons: ['schema_mismatch'], schemaVersion: SUPPORTED_SCHEMA_VERSION });
  });
}

test('a missing queried column fails closed', (t) => {
  const { db, path } = fixture(t);
  db.exec('ALTER TABLE jobs RENAME COLUMN current_chapter_id TO old_current_chapter_id');
  assert.deepEqual(checkQuiescence(path), { quiet: false, reasons: ['schema_mismatch'], schemaVersion: SUPPORTED_SCHEMA_VERSION });
});

test('missing or invalid identity fails closed and is never reflected', (t) => {
  const { db, path } = fixture(t, { identity: false });
  assert.deepEqual(checkQuiescence(path), { quiet: false, reasons: ['server_identity_missing'], schemaVersion: SUPPORTED_SCHEMA_VERSION });
  db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('server_id', 'synthetic-private-invalid-id');
  assert.deepEqual(checkQuiescence(path), { quiet: false, reasons: ['server_identity_invalid'], schemaVersion: SUPPORTED_SCHEMA_VERSION });
});

test('CLI always emits one fixed-schema JSON line and exit 0; quiet must be checked explicitly', (t) => {
  const { db, path } = fixture(t);
  job(db, 'running');
  const run = (args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  const busy = run([path]);
  assert.equal(busy.status, 0);
  assert.equal(busy.stdout.trim().split('\n').length, 1);
  expectsBlocked(JSON.parse(busy.stdout), 'active_jobs', 'activeJobs');
  const missing = run([join(path, 'missing')]);
  assert.equal(missing.status, 0);
  assert.equal(JSON.parse(missing.stdout).quiet, false);
  const argumentsError = run([path, 'unexpected']);
  assert.equal(argumentsError.status, 0);
  assert.deepEqual(JSON.parse(argumentsError.stdout), { quiet: false, reasons: ['invalid_arguments'], schemaVersion: null });
});

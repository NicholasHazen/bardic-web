#!/usr/bin/env node
// Run with Node 24, no network, and the whole data directory mounted read-only.
// This is a point-in-time admission check, not a substitute for stopping the server
// before a full-data rollback snapshot. Stopped jobs can still be committing audio.
// When migrations change, support both deployed and candidate schemas here and
// exercise the candidate's synthetic database before closing the live gateway.
// --stopped is only valid after the controller confirms the server is stopped.
// It uses SQLite immutable mode so a clean WAL database needs no new sidecars
// on the read-only mount. Never use it on a live, merely quiet database.
import { lstatSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

// Reviewed migration prefixes: 12 adds chapter pagination and 13 adds job
// generation metadata. Neither changes the work/usage states checked below.
export const SUPPORTED_SCHEMA_VERSIONS = Object.freeze([11, 12, 13]);
export const SUPPORTED_SCHEMA_VERSION = 13;

const TABLES = [
  'meta', 'devices', 'audit', 'listeners', 'listener_settings', 'books', 'chapters',
  'lines', 'imports', 'places', 'place_history', 'voice_sources', 'voices',
  'audiobooks', 'audio', 'jobs', 'job_items', 'voice_samples', 'prices', 'allowance',
  'spend', 'estimates', 'plans', 'chapter_parts', 'deletions', 'exports', 'backups',
];

const COLUMNS = {
  meta: ['key', 'value'],
  jobs: ['id', 'kind', 'state', 'current_chapter_id'],
  job_items: ['job_id', 'chapter_id', 'state'],
  imports: ['state'],
  exports: ['state'],
  backups: ['state'],
  spend: ['status'],
  deletions: ['state'],
};

// No raw exceptions, paths, job identifiers, book facts or configuration values
// are returned. Only server_id is read from meta; provider configuration is never read.
const blocked = (reason, schemaVersion = null) => ({ quiet: false, reasons: [reason], schemaVersion });

function count(db, sql, ...parameters) {
  const value = db.prepare(sql).get(...parameters)?.count;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('invalid_count');
  return value;
}

function matchesSchema(db, schemaVersion) {
  const tableCount = count(db,
    `SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name IN (${TABLES.map(() => '?').join(',')})`,
    ...TABLES);
  if (tableCount !== TABLES.length) return false;
  const columnsForSchema = { ...COLUMNS };
  if (schemaVersion >= 12) columnsForSchema.chapters = ['page_count'];
  if (schemaVersion >= 13) columnsForSchema.jobs = [...COLUMNS.jobs, 'generation'];
  for (const [table, columns] of Object.entries(columnsForSchema)) {
    const columnCount = count(db,
      `SELECT COUNT(*) AS count FROM pragma_table_info(?) WHERE name IN (${columns.map(() => '?').join(',')})`,
      table, ...columns);
    if (columnCount !== columns.length) return false;
  }
  return true;
}

export function checkQuiescence(databasePath = '/data/bardic.db', { stopped = false } = {}) {
  try {
    if (!statSync(databasePath).isFile()) return blocked('database_unavailable');
  } catch (error) {
    return blocked(error?.code === 'ENOENT' ? 'database_missing' : 'database_unavailable');
  }

  if (stopped) {
    // An immutable main file must not hide outstanding WAL/journal work. A
    // graceful last writer checkpoints and removes sidecars; an empty WAL is
    // harmless, but any unreadable, non-file or nonempty WAL fails closed.
    try {
      const wal = lstatSync(`${databasePath}-wal`);
      if (!wal.isFile() || wal.size > 0) return blocked('stopped_wal_not_empty');
    } catch (error) {
      if (error?.code !== 'ENOENT') return blocked('database_unavailable');
    }
    try {
      lstatSync(`${databasePath}-journal`);
      return blocked('stopped_journal_present');
    } catch (error) {
      if (error?.code !== 'ENOENT') return blocked('database_unavailable');
    }
  }

  let db;
  let schemaVersion = null;
  let result;
  try {
    let location = databasePath;
    if (stopped) {
      // Pass a URI string: a URL object is converted to a plain filesystem path
      // by Node and discards SQLite query parameters. pathToFileURL safely
      // escapes literal ?, # and % characters in the owner's data path.
      const uri = pathToFileURL(resolve(databasePath));
      uri.searchParams.set('mode', 'ro');
      uri.searchParams.set('immutable', '1');
      location = uri.href;
    }
    db = new DatabaseSync(location, { readOnly: true, allowExtension: false });
    // A single read transaction keeps all evidence in the same WAL snapshot.
    // These connection settings never change the database or its journal mode.
    db.exec('PRAGMA query_only = ON; PRAGMA trusted_schema = OFF; PRAGMA busy_timeout = 1000; BEGIN');
    schemaVersion = db.prepare('PRAGMA user_version').get()?.user_version;
    if (!Number.isSafeInteger(schemaVersion) || !SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion)) {
      result = blocked('unsupported_schema', Number.isSafeInteger(schemaVersion) ? schemaVersion : null);
    } else if (!matchesSchema(db, schemaVersion)) {
      result = blocked('schema_mismatch', schemaVersion);
    } else {
      const serverId = db.prepare("SELECT value FROM meta WHERE key = 'server_id'").get()?.value;
      // Bardic stores an uppercase ULID. Reject arbitrary values rather than
      // reflecting data from an unrelated or malformed database into updater logs.
      if (serverId === undefined) {
        result = blocked('server_identity_missing', schemaVersion);
      } else if (typeof serverId !== 'string' || !/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(serverId)) {
        result = blocked('server_identity_invalid', schemaVersion);
      } else {
        const counts = {
          activeJobs: count(db, "SELECT COUNT(*) AS count FROM jobs WHERE state IN ('queued','running','waiting')"),
          // Pause does not interrupt premium work. Its current chapter can keep
          // admitting paid chunks even between reservations, until the item ends.
          pausedInFlightJobs: count(db, `SELECT COUNT(*) AS count FROM jobs j
            WHERE j.state = 'paused' AND j.current_chapter_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM job_items i WHERE i.job_id = j.id
              AND i.chapter_id = j.current_chapter_id AND i.state IN ('done','failed','skipped'))`),
          activeImports: count(db, "SELECT COUNT(*) AS count FROM imports WHERE state NOT IN ('done','failed','cancelled') OR state IS NULL"),
          activeExports: count(db, "SELECT COUNT(*) AS count FROM exports WHERE state NOT IN ('ready','failed') OR state IS NULL"),
          activeBackups: count(db, "SELECT COUNT(*) AS count FROM backups WHERE state NOT IN ('done','failed') OR state IS NULL"),
          reservedUsage: count(db, "SELECT COUNT(*) AS count FROM spend WHERE status = 'reserved'"),
          pendingDeletions: count(db, "SELECT COUNT(*) AS count FROM deletions WHERE state = 'pending'"),
          unknownJobKinds: count(db, "SELECT COUNT(*) AS count FROM jobs WHERE kind NOT IN ('make_audio','export') OR kind IS NULL"),
          unknownStates: count(db, `SELECT
            (SELECT COUNT(*) FROM jobs WHERE state NOT IN ('queued','running','waiting','paused','needs_you','completed','stopped','failed') OR state IS NULL) +
            (SELECT COUNT(*) FROM job_items WHERE state NOT IN ('queued','done','failed','skipped') OR state IS NULL) +
            (SELECT COUNT(*) FROM imports WHERE state NOT IN ('queued','reading','finding_chapters','preparing_text','done','failed','cancelled') OR state IS NULL) +
            (SELECT COUNT(*) FROM exports WHERE state NOT IN ('queued','running','ready','failed') OR state IS NULL) +
            (SELECT COUNT(*) FROM backups WHERE state NOT IN ('running','done','failed') OR state IS NULL) +
            (SELECT COUNT(*) FROM spend WHERE status NOT IN ('reserved','known','unknown','none') OR status IS NULL) +
            (SELECT COUNT(*) FROM deletions WHERE state NOT IN ('pending','cancelled','done') OR state IS NULL) AS count`),
          knownUsage: count(db, "SELECT COUNT(*) AS count FROM spend WHERE status = 'known'"),
          unknownUsage: count(db, "SELECT COUNT(*) AS count FROM spend WHERE status = 'unknown'"),
          noChargeUsage: count(db, "SELECT COUNT(*) AS count FROM spend WHERE status = 'none'"),
        };
        const reasons = [];
        for (const [field, reason] of [
          ['activeJobs', 'active_jobs'],
          ['pausedInFlightJobs', 'paused_chapter_in_flight'],
          ['activeImports', 'active_imports'],
          ['activeExports', 'active_exports'],
          ['activeBackups', 'active_backups'],
          ['reservedUsage', 'reserved_paid_requests'],
          ['pendingDeletions', 'pending_deletions'],
          ['unknownJobKinds', 'unknown_job_kind'],
          ['unknownStates', 'unknown_work_state'],
        ]) {
          if (counts[field] > 0) reasons.push(reason);
        }
        result = {
          quiet: reasons.length === 0,
          reasons,
          schemaVersion,
          serverId,
          usageCount: count(db, 'SELECT COUNT(*) AS count FROM spend'),
          counts,
        };
      }
    }
  } catch {
    result = blocked(db ? 'query_failed' : 'database_unavailable', schemaVersion);
  } finally {
    if (db) {
      // Cleanup must also fail closed, while preserving the one-line JSON protocol.
      try { db.close(); } catch { result = blocked('query_failed', schemaVersion); }
    }
  }
  return result;
}

// Busy, missing, unsupported and unreadable databases all produce JSON with
// quiet:false and exit 0. The caller must require quiet === true, never infer it
// from a successful process exit. A malformed invocation follows the same rule.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  const flags = args.filter((arg) => arg === '--stopped');
  const paths = args.filter((arg) => arg !== '--stopped');
  const result = paths.length > 1 || flags.length > 1 || paths.some((arg) => arg.startsWith('--'))
    ? blocked('invalid_arguments')
    : checkQuiescence(paths[0], { stopped: flags.length === 1 });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

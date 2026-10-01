import { describe, expect, it, vi } from 'vitest';
import {
  CLOSED,
  DEFAULT_MAX_BYTES,
  ImportController,
  decideAfterCheck,
  existingDetail,
  fileKind,
  importErrorCopy,
  importReducer,
  overallProgress,
  sha256Hex,
  stageOf,
  stepStates,
  validateFile,
  type DuplicateBook,
  type ImportDeps,
  type ImportState,
  type ServerImport,
} from './imports';

const dup = (over: Partial<DuplicateBook> = {}): DuplicateBook => ({
  book_id: 'b1',
  title: 'The Ash Ledger',
  author: 'Odile Brandt',
  added_at: '2026-03-12T10:00:00Z',
  state: 'readable',
  ...over,
});
const file = (name = 'the-ash-ledger.epub', body = 'abc', type = '') => new File([body], name, { type });

describe('fingerprint', () => {
  it('is the lowercase hex SHA-256 of the bytes', async () => {
    expect(await sha256Hex(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await sha256Hex(new Blob([]))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('matches the contract pattern', async () => {
    expect(await sha256Hex(new Blob(['x']))).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('the file', () => {
  it('knows EPUB and text by name or type', () => {
    expect(fileKind('A.EPUB')).toBe('EPUB');
    expect(fileKind('notes.txt')).toBe('Text');
    expect(fileKind('x.bin', 'text/plain')).toBe('Text');
    expect(fileKind('x.pdf')).toBeNull();
  });
  it('is checked before anything is sent', () => {
    expect(validateFile({ name: 'a.epub', size: 10, type: '' })).toBeNull();
    expect(validateFile({ name: 'a.pdf', size: 10, type: '' })).toBe('import_unsupported_type');
    expect(validateFile({ name: 'a.txt', size: 0, type: '' })).toBe('import_no_text');
    expect(validateFile({ name: 'a.epub', size: DEFAULT_MAX_BYTES + 1, type: '' })).toBe('import_too_large');
    expect(validateFile({ name: 'a.epub', size: 5_000, type: '' }, 4_000)).toBe('import_too_large');
  });
});

describe('already in your library (A3)', () => {
  it('uploads when nothing matches exactly, even if titles are alike', () => {
    expect(decideAfterCheck({ exact: [] })).toEqual({ kind: 'upload' });
  });
  it('offers the existing book for an exact match', () => {
    const d = decideAfterCheck({ exact: [dup()] });
    expect(d).toMatchObject({ kind: 'duplicate', action: 'open' });
  });
  it('offers Restore when the match was removed', () => {
    const d = decideAfterCheck({ exact: [dup({ state: 'removed' })] });
    expect(d).toMatchObject({ kind: 'duplicate', action: 'restore' });
  });
  it('prefers a live copy over a removed one, and the newest of several', () => {
    const d = decideAfterCheck({
      exact: [dup({ book_id: 'old', added_at: '2026-01-01T00:00:00Z' }), dup({ book_id: 'gone', state: 'removed', added_at: '2026-06-01T00:00:00Z' }), dup({ book_id: 'new', added_at: '2026-04-01T00:00:00Z' })],
    });
    expect(d).toMatchObject({ action: 'open', existing: { book_id: 'new' } });
  });
  it('ignores a book that is being deleted', () => {
    expect(decideAfterCheck({ exact: [dup({ state: 'deleting' })] })).toEqual({ kind: 'upload' });
  });
  it('words the existing book', () => {
    expect(existingDetail('2026-03-12T12:00:00Z', 0.34)).toBe('Added 12 March · 34% listened');
    expect(existingDetail('2026-03-12T12:00:00Z', null)).toBe('Added 12 March');
  });
});

describe('error copy', () => {
  it('uses the board’s words for DRM', () => {
    expect(importErrorCopy('import_drm_protected')).toEqual({
      title: 'This EPUB is protected',
      body: 'Bardic can’t open books with DRM.',
      can: ['Choose an EPUB without DRM', 'Choose a plain text (.txt) copy', 'Buy a DRM-free edition from the publisher'],
      action: 'Choose another file',
    });
  });
  it('says nothing was added for every other file problem', () => {
    for (const code of ['import_unreadable', 'import_unsupported_encoding', 'import_no_text', 'import_too_large', 'import_network', 'whatever']) {
      const c = importErrorCopy(code);
      expect(c.title.length).toBeGreaterThan(0);
      if (code !== 'import_unsupported_type') expect(c.body).toMatch(/Nothing was added|can be up to/);
    }
  });
  it('quotes the server’s limit', () => {
    expect(importErrorCopy('import_too_large', 10 * 1024 * 1024).body).toContain('10 MB');
  });
  it('offers Try again only when the file was not the problem', () => {
    expect(importErrorCopy('import_network').action).toBe('Try again');
    expect(importErrorCopy('import_drm_protected').action).toBe('Choose another file');
  });
});

describe('stages and progress', () => {
  it('maps server states to stages', () => {
    expect(stageOf('queued')).toBe('reading');
    expect(stageOf('finding_chapters')).toBe('finding_chapters');
    expect(stageOf('done')).toBeNull();
  });
  it('marks earlier steps done, the current one active', () => {
    expect(stepStates('finding_chapters').map((s) => s.state)).toEqual(['done', 'active', 'pending']);
  });
  it('fills 30% while uploading, then the server’s share', () => {
    expect(overallProgress({ stage: 'reading', uploaded: 0.5, uploading: true })).toBeCloseTo(0.15);
    expect(overallProgress({ stage: 'finding_chapters', uploaded: 1, serverProgress: 0.5, uploading: false })).toBeCloseTo(0.65);
    expect(overallProgress({ stage: 'preparing_text', uploaded: 1, serverProgress: 1, uploading: false })).toBeLessThan(1);
  });
  it('falls back to the stage when the server gives no figure', () => {
    expect(overallProgress({ stage: 'finding_chapters', uploaded: 1, serverProgress: null, uploading: false })).toBeGreaterThan(0.5);
  });
});

const info = { name: 'a.epub', size: 100, kind: 'EPUB' as const };
const imp = (over: Partial<ServerImport>): ServerImport => ({
  id: 'i1',
  state: 'reading',
  file_name: 'a.epub',
  created_at: '2026-03-12T10:00:00Z',
  book_id: null,
  error: null,
  ...over,
});

describe('state machine', () => {
  const run = (...actions: Parameters<typeof importReducer>[1][]) => actions.reduce<ImportState>((s, a) => importReducer(s, a), CLOSED);

  it('goes choose, chosen, and back when the file is removed', () => {
    expect(run({ type: 'open' }).kind).toBe('choose');
    expect(run({ type: 'open' }, { type: 'pick', file: info }).kind).toBe('chosen');
    expect(run({ type: 'open' }, { type: 'pick', file: info }, { type: 'remove' }).kind).toBe('choose');
  });
  it('does not skip steps', () => {
    expect(run({ type: 'check' }).kind).toBe('closed');
    expect(run({ type: 'open' }, { type: 'start-upload' }).kind).toBe('choose');
  });
  it('follows the server to done with the book id', () => {
    const s = run(
      { type: 'open' },
      { type: 'pick', file: info },
      { type: 'check' },
      { type: 'start-upload' },
      { type: 'server', import: imp({ state: 'finding_chapters', progress: 0.4 }) },
      { type: 'server', import: imp({ state: 'done', book_id: 'b9' }) },
    );
    expect(s).toEqual({ kind: 'done', file: info, bookId: 'b9' });
  });
  it('never moves the bar backwards', () => {
    let s = run({ type: 'open' }, { type: 'pick', file: info }, { type: 'check' }, { type: 'start-upload' }, { type: 'server', import: imp({ state: 'preparing_text', progress: 0.9 }) });
    const before = s.kind === 'adding' ? s.progress : 0;
    s = importReducer(s, { type: 'server', import: imp({ state: 'reading', progress: 0.1 }) });
    expect(s.kind === 'adding' && s.progress).toBeGreaterThanOrEqual(before);
  });
  it('turns a failed import into the copy for its code', () => {
    const s = run(
      { type: 'open' },
      { type: 'pick', file: info },
      { type: 'check' },
      { type: 'start-upload' },
      { type: 'server', import: imp({ state: 'failed', error: { code: 'import_drm_protected', detail: 'x' } }) },
    );
    expect(s).toMatchObject({ kind: 'failed', code: 'import_drm_protected', copy: { title: 'This EPUB is protected' } });
  });
  it('closes on a cancelled import', () => {
    const s = run({ type: 'open' }, { type: 'pick', file: info }, { type: 'check' }, { type: 'start-upload' }, { type: 'server', import: imp({ state: 'cancelled' }) });
    expect(s.kind).toBe('closed');
  });
});

function fakeDeps(over: Partial<ImportDeps> & { polls?: ServerImport[] } = {}) {
  const polls = [...(over.polls ?? [])];
  const calls: string[] = [];
  const deps: ImportDeps = {
    maxBytes: () => undefined,
    sha256: async () => (calls.push('sha'), 'a'.repeat(64)),
    findDuplicates: async () => (calls.push('check'), { exact: [], similar: [] }),
    describeExisting: async () => 'Added 12 March · 34% listened',
    upload: async (_f, o) => {
      calls.push('upload');
      o.onProgress(0.5);
      return { status: 202, import: imp({ state: 'queued' }) };
    },
    getImport: async () => (calls.push('poll'), polls.shift() ?? imp({ state: 'done', book_id: 'b1' })),
    cancelImport: async (id) => void calls.push(`cancel:${id}`),
    restoreBook: async (id) => void calls.push(`restore:${id}`),
    sleep: async () => {},
    newKey: () => 'key',
    ...over,
  };
  return { deps, calls };
}

describe('controller', () => {
  it('checks the library before uploading, then follows the stages to done', async () => {
    const { deps, calls } = fakeDeps({ polls: [imp({ state: 'finding_chapters' }), imp({ state: 'preparing_text' })] });
    const c = new ImportController(deps);
    const changed = vi.fn();
    c.onbookchanged = changed;
    c.open();
    c.pick(file());
    expect(c.state.kind).toBe('chosen');
    await c.add();
    expect(calls.slice(0, 3)).toEqual(['sha', 'check', 'upload']);
    expect(c.state).toMatchObject({ kind: 'done', bookId: 'b1' });
    expect(changed).toHaveBeenCalledWith('b1');
  });

  it('stops at the duplicate sheet and does not upload', async () => {
    const { deps, calls } = fakeDeps({ findDuplicates: async () => ({ exact: [dup()], similar: [] }) });
    const c = new ImportController(deps);
    c.pick(file());
    await c.add();
    expect(c.state).toMatchObject({ kind: 'duplicate', action: 'open', detail: 'Added 12 March · 34% listened' });
    expect(calls).not.toContain('upload');
  });

  it('adds another copy without asking again', async () => {
    const { deps, calls } = fakeDeps({ findDuplicates: async () => ({ exact: [dup()], similar: [] }) });
    const c = new ImportController(deps);
    c.pick(file());
    await c.add();
    calls.length = 0;
    await c.add(true);
    expect(calls).not.toContain('check');
    expect(calls).toContain('upload');
    expect(c.state.kind).toBe('done');
  });

  it('restores a removed book instead of uploading', async () => {
    const { deps, calls } = fakeDeps({ findDuplicates: async () => ({ exact: [dup({ state: 'removed' })], similar: [] }) });
    const c = new ImportController(deps);
    c.pick(file());
    await c.add();
    expect(await c.restoreExisting()).toBe('b1');
    expect(calls).toContain('restore:b1');
    expect(calls).not.toContain('upload');
    expect(c.state.kind).toBe('closed');
  });

  it('shows the DRM message when the server fails the import', async () => {
    const { deps } = fakeDeps({ polls: [imp({ state: 'failed', error: { code: 'import_drm_protected', detail: 'drm' } })] });
    const c = new ImportController(deps);
    c.pick(file());
    await c.add();
    expect(c.state).toMatchObject({ kind: 'failed', copy: { title: 'This EPUB is protected' } });
  });

  it('shows the error of a refused upload (413)', async () => {
    const { deps } = fakeDeps({ upload: async () => ({ status: 413, error: { code: 'import_too_large', detail: 'big' } }) });
    const c = new ImportController(deps);
    c.pick(file());
    await c.add();
    expect(c.state).toMatchObject({ kind: 'failed', code: 'import_too_large' });
  });

  it('refuses a file of the wrong kind without touching the network', () => {
    const { deps, calls } = fakeDeps();
    const c = new ImportController(deps);
    c.pick(file('book.pdf'));
    expect(c.state).toMatchObject({ kind: 'failed', code: 'import_unsupported_type' });
    expect(calls).toEqual([]);
  });

  it('says it could not reach the server when the check throws, and leaves no import', async () => {
    const { deps, calls } = fakeDeps({ findDuplicates: async () => { throw new Error('down'); } });
    const c = new ImportController(deps);
    c.pick(file());
    await c.add();
    expect(c.state).toMatchObject({ kind: 'failed', code: 'import_network' });
    expect(calls).not.toContain('upload');
  });

  it('cancels a running import on the server and closes', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { deps, calls } = fakeDeps({
      polls: [imp({ state: 'finding_chapters' })],
      sleep: async () => gate,
    });
    const c = new ImportController(deps);
    c.pick(file());
    const adding = c.add();
    await vi.waitFor(() => expect(c.state.kind === 'adding' && c.state.importId).toBe('i1'));
    await c.cancel();
    release();
    await adding;
    expect(calls).toContain('cancel:i1');
    expect(c.state.kind).toBe('closed');
  });
});

import { describe, expect, it } from 'vitest';
import { SseParser, followEventStream } from './sse';

describe('SseParser', () => {
  it('reads an event with id and data', () => {
    const p = new SseParser();
    expect(p.feed('id: 7\ndata: {"type":"book.updated"}\n\n')).toEqual([{ id: '7', data: '{"type":"book.updated"}' }]);
  });
  it('waits for the blank line, across chunks', () => {
    const p = new SseParser();
    expect(p.feed('data: {"a"')).toEqual([]);
    expect(p.feed(':1}\n')).toEqual([]);
    expect(p.feed('\n')).toEqual([{ data: '{"a":1}' }]);
  });
  it('joins data lines, skips comments, handles CRLF', () => {
    const p = new SseParser();
    expect(p.feed(': keep-alive\r\nevent: x\r\ndata: one\r\ndata: two\r\n\r\n')).toEqual([{ event: 'x', data: 'one\ntwo' }]);
  });
  it('reads two events in one chunk', () => {
    expect(new SseParser().feed('data: a\n\ndata: b\n\n').map((m) => m.data)).toEqual(['a', 'b']);
  });
});

describe('followEventStream', () => {
  it('sends the identity headers, reports messages, and resumes with Last-Event-ID', async () => {
    const ctl = new AbortController();
    const calls: Record<string, string>[] = [];
    const enc = new TextEncoder();
    const fetchFn = (async (_u: string, init: RequestInit) => {
      calls.push(init.headers as Record<string, string>);
      const body = new ReadableStream({
        start(c) {
          c.enqueue(enc.encode(calls.length === 1 ? 'id: 5\ndata: {"type":"book.updated"}\n\n' : 'data: {"type":"resync"}\n\n'));
          c.close();
        },
      });
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    const got: string[] = [];
    await followEventStream({
      url: '/api/events',
      headers: () => ({ 'X-Bardic-Listener': 'L' }),
      signal: ctl.signal,
      fetchFn,
      sleep: async () => {},
      onmessage: (m) => {
        got.push(m.data);
        if (got.length === 2) ctl.abort();
      },
    });
    expect(got).toHaveLength(2);
    expect(calls[0]).toMatchObject({ 'X-Bardic-Listener': 'L', Accept: 'text/event-stream' });
    expect(calls[1]).toMatchObject({ 'Last-Event-ID': '5' });
  });
});

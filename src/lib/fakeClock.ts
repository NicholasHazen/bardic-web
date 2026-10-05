// A clock for tests: time moves only when the test says so. Not imported by the app.
import type { Clock } from './clock';

export class FakeClock implements Clock {
  private t: number;
  private nextId = 1;
  private timers = new Map<number, { at: number; fn: () => void }>();

  constructor(start = 1_800_000_000_000) {
    this.t = start;
  }

  now(): number {
    return this.t;
  }

  setTimeout(fn: () => void, ms: number): number {
    const id = this.nextId++;
    this.timers.set(id, { at: this.t + Math.max(0, ms), fn });
    return id;
  }

  clearTimeout(id: number): void {
    this.timers.delete(id);
  }

  /** Timers waiting. */
  get pending(): number {
    return this.timers.size;
  }

  /** Let promises settle (a real macrotask turn; this clock never patches globals). */
  async flush(): Promise<void> {
    for (let i = 0; i < 3; i++) await new Promise<void>((r) => setTimeout(r, 0));
  }

  /** Move time forward, running due timers in order and letting promises settle after each. */
  async advance(ms: number): Promise<void> {
    const end = this.t + ms;
    await this.flush();
    for (;;) {
      let nextId: number | undefined;
      let nextAt = Infinity;
      for (const [id, tm] of this.timers) {
        if (tm.at <= end && tm.at < nextAt) {
          nextAt = tm.at;
          nextId = id;
        }
      }
      if (nextId === undefined) break;
      const tm = this.timers.get(nextId)!;
      this.timers.delete(nextId);
      this.t = Math.max(this.t, tm.at);
      tm.fn();
      await this.flush();
    }
    this.t = end;
    await this.flush();
  }
}

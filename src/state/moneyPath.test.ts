// P2 ("nothing paid starts without an approved plan") proved from the source: every call of the client that the
// contract marks `x-bardic-cost: may_charge` is found, and each is made from the one place that is allowed to.
import { describe, expect, it } from 'vitest';
import contract from '../../contract/openapi.yaml?raw';

// Every source file of the client, as text (tests and the generated API types left out), keyed "src/...".
const raw = import.meta.glob<string>('../**/*.{ts,svelte}', { query: '?raw', import: 'default', eager: true });
const files = new Map(
  Object.entries(raw)
    .map(([k, v]) => [k.startsWith('./') ? 'src/state/' + k.slice(2) : 'src/' + k.slice(3), v] as const)
    .filter(([k]) => !/\.test\.ts$/.test(k) && !k.startsWith('src/api/')),
);
const read = (p: string): string => files.get(p) ?? '';
const sources = (): string[] => [...files.keys()];

/** [method, path] of every operation the contract says may charge. */
function mayCharge(): { method: string; path: string }[] {
  const out: { method: string; path: string }[] = [];
  let p = '';
  let method = '';
  for (const line of contract.split('\n')) {
    const mp = /^ {2}(\/api\/\S*):\s*$/.exec(line);
    if (mp) p = mp[1]!;
    const mm = /^ {4}(get|post|put|patch|delete):\s*$/.exec(line);
    if (mm) method = mm[1]!.toUpperCase();
    if (/x-bardic-cost:\s*may_charge/.test(line)) out.push({ method, path: p });
  }
  return out;
}

/** Files that call `api.METHOD('path'`. */
function callers(method: string, p: string): string[] {
  const needle = `api.${method}('${p}'`;
  return sources().filter((f) => read(f).includes(needle));
}

describe('P2: the calls that may charge', () => {
  const found = mayCharge();

  it('the contract names exactly the operations this test knows about', () => {
    expect(found.map((f) => `${f.method} ${f.path}`).sort()).toEqual([
      'GET /api/voices/{voice_id}/sample',
      'POST /api/audiobooks/{audiobook_id}/chapters/{chapter_id}/request',
      'POST /api/plans',
      'POST /api/plans/{plan_id}/resume',
    ]);
  });

  it('createPlan is called from the plan flow and nowhere else', () => {
    expect(callers('POST', '/api/plans')).toEqual(['src/state/plans.ts']);
  });

  it('resumePlan is called from the plan flow and nowhere else', () => {
    expect(callers('POST', '/api/plans/{plan_id}/resume')).toEqual(['src/state/plans.ts']);
  });

  it('a premium sample (counted, the one exception) and a free chapter request are made from their own places only', () => {
    expect(callers('GET', '/api/voices/{voice_id}/sample')).toEqual(['src/state/voices.ts']);
    expect(callers('POST', '/api/audiobooks/{audiobook_id}/chapters/{chapter_id}/request')).toEqual(['src/player/gateway.ts']);
  });

  it('inside the plan flow, createPlan is reached by approve() alone and resumePlan by resume() alone', () => {
    const src = read('src/state/plans.ts');
    expect(src.match(/this\.gw\.create\(/g)).toHaveLength(1);
    expect(src.match(/this\.gw\.resume\(/g)).toHaveLength(1);
    const approve = src.slice(src.indexOf('async approve()'), src.indexOf('private async refused('));
    expect(approve).toContain('this.gw.create(');
    // approve() asks approvalBlock first and sends nothing unless it says null
    expect(approve.indexOf('approvalBlock(')).toBeGreaterThan(-1);
    expect(approve.indexOf('approvalBlock(')).toBeLessThan(approve.indexOf('this.gw.create('));
    const resume = src.slice(src.indexOf('resume(planId: string'), src.indexOf('dismissEnded()'));
    expect(resume).toContain('this.gw.resume(');
  });

  it('only the plan sheet’s Approve button calls approve(), and only the plan card’s buttons call resume()', () => {
    const users = (needle: string) => sources().filter((f) => f !== 'src/state/plans.ts' && read(f).includes(needle));
    expect(sources().length).toBeGreaterThan(100);
    expect(users('planStore.approve(')).toEqual(['src/views/plans/PlanFlow.svelte']);
    expect(users('planStore.resume(')).toEqual(['src/views/plans/RunningPlan.svelte']);
    // the presentational sheets only report the press
    for (const f of ['PlanSheet', 'PlanBlockedView', 'PlanCardView', 'EstimateExplainedView']) {
      const view = read(`src/views/plans/${f}.svelte`);
      expect(view, f).not.toMatch(/planStore|planGateway|api\./);
    }
  });

  it('the book page and the voice chooser open the sheet and nothing more', () => {
    for (const f of ['src/views/book/BookScreen.svelte', 'src/views/voices/VoiceChooserSheet.svelte', 'src/views/book/AudiobookCard.svelte', 'src/views/book/BookView.svelte']) {
      const view = read(f);
      expect(view, f).not.toMatch(/planStore\.(approve|resume)\(|planGateway|\.create\(/);
    }
  });
});

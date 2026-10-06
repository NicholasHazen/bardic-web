// The plan flow, connected to the server (PL1 to PL11, P2): the ONLY way paid audio starts.
//
// Rules kept here (docs/PRODUCT-SPEC.md P2, section 8; AGENTS.md):
// - Opening the sheet, choosing a voice, choosing a scope, editing the limit, asking why, cancelling: none of them
//   calls an operation that may charge. `previewPlan` is free and is the only call the sheet makes by itself.
// - `createPlan` (may_charge) is called from exactly one place: `PlanStore.approve`, which the Approve button of the
//   plan sheet calls. It needs a fresh estimate the listener has seen, a valid limit, and sends each estimate at most
//   once, with an Idempotency-Key. A stale estimate is never approved: it is replaced and the listener decides again.
// - `resumePlan` (also may_charge, on a plan the listener already approved) is called from exactly one place:
//   `PlanStore.resume`, from the Resume or "Continue, up to $X" buttons. A new, higher limit is named on the button.
// - Every refusal is put in words that begin with what is kept (src/lib/planRules.ts).
import { get, writable, type Readable } from 'svelte/store';
import { api } from '../api/client';
import {
  actionProblem,
  approvalBlock,
  approvalProblem,
  checkLimit,
  checkRaise,
  defaultLimit,
  isActivePlan,
  minLimit,
  smallerScope,
  smallerTitle,
  type Plan,
  type PlanEstimate,
  type Problem,
  type Scope,
} from '../lib/planRules';
import { hasMatter, makeOptions, type ChapterAudio, type ChapterInfo, type MakeInput } from '../lib/bookAudio';
import type { ChapterSelectionItem } from '../lib/chapterSelection';
import { moneyText, type Money } from '../lib/money';
import { apiGateway as bookGateway, call, hdr, UNREACHABLE, type BookGateway, type R } from './book';

// --------------------------------------------------------------------------- gateway

export interface PlanGateway {
  /** Free: prices a scope and spends nothing. */
  preview(listenerId: string, audiobookId: string, scope: Scope): Promise<R<PlanEstimate>>;
  /** MAY CHARGE. Called only by PlanStore.approve. */
  create(listenerId: string, input: { estimate_id: string; limit: Money }, key: string): Promise<R<Plan>>;
  /** Plans of a book, newest first. */
  list(bookId: string): Promise<R<Plan[]>>;
  get(planId: string): Promise<R<Plan>>;
  pause(listenerId: string, planId: string): Promise<R<Plan>>;
  stop(listenerId: string, planId: string): Promise<R<Plan>>;
  /** MAY CHARGE (inside the plan's limit, or a higher one the listener typed). Called only by PlanStore.resume. */
  resume(listenerId: string, planId: string, newLimit?: Money): Promise<R<Plan>>;
}

export const planGateway: PlanGateway = {
  preview: (l, ab, scope) => call(() => api.POST('/api/audiobooks/{audiobook_id}/plan-preview', { params: { path: { audiobook_id: ab }, header: hdr(l) }, body: { scope } })),
  create: (l, input, key) => call(() => api.POST('/api/plans', { params: { header: { ...hdr(l), 'Idempotency-Key': key } }, body: input })),
  list: async (bookId) => {
    const r = await call(() => api.GET('/api/plans', { params: { query: { book_id: bookId, limit: 50 } } }));
    return r.ok ? { ok: true, value: r.value?.items ?? [] } : r;
  },
  get: (id) => call(() => api.GET('/api/plans/{plan_id}', { params: { path: { plan_id: id } } })),
  pause: (l, id) => call(() => api.POST('/api/plans/{plan_id}/pause', { params: { path: { plan_id: id }, header: hdr(l) } })),
  stop: (l, id) => call(() => api.POST('/api/plans/{plan_id}/stop', { params: { path: { plan_id: id }, header: hdr(l) } })),
  resume: (l, id, newLimit) =>
    call(() => api.POST('/api/plans/{plan_id}/resume', { params: { path: { plan_id: id }, header: hdr(l) }, ...(newLimit ? { body: { new_limit: newLimit } } : {}) })),
};

// --------------------------------------------------------------------------- state

export interface ScopeChoice {
  /** 'whole', 'from', 'chosen' or 'smaller' */
  id: string;
  title: string;
  detail: string;
  scope: Scope;
  /** Chapters of the scope in reading order, with their words and whether this audiobook already has them. */
  chapters: { id: string; words: number; ready: boolean }[];
}

export type FlowPhase = 'closed' | 'loading' | 'previewing' | 'ready' | 'approving';

export interface FlowState {
  phase: FlowPhase;
  listenerId: string | null;
  bookId: string | null;
  audiobookId: string | null;
  voiceName: string;
  choices: ScopeChoice[];
  selected: string;
  /** Explicit chapter choices, independent of scope and the visible list on the book page. */
  selectedChapterIds: string[];
  chapterChoices: ChapterSelectionItem[];
  /** Independent of the book page's chapter visibility: what this plan will voice. */
  includeMatter: boolean;
  matterAvailable: boolean;
  estimate: PlanEstimate | null;
  /** The limit field as typed. */
  limitText: string;
  limitEdited: boolean;
  /** The estimate that would pass the Allowance, once one has: the sheet then shows [PlanBlocked]. */
  blockedFrom: PlanEstimate | null;
  /** Whether that blocked plan was the whole book. */
  blockedWhole: boolean;
  /** Estimates already sent for approval (each at most once). */
  used: string[];
  /** Estimate of the smaller scope, once priced. */
  smaller: { estimate: PlanEstimate; choice: ScopeChoice } | null;
  explain: boolean;
  notice: Problem | null;
  error: Problem | null;
  /** The plan that was just approved (the sheet has closed). */
  approved: Plan | null;
}

export interface TrackState {
  bookId: string | null;
  /** Plans of the book that are going (running, waiting, paused, needs you), newest first. */
  active: Plan[];
  /** The plan that ended while the page was open (finished, stopped), until dismissed. */
  ended: Plan | null;
  busy: boolean;
  problem: (Problem & { planId: string }) | null;
  /** A resume was refused for the limit: the card opens its "raise the limit" field. */
  raisePlanId: string | null;
}

export interface PlanState {
  flow: FlowState;
  track: TrackState;
}

export const closedFlow = (): FlowState => ({
  phase: 'closed',
  listenerId: null,
  bookId: null,
  audiobookId: null,
  voiceName: '',
  choices: [],
  selected: 'whole',
  selectedChapterIds: [],
  chapterChoices: [],
  includeMatter: false,
  matterAvailable: false,
  estimate: null,
  limitText: '',
  limitEdited: false,
  blockedFrom: null,
  blockedWhole: false,
  used: [],
  smaller: null,
  explain: false,
  notice: null,
  error: null,
  approved: null,
});

export const emptyTrack = (): TrackState => ({ bookId: null, active: [], ended: null, busy: false, problem: null, raisePlanId: null });

export interface OpenParams {
  listenerId: string;
  bookId: string;
  audiobookId: string;
  /** "Kore" */
  voiceName: string;
  initial?: 'whole' | 'from';
}

export type Outcome = { ok: true; plan: Plan } | { ok: false; reason: string };
export type ActionResult = { ok: true } | { ok: false; reason: string };

/** The idempotency key of an approval: one per estimate, so sending the same estimate twice can only ever make one plan. */
export const approvalKey = (estimateId: string) => `approve-${estimateId}`;

interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}
const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

/** How often a plan that is going is read again, in addition to the change notices. */
export const POLL_MS = 3000;
const PREVIEW_SMALLER_TRIES = 3;

export class PlanStore {
  private readonly store = writable<PlanState>({ flow: closedFlow(), track: emptyTrack() });
  readonly subscribe: Readable<PlanState>['subscribe'] = this.store.subscribe;
  private run = 0;
  private trackRun = 0;
  private expiry: unknown;
  private poll: unknown;
  private soon: unknown;
  private listenerId: string | null = null;
  private makeInput: MakeInput | null = null;

  constructor(
    private readonly gw: PlanGateway = planGateway,
    private readonly books: Pick<BookGateway, 'chapters' | 'audioChapters' | 'place'> = bookGateway,
    private readonly now: () => number = Date.now,
    private readonly timers: Timers = realTimers,
  ) {}

  private flow(): FlowState {
    return get(this.store).flow;
  }
  private setFlow(f: Partial<FlowState>): void {
    this.store.update((s) => ({ ...s, flow: { ...s.flow, ...f } }));
  }
  private setTrack(t: Partial<TrackState>): void {
    this.store.update((s) => ({ ...s, track: { ...s.track, ...t } }));
  }

  // ------------------------------------------------------------------- the plan sheet (all free until Approve)

  /** Open the plan sheet. Reads the chapters and prices the scope (free); nothing is requested from the provider. */
  async open(p: OpenParams): Promise<void> {
    const mine = ++this.run;
    this.clearExpiry();
    this.makeInput = null;
    this.store.update((s) => ({ ...s, flow: { ...closedFlow(), phase: 'loading', listenerId: p.listenerId, bookId: p.bookId, audiobookId: p.audiobookId, voiceName: p.voiceName, selected: p.initial ?? 'whole' } }));
    const [chapters, audio, place] = await Promise.all([this.books.chapters(p.bookId), this.books.audioChapters(p.audiobookId), this.books.place(p.listenerId, p.bookId)]);
    if (mine !== this.run) return;
    if (!chapters.ok) {
      this.setFlow({ phase: 'ready', error: { title: 'Nothing was started', text: `Nothing was started and nothing was spent. Audio already made is kept. ${chapters.detail}`, action: 'preview_again' } });
      return;
    }
    const audioMap = new Map<string, ChapterAudio>();
    if (audio.ok) for (const c of audio.value) audioMap.set(c.chapter_id, { state: c.state });
    const infos: (ChapterInfo & { word_count: number })[] = chapters.value.map((c) => ({ id: c.id, title: c.title, kind: c.kind, word_count: c.word_count }));
    this.makeInput = { chapters: infos, audio: audioMap, currentId: place.ok ? place.value?.chapter_id : null };
    const choices = this.scopeChoices(false);
    const selected = choices.some((c) => c.id === p.initial) ? p.initial! : 'whole';
    this.setFlow({ choices, selected, chapterChoices: this.chapterChoices(false), matterAvailable: hasMatter(infos) });
    await this.price(mine);
  }

  private scopeChoices(includeMatter: boolean, selectedChapterIds = this.flow().selectedChapterIds): ScopeChoice[] {
    if (!this.makeInput) return [];
    const { chapters, audio } = this.makeInput;
    const words = new Map(chapters.map((c) => [c.id, c.word_count]));
    return makeOptions({ ...this.makeInput, includeMatter, selectedChapterIds }).map((o) => ({
      id: o.id,
      title: o.title,
      detail: o.detail,
      scope: o.scope as Scope,
      chapters: o.chapterIds.map((id) => ({ id, words: words.get(id) ?? 0, ready: audio.get(id)?.state === 'ready' })),
    }));
  }

  private chapterChoices(includeMatter: boolean): ChapterSelectionItem[] {
    if (!this.makeInput) return [];
    return this.makeInput.chapters.filter((chapter) => includeMatter || chapter.kind === 'story').map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      matter: chapter.kind !== 'story',
      ready: this.makeInput!.audio.get(chapter.id)?.state === 'ready',
    }));
  }

  /** Editing individual chapters only gets a new free preview; every previous estimate is discarded immediately. */
  async setChapters(ids: readonly string[]): Promise<void> {
    const f = this.flow();
    if (f.phase === 'closed' || f.phase === 'approving' || !this.makeInput) return;
    const requested = new Set(ids);
    const selectedChapterIds = this.makeInput.chapters.filter((chapter) => requested.has(chapter.id)).map((chapter) => chapter.id);
    if (f.selected === 'chosen' && selectedChapterIds.length === f.selectedChapterIds.length && selectedChapterIds.every((id, index) => id === f.selectedChapterIds[index])) return;
    const mine = ++this.run;
    this.clearExpiry();
    this.setFlow({
      selected: 'chosen', selectedChapterIds, choices: this.scopeChoices(f.includeMatter, selectedChapterIds),
      phase: 'previewing', estimate: null, limitText: '', limitEdited: false,
      smaller: null, blockedFrom: null, blockedWhole: false, notice: null, error: null, explain: false,
    });
    await this.price(mine);
  }

  /** Changing what is voiced invalidates every estimate, including a cached smaller plan. Repricing is free. */
  async setIncludeMatter(includeMatter: boolean): Promise<void> {
    const f = this.flow();
    if (f.phase === 'closed' || f.phase === 'approving' || !this.makeInput || f.includeMatter === includeMatter) return;
    const mine = ++this.run;
    this.clearExpiry();
    const eligible = new Set(this.chapterChoices(includeMatter).map((chapter) => chapter.id));
    const selectedChapterIds = f.selectedChapterIds.filter((id) => eligible.has(id));
    const choices = this.scopeChoices(includeMatter, selectedChapterIds);
    const requested = f.selected === 'smaller' ? (f.blockedWhole ? 'whole' : 'from') : f.selected;
    const selected = choices.some((c) => c.id === requested) ? requested : 'whole';
    this.setFlow({
      includeMatter, choices, selected, selectedChapterIds, chapterChoices: this.chapterChoices(includeMatter), phase: 'previewing', estimate: null, limitText: '', limitEdited: false,
      smaller: null, blockedFrom: null, blockedWhole: false, notice: null, error: null, explain: false,
    });
    await this.price(mine);
  }

  /** Close the sheet. Nothing is started and nothing is sent; an estimate that was not approved simply lapses. */
  close(): void {
    this.run++;
    this.clearExpiry();
    this.makeInput = null;
    const f = this.flow();
    if (f.phase === 'approving') {
      // The approval is already on its way and cannot be taken back; its answer is handled when it arrives.
      this.setFlow({ phase: 'closed' });
      return;
    }
    this.setFlow({ ...closedFlow(), approved: f.approved });
  }

  /** Choose what to plan: prices it again (free). */
  async select(id: string): Promise<void> {
    const f = this.flow();
    if (f.phase === 'closed' || f.phase === 'approving' || id === f.selected || !f.choices.some((c) => c.id === id)) return;
    const mine = ++this.run;
    this.clearExpiry();
    this.setFlow({ selected: id, limitEdited: false, notice: null, error: null, ...(id === 'chosen' ? { smaller: null, blockedFrom: null, blockedWhole: false, choices: f.choices.filter((choice) => choice.id !== 'smaller') } : {}) });
    const cached = id === 'smaller' ? f.smaller : null;
    if (cached && Date.parse(cached.estimate.expires_at) > this.now()) {
      this.adopt(cached.estimate);
      return;
    }
    await this.price(mine);
  }

  /** Price the chosen scope again, for instance after the estimate expired. Free. */
  async refresh(notice?: Problem): Promise<void> {
    const f = this.flow();
    if (f.phase === 'closed' || f.phase === 'approving') return;
    const mine = ++this.run;
    this.clearExpiry();
    this.setFlow({ notice: notice ?? null, error: null });
    await this.price(mine, notice);
  }

  setLimit(text: string): void {
    this.setFlow({ limitText: text, limitEdited: true });
  }

  explain(open: boolean): void {
    this.setFlow({ explain: open });
  }

  private choice(): ScopeChoice | undefined {
    const f = this.flow();
    return f.choices.find((c) => c.id === f.selected);
  }

  /** previewPlan for the chosen scope (spends nothing). */
  private async price(mine: number, notice?: Problem): Promise<void> {
    const f = this.flow();
    const choice = this.choice();
    if (!f.listenerId || !f.audiobookId || !choice) return;
    this.setFlow({ phase: 'previewing', estimate: null });
    // An empty picker is a valid editing state, never a request to make the whole book.
    if (choice.scope.kind === 'chapters' && choice.chapters.length === 0) {
      this.setFlow({ phase: 'ready', estimate: null, limitText: '', limitEdited: false });
      return;
    }
    const r = await this.gw.preview(f.listenerId, f.audiobookId, choice.scope);
    if (mine !== this.run) return;
    if (!r.ok) {
      const p = r.status === 0 ? { title: 'Couldn’t price the plan', text: `Nothing was started and nothing was spent. Audio already made is kept. ${UNREACHABLE}`, action: 'preview_again' as const } : approvalProblem(r.code, r.detail);
      this.setFlow({ phase: 'ready', estimate: null, error: p, notice: notice ?? null });
      return;
    }
    this.adopt(r.value, notice);
    if (r.value.blocked) await this.offerSmaller(mine, choice, r.value);
  }

  /** Make an estimate the one on screen: its limit starts at the suggestion, or stays as the listener typed it while that is still allowed. */
  private adopt(e: PlanEstimate, notice?: Problem): void {
    const f = this.flow();
    const keep = f.limitEdited && checkLimit(f.limitText, e).ok;
    const patch: Partial<FlowState> = {
      phase: 'ready',
      estimate: e,
      limitText: keep ? f.limitText : moneyText(defaultLimit(e)),
      limitEdited: keep,
      error: null,
      notice: notice ?? f.notice,
    };
    if (e.blocked && !f.blockedFrom) {
      patch.blockedFrom = e;
      patch.blockedWhole = f.selected === 'whole';
    }
    this.setFlow(patch);
    this.armExpiry(e);
  }

  private armExpiry(e: PlanEstimate): void {
    this.clearExpiry();
    const ms = Math.max(0, Date.parse(e.expires_at) - this.now());
    this.expiry = this.timers.set(() => {
      const f = this.flow();
      if (f.phase === 'ready' && f.estimate?.estimate_id === e.estimate_id) {
        void this.refresh({ title: 'The estimate was refreshed', text: 'It was more than 15 minutes old. Check the numbers, then approve.', action: 'none' });
      }
    }, ms);
  }
  private clearExpiry(): void {
    if (this.expiry !== undefined) this.timers.clear(this.expiry);
    this.expiry = undefined;
  }

  /** The Allowance would be passed: price the longest start of the plan that fits what is left, so it can be offered (PL3). */
  private async offerSmaller(mine: number, from: ScopeChoice, blocked: PlanEstimate): Promise<void> {
    const f = this.flow();
    const left = blocked.allowance.remaining?.micros;
    if (left === undefined || !f.listenerId || !f.audiobookId) return;
    const toMake = from.chapters.filter((c) => !c.ready);
    let ids = smallerScope(toMake, blocked.cost, left);
    for (let tries = 0; ids && tries < PREVIEW_SMALLER_TRIES; tries++) {
      const scope: Scope = { kind: 'chapters', chapter_ids: ids, include_matter: f.includeMatter };
      const r = await this.gw.preview(f.listenerId, f.audiobookId, scope);
      if (mine !== this.run) return;
      if (!r.ok) return;
      if (!r.value.blocked && r.value.chapters_to_make > 0) {
        const choice: ScopeChoice = {
          id: 'smaller',
          title: smallerTitle(r.value.chapters_to_make, from.chapters.some((c) => c.ready)),
          detail: `About ${moneyText(r.value.cost.likely)}`,
          scope,
          chapters: from.chapters.filter((c) => ids!.includes(c.id)),
        };
        this.store.update((s) => ({
          ...s,
          flow: { ...s.flow, smaller: { estimate: r.value, choice }, choices: [...s.flow.choices.filter((c) => c.id !== 'smaller'), choice] },
        }));
        return;
      }
      // Still too much (the words were only a guide): try half as many chapters.
      ids = ids.length > 1 ? ids.slice(0, Math.floor(ids.length / 2)) : null;
    }
  }

  /**
   * THE approval: the only place `createPlan` is called. It sends the estimate on screen, with the limit on screen,
   * only when approvalBlock says so, and never twice for one estimate. Returns why nothing was sent, or the plan.
   */
  async approve(): Promise<Outcome> {
    const f = this.flow();
    const e = f.estimate;
    const limit = e ? checkLimit(f.limitText, e) : null;
    const block = approvalBlock({ estimate: e, limit, nowMs: this.now(), used: new Set(f.used), busy: f.phase !== 'ready' });
    if (block !== null || !e || !limit || !limit.ok || !f.listenerId) {
      if (block === 'expired') {
        void this.refresh({ title: 'The estimate was refreshed', text: 'It was more than 15 minutes old, so nothing was sent. Check the new numbers, then approve.', action: 'none' });
      }
      return { ok: false, reason: block ?? 'bad_limit' };
    }
    // Marked used and busy before anything is awaited, so a second press (a double click) finds the door shut.
    this.setFlow({ phase: 'approving', used: [...f.used, e.estimate_id], error: null, notice: null });
    this.clearExpiry();
    const r = await this.gw.create(f.listenerId, { estimate_id: e.estimate_id, limit: limit.limit }, approvalKey(e.estimate_id));
    if (r.ok) {
      this.run++;
      this.setFlow({ ...closedFlow(), approved: r.value });
      this.setTrack({ bookId: r.value.book_id, active: mergePlans(get(this.store).track.active, r.value), ended: null });
      this.startPolling();
      return { ok: true, plan: r.value };
    }
    return this.refused(r, e);
  }

  /** What to do with a refusal of createPlan. The estimate is released (can be tried again) only when the server did not use it. */
  private async refused(r: Extract<R<Plan>, { ok: false }>, e: PlanEstimate): Promise<Outcome> {
    const code = r.status === 0 ? 'network' : r.code;
    const problem = r.status === 0 ? this.unreachable() : approvalProblem(r.code, r.detail, minLimit(e));
    const f = this.flow();
    const stillOpen = f.phase === 'approving';
    const release = (extra: Partial<FlowState> = {}) => this.setFlow({ phase: f.phase === 'closed' ? 'closed' : 'ready', used: f.used.filter((id) => id !== e.estimate_id), ...extra });
    switch (code) {
      case 'estimate_expired':
      case 'estimate_used':
      case 'estimate_changed':
      case 'estimate_not_found':
      case 'allowance_exceeded':
        // The server used or refused the estimate: price again, and let the listener decide on the new numbers.
        if (stillOpen) {
          this.setFlow({ phase: 'ready' });
          await this.refresh({ title: problem.title, text: problem.text, action: problem.action });
        }
        break;
      case 'plan_active': {
        const planId = (r.body as { context?: { plan_id?: string } } | undefined)?.context?.plan_id;
        this.setFlow({ ...closedFlow() });
        if (planId) await this.adoptPlan(planId);
        this.setTrack({ problem: { ...problem, planId: planId ?? '' } });
        break;
      }
      case 'limit_below_estimate':
      case 'nothing_to_make':
      case 'key_rejected':
      case 'source_not_set_up':
      case 'network':
      default:
        release({ error: problem });
    }
    return { ok: false, reason: code ?? 'refused' };
  }

  private unreachable(): Problem {
    return { title: 'Couldn’t reach your Bardic computer', text: `Nothing was started and nothing was spent. Audio already made is kept. ${UNREACHABLE} If you press Approve again, only one plan can be made from this estimate.`, action: 'none' };
  }

  // ------------------------------------------------------------------- following plans that are going

  /** Follow the plans of a book: reads them now and keeps them current (events call `refreshSoon`, a timer reads them while one is going). */
  track(listenerId: string | null, bookId: string | null): void {
    if (listenerId === this.listenerId && bookId === get(this.store).track.bookId) return;
    this.listenerId = listenerId;
    this.trackRun++;
    this.stopPolling();
    this.store.update((s) => ({ ...s, track: { ...emptyTrack(), bookId } }));
    if (listenerId && bookId) void this.refreshTrack();
  }

  /** Re-read after a change notice; bursts collapse into one read. */
  refreshSoon(delay = 250): void {
    if (this.soon !== undefined) this.timers.clear(this.soon);
    this.soon = this.timers.set(() => {
      this.soon = undefined;
      void this.refreshTrack();
    }, delay);
  }

  /** Read the plans of the tracked book. A plan that was going and has ended is kept as `ended` until dismissed. */
  async refreshTrack(): Promise<void> {
    const bookId = get(this.store).track.bookId;
    if (!bookId) return;
    const mine = this.trackRun;
    const r = await this.gw.list(bookId);
    if (mine !== this.trackRun || !r.ok) return;
    this.applyPlans(r.value);
  }

  private applyPlans(all: Plan[]): void {
    const before = get(this.store).track;
    const active = all.filter(isActivePlan);
    let ended = before.ended;
    for (const was of before.active) {
      const now = all.find((p) => p.id === was.id);
      if (now && !isActivePlan(now)) ended = now;
    }
    this.setTrack({ active, ended });
    if (active.length) this.startPolling();
    else this.stopPolling();
  }

  private async adoptPlan(planId: string): Promise<void> {
    const r = await this.gw.get(planId);
    if (r.ok && isActivePlan(r.value)) {
      this.setTrack({ bookId: r.value.book_id, active: mergePlans(get(this.store).track.active, r.value) });
      this.startPolling();
    }
  }

  private startPolling(): void {
    if (this.poll !== undefined) return;
    const tick = () => {
      this.poll = this.timers.set(() => {
        this.poll = undefined;
        void this.pollOnce();
      }, POLL_MS);
    };
    tick();
  }
  private stopPolling(): void {
    if (this.poll !== undefined) this.timers.clear(this.poll);
    this.poll = undefined;
  }
  private async pollOnce(): Promise<void> {
    await this.refreshTrack();
    if (get(this.store).track.active.length) this.startPolling();
  }

  // ------------------------------------------------------------------- pause, resume, stop

  private plan(id: string): Plan | undefined {
    return get(this.store).track.active.find((p) => p.id === id);
  }

  private async act(plan: Plan, what: 'pause' | 'resume' | 'stop', run: () => Promise<R<Plan>>): Promise<ActionResult> {
    if (get(this.store).track.busy) return { ok: false, reason: 'busy' };
    this.setTrack({ busy: true, problem: null, raisePlanId: null });
    const r = await run();
    if (r.ok) {
      this.applyOne(r.value);
      this.setTrack({ busy: false });
      return { ok: true };
    }
    const problem = r.status === 0 ? { title: `Couldn’t ${what}`, text: `Finished chapters are kept. ${UNREACHABLE}`, action: 'none' as const } : actionProblem(what, r.code, r.detail, plan.limit);
    this.setTrack({ busy: false, problem: { ...problem, planId: plan.id }, raisePlanId: r.code === 'limit_exceeded' ? plan.id : null });
    void this.refreshTrack();
    return { ok: false, reason: r.code ?? 'failed' };
  }

  private applyOne(p: Plan): void {
    const t = get(this.store).track;
    if (isActivePlan(p)) {
      this.setTrack({ active: mergePlans(t.active, p) });
      this.startPolling();
    } else {
      this.setTrack({ active: t.active.filter((x) => x.id !== p.id), ended: p });
      if (t.active.every((x) => x.id === p.id)) this.stopPolling();
    }
  }

  /** Pause at the next chapter boundary; the chapter being made is finished and kept. */
  pause(planId: string): Promise<ActionResult> {
    const p = this.plan(planId);
    if (!p || !this.listenerId) return Promise.resolve({ ok: false, reason: 'no_plan' });
    const l = this.listenerId;
    return this.act(p, 'pause', () => this.gw.pause(l, p.id));
  }

  /** Stop the plan. Finished chapters are kept. */
  stop(planId: string): Promise<ActionResult> {
    const p = this.plan(planId);
    if (!p || !this.listenerId) return Promise.resolve({ ok: false, reason: 'no_plan' });
    const l = this.listenerId;
    return this.act(p, 'stop', () => this.gw.stop(l, p.id));
  }

  /**
   * Continue a paused or needs-you plan inside its limit, or with a higher one the listener typed (a new approval,
   * audited). The only place `resumePlan` is called.
   */
  resume(planId: string, newLimitText?: string): Promise<ActionResult> {
    const p = this.plan(planId);
    if (!p || !this.listenerId) return Promise.resolve({ ok: false, reason: 'no_plan' });
    if (p.state !== 'paused' && p.state !== 'needs_you') return Promise.resolve({ ok: false, reason: 'not_resumable' });
    let newLimit: Money | undefined;
    if (newLimitText !== undefined) {
      const c = checkRaise(newLimitText, p);
      if (!c.ok) return Promise.resolve({ ok: false, reason: c.problem });
      newLimit = c.limit;
    }
    const l = this.listenerId;
    return this.act(p, 'resume', () => this.gw.resume(l, p.id, newLimit));
  }

  /** The page has shown the plan that was approved (it switched to its audiobook); forget it. */
  ackApproved(): void {
    this.setFlow({ approved: null });
  }

  dismissEnded(): void {
    this.setTrack({ ended: null });
  }
  dismissProblem(): void {
    this.setTrack({ problem: null, raisePlanId: null });
  }

  dispose(): void {
    this.run++;
    this.trackRun++;
    this.clearExpiry();
    this.stopPolling();
    if (this.soon !== undefined) this.timers.clear(this.soon);
  }
}

function mergePlans(list: readonly Plan[], p: Plan): Plan[] {
  const rest = list.filter((x) => x.id !== p.id);
  return [p, ...rest].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export const planStore = new PlanStore();

/** Notices that change what a plan shows: the book page passes these on to `refreshSoon`. */
export const PLAN_NOTICES: ReadonlySet<string> = new Set(['plan.updated', 'job.updated', 'allowance.updated', 'source.updated', 'resync']);
export const isPlanNotice = (type: string | undefined) => !!type && PLAN_NOTICES.has(type);

// Synthetic voices and sources for the voice boards. Original names; no real server is involved.
import type { ListenerSettings, Voice, VoiceSource, VoiceRowModel } from '../lib/voiceText';

const voice = (id: string, source_id: string, name: string, description: string, tier: 'free' | 'premium' = 'free'): Voice => ({
  id,
  source_id,
  name,
  tier,
  language: 'en',
  description,
  revision: 'r1',
  available: true,
});

export const amber = voice('fx-amber', 'breeze', 'Amber', 'Warm, even');
export const bram = voice('fx-bram', 'breeze', 'Bram', 'Steady');
export const cleo = voice('fx-cleo', 'breeze', 'Cleo', 'Bright');
export const dara = voice('fx-dara', 'breeze', 'Dara', 'Soft');
export const samantha = voice('fx-samantha', 'local', 'Samantha', 'Warm, even');
export const daniel = voice('fx-daniel', 'local', 'Daniel', 'Steady');
export const karen = voice('fx-karen', 'local', 'Karen', 'Bright');
export const kore = voice('fx-kore', 'gemini', 'Kore', 'Clear, calm', 'premium');
export const puck = voice('fx-puck', 'gemini', 'Puck', 'Lively', 'premium');
export const charon = voice('fx-charon', 'gemini', 'Charon', 'Deep, measured', 'premium');

const row = (id: string, name: string, detail: string, premium = false): VoiceRowModel => ({ id, name, detail, premium, unavailable: false });

/** [VoiceFree]: Breeze voices, then the voice on this computer. */
export const freeRows: VoiceRowModel[] = [
  row(amber.id, 'Amber', 'Warm, even · from Breeze'),
  row(bram.id, 'Bram', 'Steady · from Breeze'),
  row(cleo.id, 'Cleo', 'Bright · from Breeze'),
  row(samantha.id, 'Samantha', 'On your Bardic computer'),
];
/** [VoicePremium]. */
export const premiumRows: VoiceRowModel[] = [
  row(kore.id, 'Kore', 'Clear, calm · 1 of 30 Gemini voices', true),
  row(puck.id, 'Puck', 'Lively · English', true),
  row(charon.id, 'Charon', 'Deep, measured · English', true),
];
/** [VoiceNoAccount]. */
export const premiumRowsNoKey: VoiceRowModel[] = [row(kore.id, 'Kore', 'Clear, calm · English', true), row(puck.id, 'Puck', 'Lively · English', true)];
/** [BreezeServer]: four of the fourteen the server reports. */
export const serverRows: VoiceRowModel[] = [
  row(amber.id, 'Amber', 'Warm, even · English'),
  row(bram.id, 'Bram', 'Steady · English'),
  row(cleo.id, 'Cleo', 'Bright · English'),
  row(dara.id, 'Dara', 'Soft · English'),
];
/** [VoiceDefault]. */
export const defaultRows: VoiceRowModel[] = [
  row(samantha.id, 'Samantha', 'Warm, even · free'),
  row(daniel.id, 'Daniel', 'Steady · free'),
  row(karen.id, 'Karen', 'Bright · free'),
  row(kore.id, 'Kore', 'Clear, calm · premium', true),
];

const source = (kind: VoiceSource['kind'], name: string, tier: 'free' | 'premium', state: VoiceSource['state'], voice_count: number, extra: Partial<VoiceSource> = {}): VoiceSource => ({
  id: kind,
  kind,
  name,
  tier,
  state,
  voice_count,
  checked_at: '2026-03-02T09:00:00Z',
  detail: null,
  has_key: false,
  base_url: null,
  ...extra,
});

export const breezeConnected = source('breeze', 'Breeze', 'free', 'connected', 14, { base_url: 'http://breeze.local:8080' });
export const geminiConnected = source('gemini', 'Gemini', 'premium', 'connected', 30, { has_key: true });
export const localAvailable = source('local', 'This computer', 'free', 'available', 12);
export const breezeNone = source('breeze', 'Breeze', 'free', 'not_set_up', 0, { checked_at: null });
export const geminiNone = source('gemini', 'Gemini', 'premium', 'not_set_up', 0, { checked_at: null });

/** [VoiceSources], [Settings]. */
export const allConnected: VoiceSource[] = [breezeConnected, geminiConnected, localAvailable];
/** [SetupVoice]: nothing set up yet, twelve voices on this computer. */
export const nothingSetUp: VoiceSource[] = [breezeNone, geminiNone, localAvailable];

export const settings: ListenerSettings = { default_voice_id: samantha.id, place_conflict: 'ask', continue_into_next_chapter: true };

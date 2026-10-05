import type { Component } from 'svelte';
import Settings from '../settings/boards/Settings.svelte';
import BreezeServer from '../voices/boards/BreezeServer.svelte';
import SetupVoice from '../voices/boards/SetupVoice.svelte';
import VoiceDefault from '../voices/boards/VoiceDefault.svelte';
import VoiceFree from '../voices/boards/VoiceFree.svelte';
import VoiceNoAccount from '../voices/boards/VoiceNoAccount.svelte';
import VoicePremium from '../voices/boards/VoicePremium.svelte';
import VoiceSources from '../voices/boards/VoiceSources.svelte';

/** W2 voice and settings boards: VoiceFree, VoicePremium, VoiceNoAccount, SetupVoice, BreezeServer, VoiceSources, VoiceDefault, Settings. */
export const voiceBoards: Record<string, Component> = {
  VoiceFree,
  VoicePremium,
  VoiceNoAccount,
  SetupVoice,
  BreezeServer,
  VoiceSources,
  VoiceDefault,
  Settings,
  // Live screens against a real server for e2e/voices.spec.ts; not a design board (see the file).
};

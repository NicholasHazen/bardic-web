// The voice screens of W2 (V1 to V10), connected to the server through src/state/voices.ts. The presentational
// views (ChooserView, SourcesView, BreezeView, ...) are what the design boards render from fixtures.
//
// Hash routes (the integrator wires them; each screen except the sheets goes inside <Shell active="settings">):
//   #/settings/voices          VoiceSourcesScreen
//   #/settings/voices/breeze   BreezeServerScreen
//   #/settings/voices/default  DefaultVoiceScreen
//   #/settings/premium         PremiumAccountScreen (W4, src/views/account); #/settings/allowance is AllowanceScreen
// Sheets: VoiceChooserSheet is opened by the book page ({bookId, onclose}); SetupVoice is shown by the chooser when no
// source is set up, and may be opened on its own.
export { default as VoiceChooserSheet } from './VoiceChooserSheet.svelte';
export { default as SetupVoice } from './SetupVoice.svelte';
export { default as VoiceSourcesScreen } from './VoiceSourcesScreen.svelte';
export { default as BreezeServerScreen } from './BreezeServerScreen.svelte';
export { default as DefaultVoiceScreen } from './DefaultVoiceScreen.svelte';

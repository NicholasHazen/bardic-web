// The Gemini account and the Allowance (W4, spec 5.4 V2/V5, 5.8 PL8 to PL11), connected to the server through
// src/state/allowance.ts. The presentational views (PremiumAccountView, KeyProblemView, AllowanceView) are what the
// design boards render from fixtures.
//
// Hash routes (the integrator wires them; each goes inside <Shell active="settings">):
//   #/settings/premium    PremiumAccountScreen  (shows the key problem when Google rejected the key)
//   #/settings/allowance  AllowanceScreen       (the "no limit" or "with a limit" variant from what is saved)
// KeyProblemBanner takes no props: it reads the Gemini source and shows nothing unless the key was rejected.
export { default as PremiumAccountScreen } from './PremiumAccountScreen.svelte';
export { default as AllowanceScreen } from './AllowanceScreen.svelte';
export { default as KeyProblemBanner } from './KeyProblemBanner.svelte';

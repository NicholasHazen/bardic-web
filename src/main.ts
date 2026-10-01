import './theme/tokens.css';
import { mount } from 'svelte';
import App from './App.svelte';

// Test hook for the end-to-end suite: built in only with VITE_E2E=1, never in a normal build.
if (import.meta.env.VITE_E2E) {
  void import('./player/testhost/install').then((m) => m.installE2E());
}

mount(App, { target: document.getElementById('app')! });

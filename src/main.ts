import './theme/tokens.css';
import { mount } from 'svelte';
import App from './App.svelte';

// Test hook for the end-to-end suite: built in only with VITE_E2E=1, never in a normal build.
if (import.meta.env.VITE_E2E) {
  void import('./player/testhost/install').then((m) => m.installE2E());
  void import('./offline/testhost').then((m) => m.installOfflineE2E());
}

// What this device holds keeps the audio words ("On this device") and the library's marks in step.
void Promise.all([import('./offline/offline'), import('./state/offlineBinding'), import('./state/book'), import('./state/library')]).then(
  ([{ offline }, { bindOfflineStores }, { deviceChapters }, { onDeviceIds }]) => bindOfflineStores(offline, { deviceChapters, onDeviceIds }),
);

// The app shell loads without the server after the first visit (production builds over https or localhost only).
void import('./offline/sw').then((m) => m.registerServiceWorker({}));

mount(App, { target: document.getElementById('app')! });

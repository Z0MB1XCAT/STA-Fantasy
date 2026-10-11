// Installs the backup-site worker (sw.js) on the main host so returning visitors can be sent to GitHub
// Pages if the main host goes down. Not needed, and not installed, on the backup site itself.
import { FALLBACK_SITE } from './config.js';
import { DEV, params } from './env.js';

export function watchForOutage() {
  if (!('serviceWorker' in navigator)) return;
  if (location.hostname === new URL(FALLBACK_SITE).hostname) return;
  // On your own machine the worker would send you to the live site whenever the dev server hiccups
  if (DEV && !params.get('sw')) return;
  navigator.serviceWorker.register('sw.js').catch(() => { /* private mode or blocked: the site works the same without it */ });
}

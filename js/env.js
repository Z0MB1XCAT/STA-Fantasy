// Developer switches (?store=local, ?demo=1, ?now=, ?rounds=, ?data=) only work on your own machine,
// so nobody can share a link to a fake leaderboard on the real site.
export const DEV = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
export const params = new URLSearchParams(DEV ? location.search : '');
/** query string to carry between pages (dev only) */
export const carry = DEV ? location.search : '';

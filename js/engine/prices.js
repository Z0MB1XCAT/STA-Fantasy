// Automatic price moves, modelled on F1 Fantasy.
//
// After a round is scored, every asset that raced is ranked on points-per-million over its last
// `window` raced rounds. Bands are percentile based (top 25% = great, next 25% = good, ...) because
// the league has no fantasy-points history yet. Cheap assets (tier B) move more than expensive
// ones (tier A). Assets that did not race keep their price and the round is skipped for them.

const round1 = x => Math.round(x * 10) / 10;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function bandFor(rank, n, bands) {
  const f = rank / n;
  if (f < bands.great) return 'great';
  if (f < bands.good) return 'good';
  if (f < bands.poor) return 'poor';
  return 'terrible';
}

/**
 * @param group  [{id, price, recent:[pts...] (most recent last, raced rounds only), tierSplit}]
 * @returns Map id -> { price, delta, band, tier, ppm }
 */
export function priceMoves(group, cfg) {
  const rows = group.map(a => {
    const w = a.recent.slice(-cfg.window);
    const avg = w.reduce((s, x) => s + x, 0) / Math.max(1, w.length);
    return { ...a, avg, ppm: avg / a.price };
  });
  rows.sort((a, b) => b.ppm - a.ppm || b.avg - a.avg || String(a.id).localeCompare(String(b.id)));
  const out = new Map();
  rows.forEach((r, i) => {
    const band = bandFor(i, rows.length, cfg.bands);
    const tier = r.price >= r.tierSplit ? 'A' : 'B';
    const delta = cfg.moves[tier][band];
    const price = clamp(round1(r.price + delta), cfg.min, cfg.max);
    out.set(r.id, { price, delta: round1(price - r.price), band, tier, ppm: r.ppm });
  });
  return out;
}

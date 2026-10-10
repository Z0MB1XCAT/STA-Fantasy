// Parses (and writes) the plain-text round file, e.g. data/rounds/05.txt
//
//   round: 5
//   status: provisional            # upcoming | provisional | final
//   quali:   KAM JEN NFS ...       # finishing order, P1 first
//   reverse: ... ICE:dnf
//   feature: ... SOU:dsq
//   gridfeature: ...               # optional: override the derived grid
//   fastest: reverse=KAM feature=JEN
//   notes: +5s on ICE after stewards
//
// Marks after a code: :dnf  :dsq  :dns
// A regular driver who is not listed in a session simply didn't take part: 0 points, no penalty.

export const STATUSES = ['upcoming', 'provisional', 'final'];
export const SESSIONS = ['quali', 'reverse', 'feature'];
const MARKS = ['dnf', 'dsq', 'dns'];

function tokens(s) {
  return s.split(/[\s,]+/).map(t => t.trim()).filter(Boolean);
}

function parseOrder(value, errors, label, codes) {
  const list = [];
  const seen = new Set();
  for (const t of tokens(value)) {
    const [rawCode, rawMark] = t.split(':');
    const code = rawCode.toUpperCase();
    const mark = rawMark ? rawMark.toLowerCase() : null;
    if (codes && !codes.has(code)) { errors.push(`${label}: unknown driver code ${code}`); continue; }
    if (mark && !MARKS.includes(mark)) { errors.push(`${label}: unknown mark ":${rawMark}" on ${code} (use dnf, dsq or dns)`); continue; }
    if (seen.has(code)) { errors.push(`${label}: ${code} is listed twice`); continue; }
    seen.add(code);
    list.push({ code, mark });
  }
  return list;
}

/**
 * @param {string} text
 * @param {{codes?: Set<string>}} [opts] set of valid driver codes (enables unknown-code checks)
 */
export function parseRound(text, opts = {}) {
  const codes = opts.codes;
  const errors = [];
  const warnings = [];
  const raw = {};
  let lastKey = null;
  for (const line0 of String(text).split(/\r?\n/)) {
    const line = line0.replace(/#.*$/, '').trimEnd();
    if (!line.trim()) continue;
    const m = line.match(/^\s*([A-Za-z]+)\s*:\s*(.*)$/);
    const isKey = m && /^(round|status|out|subs|quali|reverse|feature|gridreverse|gridfeature|fastest|notes)$/i.test(m[1]);
    if (isKey) { lastKey = m[1].toLowerCase(); raw[lastKey] = (raw[lastKey] ? raw[lastKey] + ' ' : '') + m[2].trim(); }
    else if (lastKey) raw[lastKey] += ' ' + line.trim();
    else errors.push(`Unrecognised line: "${line.trim()}"`);
  }

  const round = Number(raw.round);
  if (!Number.isInteger(round) || round < 1) errors.push('Missing or invalid "round:" line');
  const status = (raw.status || 'upcoming').toLowerCase();
  if (!STATUSES.includes(status)) errors.push(`status must be one of ${STATUSES.join(', ')} (got "${raw.status}")`);

  // old files may still have stand-in lines; they no longer do anything
  if (raw.out || raw.subs) warnings.push('"out:" and "subs:" lines are no longer used and are ignored. Absent drivers just score 0.');

  const sessions = {};
  for (const s of SESSIONS) sessions[s] = raw[s] ? parseOrder(raw[s], errors, s, codes) : [];

  const grids = {};
  if (raw.gridreverse) grids.reverse = parseOrder(raw.gridreverse, errors, 'gridreverse', codes).map(x => x.code);
  if (raw.gridfeature) grids.feature = parseOrder(raw.gridfeature, errors, 'gridfeature', codes).map(x => x.code);

  const fastest = {};
  if (raw.fastest) {
    for (const t of tokens(raw.fastest)) {
      const m = t.match(/^(reverse|feature)=([A-Za-z0-9]{3})$/i);
      if (!m) { errors.push(`fastest: "${t}" should look like reverse=ABC or feature=ABC`); continue; }
      const sess = m[1].toLowerCase(), code = m[2].toUpperCase();
      if (!sessions[sess].some(x => x.code === code)) errors.push(`fastest: ${code} is not in the ${sess} results`);
      fastest[sess] = code;
    }
  }

  if (status !== 'upcoming') {
    for (const s of SESSIONS) if (!sessions[s].length) warnings.push(`No ${s} results entered yet`);
  }
  if (!sessions.quali.length && status !== 'upcoming' && (sessions.reverse.length || sessions.feature.length)) {
    warnings.push('No quali order, so places gained/lost cannot be scored (add quali or a grid override)');
  }

  return { round, status, sessions, grids, fastest, notes: raw.notes || '', errors, warnings, ok: errors.length === 0 };
}

const orderToText = list => list.map(x => x.code + (x.mark ? ':' + x.mark : '')).join(' ');

/** Writes a round object back to the text format (used by the admin page). */
export function serializeRound(r) {
  const lines = [];
  lines.push(`round: ${r.round}`);
  lines.push(`status: ${r.status}`);
  for (const s of SESSIONS) if (r.sessions?.[s]?.length) lines.push(`${s}: ${orderToText(r.sessions[s])}`);
  if (r.grids?.reverse?.length) lines.push(`gridreverse: ${r.grids.reverse.join(' ')}`);
  if (r.grids?.feature?.length) lines.push(`gridfeature: ${r.grids.feature.join(' ')}`);
  const f = Object.entries(r.fastest || {}).map(([s, c]) => `${s}=${c}`).join(' ');
  if (f) lines.push(`fastest: ${f}`);
  if (r.notes) lines.push(`notes: ${r.notes}`);
  return lines.join('\n') + '\n';
}

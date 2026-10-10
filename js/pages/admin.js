// Results entry helper: builds data/rounds/NN.txt for you, with a live points preview.
import { boot } from '../shell.js';
import { esc, $, $$, money, fmtNum, signed, colorOf, nameOf, teamLine, statusBadge, posBox, toast, roundStatus } from '../ui.js';
import { bust, tchip, ident } from '../components.js';
import { parseRound, serializeRound } from '../engine/parseRound.js';
import { buildSeason } from '../engine/season.js';

const ctx = await boot('admin');
const { S, raw, store, now } = ctx;
const roundsMap = ctx.rounds;
const app = $('#app');
const codes = new Set(S.drivers.map(d => d.code));
const regulars = S.drivers.filter(d => d.role === 'regular');
const pad = n => String(n).padStart(2, '0');

const blank = id => ({ round: id, status: 'provisional', out: [], sessions: { quali: [], reverse: [], feature: [] }, grids: {}, fastest: {}, notes: '' });
const clone = o => JSON.parse(JSON.stringify(o));

let roundId = (S.currentRound() || S.rounds[0]).id;
let st = load(roundId);
let tab = 'quali';
let pasteMsg = '';

function load(id) {
  const existing = roundsMap.get(id);
  if (existing && existing.ok && existing.status !== 'upcoming') return clone(existing);
  // no results yet: before the deadline you are most likely announcing who isn't racing, after it entering results
  const b = blank(id);
  b.status = now < S.round(id).lockAt ? 'upcoming' : 'provisional';
  if (existing?.ok) b.out = [...existing.out];
  return b;
}

/* ---------------------------------------------------------------- helpers */
// reserves can still be placed so everyone else's finishing positions are right; they don't score
function pool(session) {
  const placed = new Set(st.sessions[session].map(x => x.code));
  return S.drivers.filter(d => !placed.has(d.code));
}
function aliasOf(d) { return [d.simgrid, d.name, d.code].filter(a => a && a.length >= 3).map(a => a.toLowerCase()); }
function matchLine(line) {
  const L = ' ' + line.toLowerCase().replace(/[^\p{L}\p{N}_ .#-]/gu, ' ') + ' ';
  let best = null, score = 0;
  for (const d of S.drivers) {
    for (const a of aliasOf(d)) {
      const i = L.indexOf(a);
      if (i < 0) continue;
      const before = L[i - 1], after = L[i + a.length];
      if (/[\p{L}\p{N}]/u.test(before) || /[\p{L}\p{N}]/u.test(after)) continue;
      if (a.length > score) { best = d; score = a.length; }
    }
  }
  return best;
}
function applyPaste(text) {
  const lines = text.split(/[\n;]+/).map(s => s.trim()).filter(Boolean);
  const items = lines.length === 1 ? lines[0].split(/[\s,]+/).filter(Boolean) : lines;
  const out = [], unknown = [], seen = new Set();
  for (const raw of items) {
    const mark = (raw.match(/(?::|\b)(dnf|dsq|dns)\b/i) || [])[1]?.toLowerCase() || null;
    const d = matchLine(raw.replace(/:(dnf|dsq|dns)/i, ' '));
    if (!d) { unknown.push(raw); continue; }
    if (seen.has(d.code)) continue;
    seen.add(d.code);
    out.push({ code: d.code, mark });
  }
  st.sessions[tab] = out;
  pasteMsg = `Placed ${out.length} driver${out.length === 1 ? '' : 's'}.${unknown.length ? ` Could not match: ${unknown.join(', ')}.` : ''}`;
}

/* ----------------------------------------------------------------- output */
function output() {
  const text = serializeRound({ ...st, grids: st.grids });
  const parsed = parseRound(text, { codes });
  return { text, parsed };
}

function previewSeason(parsed) {
  if (!parsed.ok || parsed.status === 'upcoming') return null;
  const m = new Map(roundsMap);
  m.set(roundId, parsed);
  return buildSeason({ ...raw, rounds: m });
}

/* ------------------------------------------------------------------ views */
function advisories() {
  const msgs = [];
  const placed = new Set(Object.values(st.sessions).flat().map(x => x.code));
  const missing = regulars.filter(d => !placed.has(d.code));
  const outButPlaced = st.out.filter(c => placed.has(c));
  if (outButPlaced.length) msgs.push(`Marked as not racing but in the results, so they score as normal: ${outButPlaced.map(c => nameOf(S, c)).join(', ')}.`);
  if (st.status !== 'upcoming' && placed.size && missing.length) msgs.push(`Not in any session, so they count as absent (0 points, greyed out): ${missing.map(d => d.name).join(', ')}.`);
  for (const s of ['quali', 'reverse', 'feature']) {
    const n = st.sessions[s].length;
    if (st.status !== 'upcoming' && placed.size && n === 0) msgs.push(`${{ quali: 'Short Quali', reverse: 'Reverse Grid', feature: 'Feature Race' }[s]} has no results yet.`);
  }
  return msgs;
}

function sessionBuilder() {
  const list = st.sessions[tab];
  const available = pool(tab);
  const isRace = tab !== 'quali';
  return `
    <div class="field"><label for="paste">Paste the finishing order</label>
      <textarea class="textarea" id="paste" placeholder="One driver per line, P1 first. Codes, names or SimGrid usernames all work, and you can add DNF, DSQ or DNS to a line."></textarea>
      <div class="row-flex"><button class="btn btn--ghost btn--sm" type="button" data-act="paste">Use pasted order</button><span class="hint" role="status">${esc(pasteMsg)}</span></div></div>
    <div><h3 class="h3" style="margin-bottom:8px">Or tap drivers in finishing order <span class="faint" style="font-family:var(--body);font-weight:600;font-size:.85rem">${list.length} placed, ${available.length} left</span></h3>
      <div class="pool" role="group" aria-label="Drivers not yet placed">${available.map(d => `<button type="button" data-act="place" data-code="${d.code}" >${bust(S, d.code)}${esc(d.name)}</button>`).join('') || '<span class="muted small">Everyone is placed.</span>'}</div></div>
    <div class="draglist" aria-label="${tab} finishing order">${list.map((x, i) => `
      <div class="dl-item">${posBox(i + 1)}${bust(S, x.code)}
        <div class="who"><b>${esc(nameOf(S, x.code))}</b><small>${esc(teamLine(S, x.code))}</small></div>
        <div class="row-flex" style="gap:4px;flex-wrap:nowrap">
          <button class="mini" type="button" data-act="up" data-i="${i}" aria-label="Move ${esc(nameOf(S, x.code))} up" ${i === 0 ? 'disabled' : ''}>Up</button>
          <button class="mini" type="button" data-act="down" data-i="${i}" aria-label="Move ${esc(nameOf(S, x.code))} down" ${i === list.length - 1 ? 'disabled' : ''}>Down</button>
          ${['dnf', 'dsq', 'dns'].map(m => `<button class="mini" type="button" data-act="mark" data-i="${i}" data-m="${m}" aria-pressed="${x.mark === m}">${m.toUpperCase()}</button>`).join('')}
          <button class="mini" type="button" data-act="del" data-i="${i}" aria-label="Remove ${esc(nameOf(S, x.code))}">✕</button></div></div>`).join('')}</div>
    ${isRace ? `<div class="field" style="max-width:320px"><label for="fl">Fastest lap</label><select class="select" id="fl"><option value="">Nobody recorded</option>${list.filter(x => !x.mark).map(x => `<option value="${x.code}" ${st.fastest[tab] === x.code ? 'selected' : ''}>${esc(nameOf(S, x.code))}</option>`).join('')}</select></div>` : ''}`;
}

function previewView(parsed) {
  const S2 = previewSeason(parsed);
  if (!parsed.ok) return `<div class="notice notice--signal"><span class="glyph">!</span><div><b>Fix this before saving</b><span class="muted">${parsed.errors.map(esc).join('<br>')}</span></div></div>`;
  if (!S2 || !Object.values(st.sessions).some(l => l.length)) return '<p class="muted">Add results to a session above and the points will appear here.</p>';
  const R2 = S2.round(roundId);
  const rows = S2.drivers.map(d => ({ d, own: R2.scores.drivers[d.code], eff: R2.scores.effective[d.code] }))
    .filter(x => x.d.role === 'regular').sort((a, b) => (a.eff.absent - b.eff.absent) || (b.eff.points - a.eff.points));
  const cons = S2.teams.map(t => R2.scores.constructors[t.id]).sort((a, b) => b.total - a.total);
  const moves = Object.entries(R2.moves || {}).map(([id, m]) => ({ id, ...m })).sort((a, b) => b.delta - a.delta);
  const ups = moves.filter(m => m.delta > 0).slice(0, 4), downs = moves.filter(m => m.delta < 0).slice(-4).reverse();
  const cell = (s, k) => (s[k] ? fmtNum(s[k].pts) : '–');
  return `<div class="cols cols--1-1">
    <div><h3 class="h3" style="padding:0 4px 8px">Driver points</h3><div class="tower">${rows.map((x, i) => `
      <div class="row${x.eff.absent ? ' row--absent' : ''}">${posBox(i + 1)}${bust(S, x.d.code)}
        <div class="who"><b>${esc(x.d.name)}${x.eff.absent ? ' <span class="mark">Absent</span>' : ''}</b><small>Quali ${cell(x.own.sessions, 'quali')}, reverse ${cell(x.own.sessions, 'reverse')}, feature ${cell(x.own.sessions, 'feature')}</small></div>
        <div class="stat stat--lead"><span class="num ${x.eff.points < 0 ? 'dn' : ''}">${fmtNum(x.eff.points)}</span><small>Pts</small></div></div>`).join('')}</div></div>
    <div class="stack" style="--gap:16px"><div><h3 class="h3" style="padding:0 4px 8px">Constructors</h3><div class="tower">${cons.map((c, i) => `
      <div class="row">${posBox(i + 1)}${tchip(S, c.id)}<div class="who"><b>${esc(nameOf(S, c.id))}</b><small>${c.seats.map(s => esc(nameOf(S, s))).join(' and ')}</small></div>
        <div class="stat stat--lead"><span class="num">${fmtNum(c.total)}</span><small>Pts</small></div></div>`).join('')}</div></div>
    ${moves.length ? `<div><h3 class="h3" style="padding:0 4px 8px">Price moves this would cause</h3><div class="tower">${[...ups, ...downs].map(m => `
      <div class="row">${ident(S, m.id)}<div class="who"><b>${esc(nameOf(S, m.id))}</b><small>${money(R2.prices[m.id])} to ${money(m.price)}</small></div>
        <div class="stat">${m.delta > 0 ? `<span class="up num">▲ ${m.delta.toFixed(1)}</span>` : `<span class="dn num">▼ ${Math.abs(m.delta).toFixed(1)}</span>`}</div></div>`).join('')}</div></div>` : ''}</div></div>`;
}

function render() {
  const { text, parsed } = output();
  const adv = advisories();
  const fileName = `${pad(roundId)}.txt`;
  app.innerHTML = `<div class="stack" style="--gap:22px">
    <div><h1 class="h1">Enter results</h1><p class="muted" style="margin-top:8px;max-width:64ch">Build a round's results here, then copy the file into the repo. Nothing is saved from this page, so you can experiment safely.</p></div>

    <nav class="rounds-strip" aria-label="Round">${S.rounds.map(r => `<button class="rchip" type="button" data-act="round" data-id="${r.id}" ${r.id === roundId ? 'aria-current="true"' : ''}><small>Round ${r.id}</small><b>${esc(r.name)}</b>${roundStatus(r)}</button>`).join('')}</nav>

    <div class="cols cols--2-1">
      <div class="stack" style="--gap:20px">
        <section class="panel"><div class="panel__head"><h2 class="h2">Round ${roundId}: ${esc(S.round(roundId).name)}</h2>
          <div class="seg" role="group" aria-label="Status">${['upcoming', 'provisional', 'final'].map(k => `<button type="button" aria-pressed="${st.status === k}" data-act="status" data-k="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div></div>
          <div class="panel__body--pad stack" style="--gap:16px">
            <p class="hint">Before the deadline: <b>Upcoming</b>, if you're only marking who isn't racing. Friday after the races: <b>Provisional</b>. Sunday after the stewards: edit anything that changed, then set <b>Final</b>. Anyone you leave out of a session counts as absent: 0 points, no penalty. Reserves can be placed so the positions are right, but they don't score.</p>
          </div></section>

        <section class="panel"><div class="panel__head"><h2 class="h2">Not racing this round</h2><span class="muted small">${st.out.length ? `${st.out.length} marked` : 'Nobody marked'}</span></div>
          <div class="panel__body--pad stack" style="--gap:14px">
            <p class="hint">Know before the deadline that someone can't make it? Tap them here, keep the status on <b>Upcoming</b> and commit the file. Everyone sees them greyed out as <b>Not racing</b>, so they can use a transfer on them in time. Transfers work as normal. If they turn up after all, just put them in the results and they score as usual.</p>
            <div class="pool" role="group" aria-label="Drivers not racing">${regulars.filter(d => !d.retired).map(d => `<button type="button" data-act="out" data-code="${d.code}" aria-pressed="${st.out.includes(d.code)}">${bust(S, d.code)}${esc(d.name)}</button>`).join('')}</div>
          </div></section>

        <section class="panel"><div class="panel__head"><div class="seg" role="group" aria-label="Session">${[['quali', 'Short Quali'], ['reverse', 'Reverse Grid'], ['feature', 'Feature Race']].map(([k, l]) => `<button type="button" data-act="tab" data-k="${k}" aria-pressed="${tab === k}">${l} <span class="faint">${st.sessions[k].length}</span></button>`).join('')}</div></div>
          <div class="panel__body--pad stack" style="--gap:18px" id="builder">${sessionBuilder()}</div></section>
      </div>

      <div class="stack" style="--gap:20px">
        <section class="panel panel--raised"><div class="panel__head"><h2 class="h2">${fileName}</h2>${parsed.ok ? statusBadge('final', 'File is valid') : statusBadge('locked', 'Needs fixing')}</div>
          <div class="panel__body--pad stack" style="--gap:14px">
            <pre class="file" id="file">${esc(text)}</pre>
            ${adv.length ? `<div class="notice notice--flag"><span class="glyph">!</span><div>${adv.map(a => `<span class="muted" style="display:block">${esc(a)}</span>`).join('')}</div></div>` : ''}
            <div class="field"><label for="notes">Notes <span class="faint">(optional)</span></label><input class="input" id="notes" value="${esc(st.notes)}" placeholder="e.g. +5s on KAM after stewards"></div>
            <div class="row-flex"><button class="btn btn--primary" type="button" data-act="copy" ${parsed.ok ? '' : 'disabled'}>Copy file</button><button class="btn btn--ghost" type="button" data-act="download" ${parsed.ok ? '' : 'disabled'}>Download ${fileName}</button></div>
            <ol class="steps small muted"><li>Open <b>data/rounds/${fileName}</b> on GitHub and press the pencil.</li><li>Select everything, paste, then commit. The site updates in a minute or two.</li></ol>
          </div></section>
        <details class="panel dd"><summary class="panel__head" style="cursor:pointer;list-style:none"><h2 class="h2">Driver codes</h2><span class="muted small">Tap to expand</span></summary>
          <div class="panel__body"><div class="tower">${S.drivers.map(d => `<div class="row">${bust(S, d.code)}<b class="num" style="font-size:1.1rem;min-width:44px">${d.code}</b><div class="who"><b>${esc(d.name)}</b><small>${esc(teamLine(S, d.code))}, ${esc(d.simgrid)}</small></div></div>`).join('')}</div></div></details>
      </div>
    </div>

    <section class="panel"><div class="panel__head"><h2 class="h2">Points preview</h2><span class="muted small">What the site will show once this file is live</span></div><div class="panel__body--pad">${previewView(parsed)}</div></section>
  </div>`;
}

/* ----------------------------------------------------------------- events */
const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };

app.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const a = b.dataset.act;
  const list = st.sessions[tab];
  if (a === 'round') { roundId = Number(b.dataset.id); st = load(roundId); pasteMsg = ''; }
  else if (a === 'status') st.status = b.dataset.k;
  else if (a === 'out') { const c = b.dataset.code; st.out = st.out.includes(c) ? st.out.filter(x => x !== c) : regulars.map(d => d.code).filter(x => x === c || st.out.includes(x)); }
  else if (a === 'tab') { tab = b.dataset.k; pasteMsg = ''; }
  else if (a === 'place') list.push({ code: b.dataset.code, mark: null });
  else if (a === 'up') move(list, +b.dataset.i, -1);
  else if (a === 'down') move(list, +b.dataset.i, 1);
  else if (a === 'del') { const [x] = list.splice(+b.dataset.i, 1); if (st.fastest[tab] === x.code) delete st.fastest[tab]; }
  else if (a === 'mark') { const x = list[+b.dataset.i]; x.mark = x.mark === b.dataset.m ? null : b.dataset.m; if (x.mark && st.fastest[tab] === x.code) delete st.fastest[tab]; }
  else if (a === 'paste') applyPaste($('#paste').value);
  else if (a === 'copy') {
    const text = output().text;
    try { await navigator.clipboard.writeText(text); } catch { const r = document.createRange(); r.selectNodeContents($('#file')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('copy'); }
    toast(`Copied ${pad(roundId)}.txt`);
    return;
  } else if (a === 'download') {
    const url = URL.createObjectURL(new Blob([output().text], { type: 'text/plain' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: `${pad(roundId)}.txt` });
    document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    return;
  }
  const open = $$('details[open]').map(d => d.querySelector('summary')?.textContent);
  render();
  $$('details').forEach(d => { if (open.includes(d.querySelector('summary')?.textContent)) d.open = true; });
});
app.addEventListener('change', e => {
  if (e.target.id === 'fl') { if (e.target.value) st.fastest[tab] = e.target.value; else delete st.fastest[tab]; render(); }
});
app.addEventListener('input', e => {
  if (e.target.id === 'notes') {
    st.notes = e.target.value;
    const { text } = output(); $('#file').textContent = text;
  }
});

render();

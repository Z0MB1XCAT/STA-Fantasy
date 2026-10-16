// Results entry: build a round's results with a live points preview, then save them to the database so
// the site shows them straight away (no commit, no deploy). Copy and download stay as a backup.
import { boot } from '../shell.js';
import { esc, $, $$, money, fmtNum, signed, colorOf, nameOf, teamLine, statusBadge, posBox, toast, roundStatus } from '../ui.js';
import { bust, tchip, ident } from '../components.js';
import { parseRound, serializeRound } from '../engine/parseRound.js';
import { buildSeason } from '../engine/season.js';
import { mergeReserves, suggestCode, checkReserve, roundsUsing } from '../engine/reserves.js';

const ctx = await boot('admin');
const { raw, store, now, sources } = ctx;
let S = ctx.S;                       // rebuilt after a save so round chips and previews stay current
const roundsMap = ctx.rounds;
const app = $('#app');
let codes = new Set(S.drivers.map(d => d.code));
const regulars = S.drivers.filter(d => d.role === 'regular');
const pad = n => String(n).padStart(2, '0');

const blank = id => ({ round: id, status: 'provisional', out: [], sessions: { quali: [], reverse: [], feature: [] }, grids: {}, fastest: {}, notes: '' });
const clone = o => JSON.parse(JSON.stringify(o));

let roundId, st, baseline;           // baseline: the round as opened or last saved, to tell whether there is anything to save
let tab = 'quali';
let pasteMsg = '';
let saving = false, saveError = '';
let history = null, historyBusy = false, historyError = '';   // earlier versions of the open round, loaded on request
const canSave = () => !!store.user?.isAdmin;

// Reserves added here are rows in the database (the site reads them on every load); XMK and KIE are built into drivers.json.
const blankReserve = () => ({ name: '', code: '', simgrid: '', discord: '', codeTouched: false });
let reserveRows = [...ctx.reserves];
let contacts = {};                   // Discord names, admin only: loaded once the page is up
let rv = blankReserve();             // the add form, kept here so a re-render doesn't wipe what was typed
let rvBusy = false, rvError = '';

/** Rebuild the season after the reserves change so the pool, the codes and the previews know about them. */
function refreshDrivers() {
  raw.drivers = mergeReserves(raw.drivers, reserveRows, raw.season.prices.reservePrice ?? raw.season.prices.min);
  S = buildSeason({ ...raw, rounds: roundsMap });
  codes = new Set(S.drivers.map(d => d.code));
}

function openRound(id) {
  roundId = id;
  st = load(id);
  baseline = serializeRound(st);
  pasteMsg = ''; saveError = ''; history = null; historyError = '';
}

function load(id) {
  const existing = roundsMap.get(id);
  if (existing && existing.ok && existing.status !== 'upcoming') return clone(existing);
  // no results yet: before the deadline you are most likely announcing who isn't racing, after it entering results
  const b = blank(id);
  b.status = now < S.round(id).lockAt ? 'upcoming' : 'provisional';
  if (existing?.ok) { b.out = [...existing.out]; b.notes = existing.notes; }
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

const isDirty = () => output().text !== baseline;

/** The line under the Save button: what players see right now. */
function saveStatus(dirty) {
  if (saveError) return `<span class="dn">${esc(saveError)}</span>`;
  if (saving) return 'Saving…';
  if (dirty) return 'Unsaved changes. Players still see the previous version.';
  const src = sources.get(roundId);
  if (src?.source === 'database' && src.updatedAt) {
    const when = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(src.updatedAt));
    return `Saved ${when}. This is what players see.`;
  }
  return 'No changes to save.';
}

const when = iso => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** One line describing a saved version, e.g. "Provisional, 3 sessions". */
function versionSummary(content) {
  const p = parseRound(content, { codes });
  const sessions = Object.values(p.sessions).filter(l => l.length).length;
  return [p.status[0].toUpperCase() + p.status.slice(1), sessions && `${sessions} session${sessions === 1 ? '' : 's'}`, p.out.length && `${p.out.length} not racing`].filter(Boolean).join(', ');
}

/** Every replaced save is kept by the database; this lists them and lets the admin load one back into the editor. */
function historyPanel() {
  if (!canSave()) return '';
  let body;
  if (historyBusy) body = '<p class="muted small" role="status">Loading…</p>';
  else if (history && history.roundId === roundId) {
    body = history.items.length
      ? `<div class="tower">${history.items.map((h, i) => `<div class="row"><div class="who"><b>${when(h.savedAt)}</b><small>${esc(versionSummary(h.content))}${h.by ? `, saved by ${esc(h.by)}` : ''}</small></div>
          <button class="btn btn--ghost btn--sm" type="button" data-act="restore" data-i="${i}">Load</button></div>`).join('')}</div>`
      : '<p class="muted small">No earlier versions of this round yet. One is kept each time a saved round is replaced.</p>';
  } else {
    body = `<p class="hint">Each time you replace a saved round, the old version is kept, so a wrong save can be put back.</p>
      <div><button class="btn btn--ghost btn--sm" type="button" data-act="history">Show earlier versions</button></div>`;
  }
  return `<section class="panel"><div class="panel__head"><h2 class="h2">Earlier versions</h2><span class="muted small">Round ${roundId}</span></div>
    <div class="panel__body--pad stack" style="--gap:12px">${historyError ? `<p class="dn small" role="alert">${esc(historyError)}</p>` : ''}${body}</div></section>`;
}

function accessNotice() {
  if (canSave()) return '';
  const body = store.user
    ? `<b>This account can't save results</b><span class="muted">You can still build and preview a round here. Log in with the admin account to save it.</span>`
    : `<b>Log in to save results</b><span class="muted">You can still build and preview a round here, but saving needs the admin account. Log in before you start: logging in reloads this page.</span>`;
  return `<div class="notice notice--flag"><span class="glyph">!</span><div>${body}</div>${store.user ? '' : '<button class="btn btn--ghost btn--sm" type="button" data-act="login" style="margin-left:auto;flex:0 0 auto">Log in</button>'}</div>`;
}

/* --------------------------------------------------------------- reserves */
const takenCodes = () => new Set(S.drivers.map(d => d.code));

/** The line under the add form: why Add is off, or the last error. Quiet while the form is still empty. */
function reserveMessage(check) {
  if (!canSave()) return 'Log in with the admin account to add reserves.';
  if (rvError) return `<span class="dn">${esc(rvError)}</span>`;
  if (!rv.name && !rv.code) return '';
  // while the name is still being typed there is no suggested code yet; don't nag about it
  const errs = check.errors.filter(e => rv.codeTouched || rv.code || !/3-character/.test(e));
  return errs.length ? esc(errs[0]) : '';
}

/** Updates the add form in place as the admin types (a full render would drop the cursor). */
function syncReserveForm() {
  if (!rv.codeTouched) {
    rv.code = rv.name.trim() || rv.simgrid.trim() || rv.discord.trim() ? suggestCode(rv.name, takenCodes(), rv.simgrid, rv.discord) : '';
    const el = $('#rv-code'); if (el) el.value = rv.code;
  }
  const check = checkReserve(rv, takenCodes());
  const btn = $('#rv-add'); if (btn) btn.disabled = !(check.ok && canSave() && !rvBusy);
  const msg = $('#rv-msg'); if (msg) msg.innerHTML = reserveMessage(check);
}

function reservesPanel() {
  const list = S.drivers.filter(d => d.role === 'reserve');
  const check = checkReserve(rv, takenCodes());
  const row = d => {
    const info = [d.simgrid ? `SimGrid ${d.simgrid}` : 'No SimGrid account', contacts[d.code] && `Discord ${contacts[d.code]}`].filter(Boolean).join(', ');
    return `<div class="row">${bust(S, d.code)}<b class="num" style="font-size:1.1rem;min-width:44px">${d.code}</b>
      <div class="who"><b>${esc(d.name)}</b><small>${esc(info)}</small></div>
      ${d.added
        ? `<button class="btn btn--ghost btn--sm" type="button" data-act="rv-remove" data-code="${d.code}" aria-label="Remove ${esc(d.name)}" ${canSave() ? '' : 'disabled'}>Remove</button>`
        : '<span class="muted small">Built in</span>'}</div>`;
  };
  const field = (id, label, hint, extra = '') => `<div class="field"><label for="rv-${id}">${label}</label>
    <input class="input" id="rv-${id}" value="${esc(rv[id])}" autocomplete="off" ${extra}>${hint ? `<small class="hint" id="rv-${id}-hint">${hint}</small>` : ''}</div>`;
  return `<details class="panel dd" data-key="reserves"><summary class="panel__head"><h2 class="h2">Reserves</h2><span class="muted small">${list.length} available</span></summary>
    <div class="panel__body--pad stack" style="--gap:16px">
      <p class="hint">Reserves fill the grid when a regular can't race. Place them in a session below so everyone else's finishing positions are right. They can't be picked and don't score for anyone. A reserve you add here is on the site straight away, with nothing to deploy.</p>
      <div class="tower rv-list">${list.map(row).join('')}</div>
      <form id="reserve-form" class="stack" style="--gap:12px" novalidate>
        <h3 class="h3">Add a reserve</h3>
        <div class="rv-grid">
          ${field('name', 'Name shown on the site', '', 'maxlength="40" required')}
          ${field('code', 'Code', 'Used in the results. Suggested from the name.', 'maxlength="3" spellcheck="false" autocapitalize="characters" aria-describedby="rv-code-hint" required')}
          ${field('simgrid', 'SimGrid username <span class="faint">(optional)</span>', 'Leave empty if they have no account.', 'maxlength="60" spellcheck="false"')}
          ${field('discord', 'Discord name <span class="faint">(optional)</span>', 'Only you can see this.', 'maxlength="60" spellcheck="false"')}
        </div>
        <div class="row-flex"><button class="btn btn--red btn--sm" type="submit" id="rv-add" ${check.ok && canSave() && !rvBusy ? '' : 'disabled'}>Add reserve</button><span class="hint" id="rv-msg" role="status">${reserveMessage(check)}</span></div>
      </form>
    </div></details>`;
}

/** Remove a reserve you added. Refused while any round (saved, or open here unsaved) still has them in it. */
async function removeReserve(code) {
  const d = S.driverMap.get(code);
  if (!d?.added || rvBusy) return;
  const rounds = new Map(roundsMap); rounds.set(roundId, st);
  const used = roundsUsing(code, rounds);
  if (used.length) {
    toast(`${d.name} is in the results for round${used.length > 1 ? 's' : ''} ${used.join(', ')}, so they can't be removed. Take them out of those results and save first.`, 'bad');
    return;
  }
  if (!confirm(`Remove ${d.name} (${code}) from the reserves?`)) return;
  rvBusy = true;
  try {
    await store.removeReserve(code);
    reserveRows = reserveRows.filter(r => r.code !== code);
    delete contacts[code];
    refreshDrivers();
    toast(`Removed ${d.name}.`);
  } catch (ex) { toast(ex.message || 'Could not remove. Try again.', 'bad'); }
  rvBusy = false;
}

function render() {
  const { text, parsed } = output();
  const adv = advisories();
  const fileName = `${pad(roundId)}.txt`;
  const dirty = text !== baseline;
  app.innerHTML = `<div class="stack" style="--gap:22px">
    <div><h1 class="h1">Enter results</h1><p class="muted" style="margin-top:8px;max-width:64ch">Build a round's results here, then press Save to site. Players see the change as soon as they refresh. Nothing is saved until you press it, so you can experiment safely.</p></div>
    ${accessNotice()}

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
            <p class="hint">Know before the deadline that someone can't make it? Tap them here, keep the status on <b>Upcoming</b> and press <b>Save to site</b>. Everyone sees them greyed out as <b>Not racing</b>, so they can use a transfer on them in time. Transfers work as normal. If they turn up after all, just put them in the results and they score as usual.</p>
            <div class="pool" role="group" aria-label="Drivers not racing">${regulars.filter(d => !d.retired).map(d => `<button type="button" data-act="out" data-code="${d.code}" aria-pressed="${st.out.includes(d.code)}">${bust(S, d.code)}${esc(d.name)}</button>`).join('')}</div>
          </div></section>

        ${reservesPanel()}

        <section class="panel"><div class="panel__head"><div class="seg" role="group" aria-label="Session">${[['quali', 'Short Quali'], ['reverse', 'Reverse Grid'], ['feature', 'Feature Race']].map(([k, l]) => `<button type="button" data-act="tab" data-k="${k}" aria-pressed="${tab === k}">${l} <span class="faint">${st.sessions[k].length}</span></button>`).join('')}</div></div>
          <div class="panel__body--pad stack" style="--gap:18px" id="builder">${sessionBuilder()}</div></section>
      </div>

      <div class="stack" style="--gap:20px">
        <section class="panel panel--raised"><div class="panel__head"><h2 class="h2">Round ${roundId} results</h2>${parsed.ok ? statusBadge('final', 'Ready to save') : statusBadge('locked', 'Needs fixing')}</div>
          <div class="panel__body--pad stack" style="--gap:14px">
            <pre class="file" id="file">${esc(text)}</pre>
            ${adv.length ? `<div class="notice notice--flag"><span class="glyph">!</span><div>${adv.map(a => `<span class="muted" style="display:block">${esc(a)}</span>`).join('')}</div></div>` : ''}
            <div class="field"><label for="notes">Notes <span class="faint">(optional)</span></label><input class="input" id="notes" value="${esc(st.notes)}" placeholder="e.g. +5s on KAM after stewards"></div>
            <div class="row-flex"><button class="btn btn--red" type="button" data-act="save" ${parsed.ok && canSave() && !saving && dirty ? '' : 'disabled'}>Save to site</button><span class="hint" id="save-status" role="status" tabindex="-1">${saveStatus(dirty)}</span></div>
            <div class="row-flex"><button class="btn btn--ghost btn--sm" type="button" data-act="copy" ${parsed.ok ? '' : 'disabled'}>Copy file</button><button class="btn btn--ghost btn--sm" type="button" data-act="download" ${parsed.ok ? '' : 'disabled'}>Download ${fileName}</button><span class="hint">Backup copy of the file</span></div>
          </div></section>
        ${historyPanel()}
        <details class="panel dd" data-key="codes"><summary class="panel__head" style="cursor:pointer;list-style:none"><h2 class="h2">Driver codes</h2><span class="muted small">Tap to expand</span></summary>
          <div class="panel__body"><div class="tower">${S.drivers.map(d => `<div class="row">${bust(S, d.code)}<b class="num" style="font-size:1.1rem;min-width:44px">${d.code}</b><div class="who"><b>${esc(d.name)}</b><small>${esc(teamLine(S, d.code))}, ${esc(d.simgrid || 'no SimGrid account')}</small></div></div>`).join('')}</div></div></details>
      </div>
    </div>

    <section class="panel"><div class="panel__head"><h2 class="h2">Points preview</h2><span class="muted small">What players will see once this is saved</span></div><div class="panel__body--pad">${previewView(parsed)}</div></section>
  </div>`;
}

/* ----------------------------------------------------------------- events */
const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };

/** Render again but keep the collapsible panels (reserves, driver codes) as they were. */
function rerender() {
  const open = $$('details[open]').map(d => d.dataset.key);
  render();
  $$('details').forEach(d => { if (open.includes(d.dataset.key)) d.open = true; });
}

app.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const a = b.dataset.act;
  const list = st.sessions[tab];
  if (a === 'round') {
    if (Number(b.dataset.id) === roundId) return;
    if (isDirty() && !confirm('You have unsaved changes to this round. Discard them?')) return;
    openRound(Number(b.dataset.id));
  }
  else if (a === 'login') { window.openAuth?.('login'); return; }
  else if (a === 'save') {
    const { text, parsed } = output();
    if (saving || !parsed.ok || !canSave()) return;
    saving = true; saveError = '';
    rerender();
    try {
      const res = await store.saveResult(roundId, text);
      baseline = text;
      sources.set(roundId, { source: 'database', updatedAt: res.updatedAt });
      roundsMap.set(roundId, parsed);
      S = buildSeason({ ...raw, rounds: roundsMap });
      history = null;                      // saving may have kept a new earlier version
      toast(`Saved round ${roundId}. Players see it when they refresh.`);
    } catch (ex) {
      saveError = ex.message || 'Could not save. Try again.';
      toast(saveError, 'bad');
    }
    saving = false;
  }
  else if (a === 'history') {
    historyBusy = true; historyError = '';
    rerender();
    try { history = { roundId, items: await store.resultHistory(roundId) }; }
    catch (ex) { historyError = ex.message || 'Could not load earlier versions.'; }
    historyBusy = false;
  }
  else if (a === 'restore') {
    const h = history?.items[+b.dataset.i];
    const p = h && parseRound(h.content, { codes });
    if (!p) return;
    if (!p.ok) { toast('That version has a problem and cannot be loaded.', 'bad'); return; }
    if (isDirty() && !confirm('Replace your unsaved changes with this earlier version?')) return;
    st = { round: roundId, status: p.status, out: [...p.out], sessions: clone(p.sessions), grids: clone(p.grids), fastest: { ...p.fastest }, notes: p.notes };
    saveError = '';
    toast('Loaded. Check it, then press Save to site.');
  }
  else if (a === 'rv-remove') await removeReserve(b.dataset.code);
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
  if (a !== 'save') saveError = '';
  rerender();
  if (a === 'save') $('#save-status')?.focus();
});

app.addEventListener('submit', async e => {
  if (e.target.id !== 'reserve-form') return;
  e.preventDefault();
  if (rvBusy || !canSave()) return;
  const { clean, errors, ok } = checkReserve(rv, takenCodes());
  if (!ok) { rvError = errors[0]; syncReserveForm(); return; }
  rvBusy = true; rvError = '';
  syncReserveForm();
  try {
    const res = await store.addReserve(clean);
    reserveRows.push({ code: clean.code, name: clean.name, simgrid: clean.simgrid });
    if (clean.discord && res.contactSaved) contacts[clean.code] = clean.discord;
    refreshDrivers();
    rv = blankReserve();
    if (res.contactSaved) toast(`Added ${clean.name}. They can be placed in results now.`);
    else toast(`Added ${clean.name}, but their Discord name could not be saved.`, 'bad');
  } catch (ex) {
    rvError = ex.message || 'Could not add. Try again.';
    toast(rvError, 'bad');
  }
  rvBusy = false;
  rerender();
  if (!rvError) $('#rv-name')?.focus();
});
window.addEventListener('beforeunload', e => { if (isDirty()) e.preventDefault(); });
app.addEventListener('change', e => {
  if (e.target.id === 'fl') { if (e.target.value) st.fastest[tab] = e.target.value; else delete st.fastest[tab]; rerender(); }
});
app.addEventListener('input', e => {
  if (e.target.id === 'notes') {
    st.notes = e.target.value;
    const { text, parsed } = output(); $('#file').textContent = text;
    const dirty = text !== baseline;
    const btn = $('[data-act="save"]'); if (btn) btn.disabled = !(parsed.ok && canSave() && !saving && dirty);
    const line = $('#save-status'); if (line) line.innerHTML = saveStatus(dirty);
  }
  else if (/^rv-(name|code|simgrid|discord)$/.test(e.target.id)) {
    const k = e.target.id.slice(3);
    if (k === 'code') {
      rv.code = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      e.target.value = rv.code;
      rv.codeTouched = true;                    // from now on the code is theirs, not a suggestion
    } else rv[k] = e.target.value;
    rvError = '';
    syncReserveForm();
  }
});
// leaving the code field empty hands it back to the suggestion (not while typing, which would fight the cursor)
app.addEventListener('focusout', e => {
  if (e.target.id === 'rv-code' && rv.codeTouched && !rv.code) { rv.codeTouched = false; syncReserveForm(); }
});

openRound((S.currentRound() || S.rounds[0]).id);
render();

// the Discord names are for the admin only, so they are fetched once the page is up and filled in when they arrive
if (canSave()) {
  store.reserveContacts().then(c => {
    contacts = c;
    if (!document.activeElement?.matches?.('input, textarea, select')) rerender();   // never steal focus from a field being typed in
  }).catch(() => { /* the panel simply shows no Discord names */ });
}

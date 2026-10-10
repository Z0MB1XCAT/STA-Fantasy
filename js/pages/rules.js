import { boot, problemsNotice, contactLink } from '../shell.js';
import { esc, $, $$, money } from '../ui.js';
import { icon, shead } from '../components.js';

const { S, problems } = await boot('rules');
const c = S.cfg;
const sc = c.scoring;
const tc = c.transfers;
const pr = c.prices;
const signed = n => (n > 0 ? `+${n}` : `${n}`);

const SECTIONS = [
  ['basics', 'The basics'],
  ['weekend', 'Race weekend'],
  ['scoring', 'Scoring'],
  ['transfers', 'Transfers'],
  ['chips', 'Chips'],
  ['prices', 'Prices'],
  ['absences', 'Absent drivers'],
  ['help', 'Questions'],
];
const section = (id, body) => `<section class="rsec" id="${id}" aria-labelledby="${id}-h">
  ${shead(SECTIONS.find(s => s[0] === id)[1], '', `${id}-h`)}
  <div class="prose">${body}</div></section>`;

/* ----------------------------------------------------------- scoring tables */
const sessions = [['quali', 'Short Quali'], ['reverse', 'Reverse Grid'], ['feature', 'Feature Race']];
const rowsN = Math.max(...sessions.map(([k]) => sc[k].positions.length));
const cell = v => (v == null ? '<td class="nil">–</td>' : `<td>${v}</td>`);
const pointsTable = `<table class="ptable">
  <caption class="sr-only">Points for each finishing position</caption>
  <thead><tr><th scope="col">Position</th>${sessions.map(([, l]) => `<th scope="col">${l}</th>`).join('')}</tr></thead>
  <tbody>${Array.from({ length: rowsN }, (_, i) => `<tr><th scope="row">P${i + 1}</th>${sessions.map(([k]) => cell(sc[k].positions[i])).join('')}</tr>`).join('')}</tbody>
</table>`;

const race = k => sc[k];
const extras = [
  ['Each place gained from the grid', () => null, k => `+${race(k).gainPerPlace}`],
  ['Each place lost from the grid', () => null, k => `-${race(k).gainPerPlace}`],
  ['Fastest lap', () => null, k => signed(race(k).fastestLap)],
  ['Did not finish', () => null, k => signed(race(k).dnf)],
  ['Disqualified', () => signed(sc.quali.dsq), k => signed(race(k).dsq)],
];
const extrasTable = `<table class="ptable">
  <caption class="sr-only">Bonuses and penalties</caption>
  <thead><tr><th scope="col">Bonus or penalty</th>${sessions.map(([, l]) => `<th scope="col">${l}</th>`).join('')}</tr></thead>
  <tbody>${extras.map(([label, q, r]) => `<tr><th scope="row">${label}</th>${cell(q())}${cell(r('reverse'))}${cell(r('feature'))}</tr>`).join('')}</tbody>
</table>`;
const bonus = sc.constructor.bothInPointsBonus;

/* ------------------------------------------------------------------- page */
$('#app').innerHTML = `<div class="stack" style="--gap:22px">
  ${problemsNotice(problems)}
  <div class="page-head"><div><h1 class="h1">How it works</h1>
    <p class="muted" style="max-width:60ch">Pick a team of league drivers, score points from their real results, and beat everyone else.</p></div></div>

  <div class="rules">
    <nav class="toc" aria-label="Rules sections">${SECTIONS.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}</nav>

    <div>
      ${section('basics', `
        <div class="facts">
          <div class="fact"><span class="num">${c.squad.drivers} + ${c.squad.constructors}</span><small>drivers and constructors</small></div>
          <div class="fact"><span class="num">$${c.budget}M</span><small>starting budget</small></div>
          <div class="fact"><span class="num">${c.drs.multiplier}x</span><small>DRS Boost points</small></div>
        </div>
        <p style="margin-top:14px">A constructor is a team, and it scores the points of whoever drives its two seats. Pick one of your drivers for the DRS Boost each round; their points count ${c.drs.multiplier === 2 ? 'double' : `${c.drs.multiplier} times`}, good or bad.</p>`)}

      ${section('weekend', `
        <ol class="steps">
          <li><b>Picks open</b> once the previous round is final. Build your team and play a chip if you want one.</li>
          <li><b>Picks lock</b> when Short Quali starts, Friday at 8 pm UK time. Everyone's team becomes visible.</li>
          <li><b>Provisional</b> points appear on Friday night. Transfers stay closed while the stewards look at incidents.</li>
          <li><b>Final</b> results go in on Sunday. Prices update and picks open for the next round.</li>
        </ol>`)}

      ${section('scoring', `
        <p>Every session scores on its own. The reverse grid starts in Short Quali order backwards; the feature race starts in Short Quali order.</p>
        <div class="tablewrap">${pointsTable}</div>
        <div class="tablewrap" style="margin-top:14px">${extrasTable}</div>
        <p class="muted small" style="margin-top:10px">Places gained or lost count up to ${sc.reverse.gainCap} in the reverse grid and ${sc.feature.gainCap} in the feature race.</p>
        <p style="margin-top:14px">Constructors score both their drivers' points added together${bonus ? `, plus ${bonus.points} when both finish in the top ${bonus.topN} of the ${sc[bonus.session].label.toLowerCase()}` : ''}.</p>`)}

      ${section('transfers', `
        <ul class="ticks">
          <li>Your first team is free to build.</li>
          <li>After that you get <b>${tc.freePerRound} free transfers</b> a round, and you can save ${tc.maxBanked} unused one for the next round.</li>
          <li>Each extra transfer costs <b>${tc.penaltyPerExtra} points</b>.</li>
          <li>If you don't save a team, your last one carries over.</li>
        </ul>`)}

      ${section('chips', `
        <p>Each chip can be played once a season, and only one per round.</p>
        <div class="chipgrid">${Object.values(c.chips).map(ch => `<div><b>${esc(ch.name)}</b><span>${esc(ch.desc)}</span></div>`).join('')}</div>`)}

      ${section('prices', `
        <ul class="ticks">
          <li>After each round, drivers and constructors are compared on points per million over their last ${pr.window} races.</li>
          <li>The best value rises, the worst value falls. Cheaper players move more: up to ${money(pr.moves.B.great)} a round, against ${money(pr.moves.A.great)} for expensive ones.</li>
          <li>Prices stay between ${money(pr.min)} and ${money(pr.max)}. You always sell at the current price.</li>
          <li>New prices only count once a round is marked final.</li>
        </ul>`)}

      ${section('absences', `
        <ul class="ticks">
          <li>A driver who doesn't turn up scores <b>0 points</b> for that round. It works like a DNF, but without the penalty points.</li>
          <li>They show greyed out in your team for that round. If they were your DRS Boost, the boost scores 0 too.</li>
          <li>${c.prices.absentCountsAsRace !== false ? 'For prices, the missed round counts as a 0-point race, so a no-show can drop in price.' : 'Missing a race does not change their price.'}</li>
          <li>Reserve drivers aren't part of the game. They can't be picked and don't score for anyone, including constructors.</li>
        </ul>`)}

      ${section('help', `
        <div class="row-flex spread">
          <p>Confused about anything, or think a result is wrong? ${contactLink(S, true)}.</p>
          ${c.discord ? `<a class="btn btn--red btn--sm" href="${esc(c.discord)}" target="_blank" rel="noopener">${icon('chat')}Open Discord</a>` : ''}
        </div>`)}
    </div>
  </div>
</div>`;

// highlight the section you are reading
const links = $$('.toc a');
const spy = new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) links.forEach(a => a.setAttribute('aria-current', String(a.hash === '#' + e.target.id)));
}, { rootMargin: '-30% 0px -60% 0px' });
$$('.rsec').forEach(s => spy.observe(s));

// the page is built after load, so honour a #section link ourselves
if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();

// Writes calendar.ics: every pick deadline with a reminder 3 hours before, for phones and calendar apps.
//   node tools/make-ics.mjs        (re-run whenever data/calendar.json changes)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cal = JSON.parse(fs.readFileSync(path.join(root, 'data/calendar.json'), 'utf8'));
const SITE = 'https://z0mb1xcat.github.io/STA-Fantasy/';
const stamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const now = stamp(new Date());

const events = cal.rounds.map(r => {
  const start = new Date(r.lockUtc);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return [
    'BEGIN:VEVENT',
    `UID:sta-fantasy-r${r.id}-lock@stafantasy`,
    `DTSTAMP:${now}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:STA Fantasy picks lock: Round ${r.id}\\, ${r.name}`,
    `DESCRIPTION:Save your team before Short Quali starts. ${SITE}team.html`,
    `URL:${SITE}team.html`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:STA Fantasy picks lock in 3 hours (${r.name})`,
    'TRIGGER:-PT3H',
    'END:VALARM',
    'END:VEVENT',
  ].join('\r\n');
});

// RFC 5545: lines longer than 75 octets are folded with CRLF + a space
const fold = line => { const out = []; while (line.length > 75) { out.push(line.slice(0, 75)); line = ' ' + line.slice(75); } out.push(line); return out.join('\r\n'); };
const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//STA Fantasy//Deadlines//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
  'X-WR-CALNAME:STA Fantasy deadlines', ...events, 'END:VCALENDAR'].join('\r\n').split('\r\n').map(fold).join('\r\n') + '\r\n';
fs.writeFileSync(path.join(root, 'calendar.ics'), ics);
console.log(`Wrote calendar.ics with ${events.length} deadlines`);

/**
 * social-cards.js — branded 1080x1350 (4:5) graphics for the daily social
 * pipeline, rendered from HTML templates rather than screenshotted off a
 * live page. Used by social-post-daily.js for the data-driven post types
 * (tale of the tape, dream matchup, picks lock, pick split, upset, on this
 * day).
 *
 * Look: dark and minimal (see feedback rules: no playful/confetti styling),
 * site accent #f2600f, Barlow Condensed headlines, Inter body. Fighter
 * images are the transparent full-body cutouts from fighters.json /
 * events.json (cloudfront), anchored to the bottom of the frame.
 */
import fs    from 'fs';
import path  from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, '..', 'images', 'mma-bridge-logo.png');

export const CARD_W = 1080;
export const CARD_H = 1350;
const ACCENT = '#f2600f';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let _logo = null;
async function logoDataUri() {
  if (_logo) return _logo;
  // Trim the square logo's black margin so it sits tight in the header.
  const buf = await sharp(LOGO_PATH).trim({ threshold: 20 }).resize({ height: 160 }).png().toBuffer();
  _logo = `data:image/png;base64,${buf.toString('base64')}`;
  return _logo;
}

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${CARD_W}px;height:${CARD_H}px;overflow:hidden}
body{background:#0a0a0a;color:#fff;font-family:'Inter',sans-serif;position:relative;-webkit-font-smoothing:antialiased}
.glow{position:absolute;inset:0;background:
  radial-gradient(900px 600px at 50% -10%, rgba(242,96,15,.16), transparent 70%),
  radial-gradient(700px 500px at 50% 110%, rgba(255,255,255,.05), transparent 70%)}
.hdr{position:absolute;top:52px;left:64px;right:64px;display:flex;align-items:center;justify-content:space-between;z-index:5}
.hdr img{height:64px}
.kicker{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:30px;letter-spacing:.14em;color:${ACCENT};text-transform:uppercase}
.ftr{position:absolute;bottom:48px;left:64px;right:64px;display:flex;justify-content:space-between;align-items:center;z-index:5;
  font-family:'Montserrat',sans-serif;font-weight:600;font-size:22px;letter-spacing:.2em;color:rgba(255,255,255,.72);text-transform:uppercase}
.ftr .cta{color:#fff}
.bc{font-family:'Barlow Condensed',sans-serif;font-weight:800;text-transform:uppercase;line-height:.92}
.muted{color:rgba(255,255,255,.6)}
.accent{color:${ACCENT}}
.fighter{position:absolute;bottom:0;height:900px;width:540px;display:flex;align-items:flex-end;justify-content:center;z-index:1}
.fighter img{height:100%;width:auto;max-width:none;flex:none}
.fighter.l{left:-60px}.fighter.r{right:-60px}
.fade{position:absolute;left:0;right:0;bottom:0;height:520px;background:linear-gradient(to top,#0a0a0a 18%,rgba(10,10,10,.85) 45%,transparent);z-index:2}
`;

function page(body, { kicker, cta = 'Make your picks' } = {}, logo) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700&family=Inter:wght@400;500;600;700&family=Barlow+Condensed:wght@600;800&display=swap" rel="stylesheet">
<style>${BASE_CSS}</style></head><body>
<div class="glow"></div>
<div class="hdr"><img src="${logo}" alt=""><div class="kicker">${esc(kicker)}</div></div>
${body}
<div class="ftr"><span>mmabridge.com</span><span class="cta">${esc(cta)}</span></div>
</body></html>`;
}

function fighterImg(url, side) {
  return url ? `<div class="fighter ${side}"><img src="${esc(url)}" alt=""></div>` : '';
}

/** Render an HTML card to a 1080x1350 PNG. 2x device scale, then downsampled for clean edges. */
export async function renderCard(browserPage, html, outPath) {
  await browserPage.setViewport({ width: CARD_W, height: CARD_H, deviceScaleFactor: 2 });
  await browserPage.setContent(html, { waitUntil: 'networkidle0', timeout: 45000 });
  await browserPage.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
  });
  const raw = await browserPage.screenshot({ clip: { x: 0, y: 0, width: CARD_W, height: CARD_H } });
  await sharp(raw).resize(CARD_W, CARD_H).png().toFile(outPath);
}

// ── Templates ────────────────────────────────────────────────────────────────

/**
 * rows: [{ label, a, b, better: 'high'|'low'|null }] — values are display
 * strings; `better` highlights the stronger side for numeric stats only.
 */
export async function taleOfTapeHtml({ eventName, a, b, rows }) {
  const num = v => parseFloat(String(v).replace(/[^0-9.]/g, ''));
  const rowHtml = rows.map(r => {
    let hiA = false, hiB = false;
    if (r.better) {
      const x = num(r.a), y = num(r.b);
      if (!isNaN(x) && !isNaN(y) && x !== y) {
        hiA = r.better === 'high' ? x > y : x < y;
        hiB = !hiA;
      }
    }
    return `<div class="row"><span class="v ${hiA ? 'accent' : ''}">${esc(r.a)}</span><span class="lbl">${esc(r.label)}</span><span class="v ${hiB ? 'accent' : ''}">${esc(r.b)}</span></div>`;
  }).join('');
  const body = `
<style>
.title{position:absolute;top:150px;left:0;right:0;text-align:center;z-index:4}
.title .ev{font-size:24px;letter-spacing:.18em;text-transform:uppercase}
.title .m{font-size:92px;margin-top:10px}
.title .m span{color:rgba(255,255,255,.45);font-size:60px;vertical-align:middle;margin:0 14px}
.panel{position:absolute;left:50%;transform:translateX(-50%);top:330px;width:560px;z-index:4;
  background:rgba(10,10,10,.72);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:18px 26px}
.row{display:grid;grid-template-columns:1fr 210px 1fr;align-items:center;height:56px;border-bottom:1px solid rgba(255,255,255,.07)}
.row:last-child{border-bottom:0}
.v{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:34px;text-align:center}
.lbl{font-size:15px;letter-spacing:.12em;text-transform:uppercase;text-align:center;color:rgba(255,255,255,.55);font-weight:600}
.names{position:absolute;bottom:120px;left:64px;right:64px;display:flex;justify-content:space-between;z-index:4}
.names .n{font-size:64px}.names .r{font-size:24px;margin-top:6px;letter-spacing:.08em}
.names .rt{text-align:right}
.fighter{height:860px}
</style>
${fighterImg(a.img, 'l')}${fighterImg(b.img, 'r')}<div class="fade"></div>
<div class="title"><div class="ev muted">${esc(eventName)}</div>
<div class="m bc">${esc(a.last)}<span>vs</span>${esc(b.last)}</div></div>
<div class="panel">${rowHtml}</div>
<div class="names"><div><div class="n bc">${esc(a.last)}</div><div class="r muted">${esc(a.record)}</div></div>
<div class="rt"><div class="n bc">${esc(b.last)}</div><div class="r muted">${esc(b.record)}</div></div></div>`;
  return page(body, { kicker: 'Tale of the tape' }, await logoDataUri());
}

export async function dreamMatchupHtml({ division, a, b }) {
  const body = `
<style>
.fighter{height:920px}
.top{position:absolute;top:170px;left:0;right:0;text-align:center;z-index:4}
.top .d{font-size:26px;letter-spacing:.2em;text-transform:uppercase}
.top .q{font-size:150px;margin-top:14px}
.vs{position:absolute;top:600px;left:0;right:0;text-align:center;font-size:110px;z-index:4;color:rgba(255,255,255,.18)}
.names{position:absolute;bottom:130px;left:64px;right:64px;display:flex;justify-content:space-between;z-index:4}
.names .rk{font-size:24px;letter-spacing:.14em;text-transform:uppercase;font-weight:600}
.names .n{font-size:72px;margin-top:6px}.names .rt{text-align:right}
</style>
${fighterImg(a.img, 'l')}${fighterImg(b.img, 'r')}<div class="fade"></div>
<div class="top"><div class="d muted">${esc(division)}</div><div class="q bc">Who wins?</div></div>
<div class="vs bc">VS</div>
<div class="names"><div><div class="rk accent">${esc(a.rankLabel)}</div><div class="n bc">${esc(a.last)}</div></div>
<div class="rt"><div class="rk accent">${esc(b.rankLabel)}</div><div class="n bc">${esc(b.last)}</div></div></div>`;
  return page(body, { kicker: 'Dream matchup', cta: 'Drop your pick' }, await logoDataUri());
}

export async function picksLockHtml({ eventName, matchup, lockLabel, poster, pickCountLine }) {
  const body = `
<style>
.bgimg{position:absolute;inset:0;background:url('${esc(poster)}') center/cover no-repeat;filter:brightness(.38) saturate(.9);z-index:0}
.shade{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(10,10,10,.55),rgba(10,10,10,.2) 40%,rgba(10,10,10,.92) 85%);z-index:1}
.c{position:absolute;left:64px;right:64px;bottom:170px;z-index:4}
.c .ev{font-size:26px;letter-spacing:.18em;text-transform:uppercase}
.c .big{font-size:190px;margin-top:18px}
.c .when{font-size:64px;margin-top:22px}
.c .m{font-size:30px;margin-top:30px;font-weight:600;letter-spacing:.04em}
.c .pc{font-size:24px;margin-top:14px}
.bar{width:120px;height:6px;background:${ACCENT};margin-top:34px}
</style>
${poster ? '<div class="bgimg"></div>' : ''}<div class="shade"></div>
<div class="c"><div class="ev muted">${esc(eventName)}</div>
<div class="big bc">Picks<br>lock</div>
<div class="when bc accent">${esc(lockLabel)}</div>
<div class="bar"></div>
<div class="m">${esc(matchup)}</div>
${pickCountLine ? `<div class="pc muted">${esc(pickCountLine)}</div>` : ''}</div>`;
  return page(body, { kicker: 'Last call' }, await logoDataUri());
}

export async function pickSplitHtml({ eventName, a, b }) {
  const body = `
<style>
.fighter{height:900px}
.top{position:absolute;top:170px;left:0;right:0;text-align:center;z-index:4}
.top .ev{font-size:24px;letter-spacing:.18em;text-transform:uppercase}
.top .q{font-size:110px;margin-top:12px}
.pcts{position:absolute;bottom:190px;left:64px;right:64px;display:flex;justify-content:space-between;align-items:flex-end;z-index:4}
.pcts .p{font-size:170px}.pcts .n{font-size:40px;margin-top:4px}.pcts .rt{text-align:right}
.split{position:absolute;bottom:140px;left:64px;right:64px;height:14px;display:flex;border-radius:7px;overflow:hidden;z-index:4}
.split .sa{background:${ACCENT}}.split .sb{background:rgba(255,255,255,.28)}
</style>
${fighterImg(a.img, 'l')}${fighterImg(b.img, 'r')}<div class="fade"></div>
<div class="top"><div class="ev muted">${esc(eventName)}</div><div class="q bc">The crowd's pick</div></div>
<div class="pcts"><div><div class="p bc ${a.pct >= b.pct ? 'accent' : ''}">${a.pct}%</div><div class="n bc">${esc(a.last)}</div></div>
<div class="rt"><div class="p bc ${b.pct > a.pct ? 'accent' : ''}">${b.pct}%</div><div class="n bc">${esc(b.last)}</div></div></div>
<div class="split"><div class="sa" style="width:${a.pct}%"></div><div class="sb" style="width:${b.pct}%"></div></div>`;
  return page(body, { kicker: 'Community picks' }, await logoDataUri());
}

export async function upsetHtml({ eventName, winner, loser, pct, method }) {
  const body = `
<style>
.fighter{height:1080px;width:640px;left:auto;right:-80px}
.c{position:absolute;left:64px;top:180px;width:660px;z-index:4}
.c .ev{font-size:24px;letter-spacing:.18em;text-transform:uppercase}
.c .h{font-size:120px;margin-top:16px}
.c .p{font-size:230px;margin-top:36px}
.c .only{font-size:32px;margin-top:6px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;width:470px;line-height:1.3}
.res{position:absolute;left:64px;right:64px;bottom:140px;z-index:4}
.res .w{font-size:84px}.res .d{font-size:30px;margin-top:10px;letter-spacing:.06em;white-space:nowrap}
</style>
${fighterImg(winner.img, 'r')}<div class="fade"></div>
<div class="c"><div class="ev muted">${esc(eventName)}</div>
<div class="h bc">Upset of<br>the night</div>
<div class="p bc accent">${pct}%</div>
<div class="only muted">of MMA Bridge picked ${esc(winner.last)}</div></div>
<div class="res"><div class="w bc">${esc(winner.last)}</div>
<div class="d muted">def. ${esc(loser)}${method ? ` · ${esc(method)}` : ''}</div></div>`;
  return page(body, { kicker: 'Community picks', cta: 'Beat the crowd' }, await logoDataUri());
}

export async function onThisDayHtml({ year, dateLabel, eventName, winner, loser, method }) {
  const body = `
<style>
.fighter{height:1080px;width:640px;left:auto;right:-80px}
.c{position:absolute;left:64px;top:180px;width:600px;z-index:4}
.c .d{font-size:28px;letter-spacing:.2em;text-transform:uppercase}
.c .y{font-size:300px;margin-top:4px}
.res{position:absolute;left:64px;right:64px;bottom:140px;z-index:4}
.res .ev{font-size:24px;letter-spacing:.14em;text-transform:uppercase}
.res .w{font-size:96px;margin-top:14px}.res .d2{font-size:32px;margin-top:10px;letter-spacing:.04em;white-space:nowrap}
</style>
${fighterImg(winner.img, 'r')}<div class="fade"></div>
<div class="c"><div class="d muted">${esc(dateLabel)}</div><div class="y bc accent">${esc(year)}</div></div>
<div class="res"><div class="ev muted">${esc(eventName)}</div>
<div class="w bc">${esc(winner.last)}</div>
<div class="d2 muted">def. ${esc(loser)}${method ? ` · ${esc(method)}` : ''}</div></div>`;
  return page(body, { kicker: 'On this day', cta: 'Full archive' }, await logoDataUri());
}

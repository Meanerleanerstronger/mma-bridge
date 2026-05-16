/* ── Lucas Bot Floating Widget ── */

let chatOpen = false;
let chatHistory = [];
let chatBusy = false;
let lucasLiveData = null; // holds { events, fighters } fetched at startup

const BACKEND = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:5001/api/chat'
  : 'https://mmabridge-backend.onrender.com/api/chat';

// Wake up Render + record visitor on every page load
if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
  fetch('https://mmabridge-backend.onrender.com/api/health').catch(() => {});
  fetch('https://mmabridge-backend.onrender.com/api/visitors/ping', { method: 'POST' }).catch(() => {});
}

// Fetch events + fighters at startup and build a structured context for Lucas
async function loadLiveData() {
  try {
    const [evRes, fRes] = await Promise.all([
      fetch('events.json'),
      fetch('data/fighters.json')   // richer fighter data with full records
    ]);
    const [events, fighters] = await Promise.all([
      evRes.ok  ? evRes.json()  : null,
      fRes.ok   ? fRes.json()   : null
    ]);
    if (!events && !fighters) return;

    const now = new Date();
    const allEvents = events || [];

    // Build a compact context summary Lucas can use to ground answers
    const upcoming = allEvents
      .filter(e => e.status === 'upcoming')
      .slice(0, 5)
      .map(e => ({
        name: e.name,
        date: e.date,
        location: e.location || '',
        mainCard: (e.mainCard || []).slice(0, 5).map(f => `${f.a} vs ${f.b}`)
      }));

    const recent = allEvents
      .filter(e => e.status === 'completed')
      .slice(-3)
      .map(e => ({
        name: e.name,
        date: e.date,
        results: (e.mainCard || []).slice(0, 3).map(f => f.winner ? `${f.winner} def. ${f.a === f.winner ? f.b : f.a} (${f.method || 'DEC'})` : `${f.a} vs ${f.b}`)
      }));

    lucasLiveData = {
      events: allEvents,
      fighters: fighters || [],
      context: { upcoming, recent, generatedAt: now.toISOString() }
    };
  } catch (e) {
    // silently fail — backend will use its own disk copies as fallback
  }
}

function initWidget() {
  document.body.insertAdjacentHTML('beforeend', `
    <div id="lw-btn" onclick="toggleChat()">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    </div>

    <div id="lw-window">
      <div id="lw-header">
        <div id="lw-header-left">
          <div id="lw-avatar">🥊</div>
          <div>
            <div id="lw-name">Lucas</div>
            <div id="lw-status"><span id="lw-dot"></span>Online</div>
          </div>
        </div>
        <div id="lw-header-right">
          <button id="lw-expand" title="Open full Lucas interface">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
          </button>
          <button id="lw-close" onclick="toggleChat()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
      <div id="lw-msgs">
        <div class="lw-msg lw-bot">
          <div class="lw-msg-av">🥊</div>
          <div class="lw-msg-bub">Yo — ask me anything about fighters, events, results, predictions. I got you.</div>
        </div>
      </div>
      <div id="lw-input-area">
        <input id="lw-input" type="text" placeholder="Ask Lucas..." autocomplete="off" />
        <button id="lw-send">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  `);

  const style = document.createElement('style');
  style.textContent = `
    #lw-btn {
      position: fixed; bottom: 28px; right: 28px;
      width: 52px; height: 52px; border-radius: 14px;
      background: #00e5ff; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      color: #000; z-index: 9998;
      box-shadow: 0 4px 24px rgba(0,229,255,0.35);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #lw-btn:hover { transform: scale(1.08); box-shadow: 0 6px 32px rgba(0,229,255,0.5); }

    #lw-window {
      position: fixed; bottom: 92px; right: 28px;
      width: 340px; height: 480px;
      background: #0f0f0f;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 18px;
      display: flex; flex-direction: column;
      overflow: hidden; z-index: 9999;
      box-shadow: 0 20px 60px rgba(0,0,0,0.7);
      opacity: 0; pointer-events: none;
      transform: translateY(16px) scale(0.97);
      transition: opacity 0.22s ease, transform 0.22s ease;
    }
    #lw-window.open {
      opacity: 1; pointer-events: all;
      transform: translateY(0) scale(1);
    }

    #lw-header {
      background: #141414;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      padding: 14px 16px;
      display: flex; align-items: center; justify-content: space-between;
      flex-shrink: 0;
    }
    #lw-header-left { display: flex; align-items: center; gap: 10px; }
    #lw-avatar {
      width: 34px; height: 34px; border-radius: 50%;
      background: #1c1c1c; border: 1px solid rgba(0,229,255,0.2);
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; flex-shrink: 0;
    }
    #lw-name {
      font-family: 'Montserrat', sans-serif;
      font-size: 0.8rem; font-weight: 800;
      letter-spacing: 0.06em; text-transform: uppercase;
      color: #fff;
    }
    #lw-status {
      font-size: 0.58rem; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: #00e676; margin-top: 2px;
      display: flex; align-items: center; gap: 4px;
    }
    #lw-dot {
      width: 5px; height: 5px; border-radius: 50%;
      background: #00e676; display: inline-block;
      animation: lwpulse 2s infinite;
    }
    @keyframes lwpulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(0,230,118,0.5); }
      50% { box-shadow: 0 0 0 4px rgba(0,230,118,0); }
    }
    #lw-header-right { display: flex; align-items: center; gap: 2px; }
    #lw-expand {
      background: none; border: none; color: rgba(255,255,255,0.25);
      cursor: pointer; padding: 5px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 6px; transition: color 0.15s;
    }
    #lw-expand:hover { color: rgba(0,229,255,0.9); }
    #lw-close {
      background: none; border: none; color: rgba(255,255,255,0.3);
      cursor: pointer; padding: 4px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 6px; transition: color 0.15s;
    }
    #lw-close:hover { color: #fff; }

    #lw-msgs {
      flex: 1; overflow-y: auto;
      padding: 16px; display: flex;
      flex-direction: column; gap: 14px;
      scroll-behavior: smooth;
    }
    #lw-msgs::-webkit-scrollbar { width: 3px; }
    #lw-msgs::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

    .lw-msg { display: flex; gap: 8px; align-items: flex-end; animation: lwmsg 0.2s ease; }
    .lw-msg.lw-user { flex-direction: row-reverse; }
    @keyframes lwmsg {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .lw-msg-av {
      width: 28px; height: 28px; border-radius: 50%;
      background: #1c1c1c; border: 1px solid rgba(0,229,255,0.15);
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; flex-shrink: 0;
    }
    .lw-msg-bub {
      max-width: 78%; padding: 10px 13px;
      font-size: 0.82rem; line-height: 1.6;
      font-family: 'Inter', sans-serif;
      border-radius: 14px;
    }
    .lw-bot .lw-msg-bub {
      background: #1a1a1a; border: 1px solid rgba(255,255,255,0.06);
      color: #e0e0e0; border-bottom-left-radius: 3px;
    }
    .lw-user .lw-msg-bub {
      background: #00e5ff; color: #000;
      font-weight: 500; border-bottom-right-radius: 3px;
    }

    .lw-typing {
      display: flex; gap: 4px;
      padding: 10px 13px;
      background: #1a1a1a; border: 1px solid rgba(255,255,255,0.06);
      border-radius: 14px; border-bottom-left-radius: 3px;
      width: fit-content;
    }
    .lw-typing span {
      width: 6px; height: 6px; border-radius: 50%;
      background: #00e5ff; opacity: 0.4;
      animation: lwdot 1.2s infinite;
    }
    .lw-typing span:nth-child(2) { animation-delay: 0.18s; }
    .lw-typing span:nth-child(3) { animation-delay: 0.36s; }
    @keyframes lwdot {
      0%,60%,100% { transform: translateY(0); opacity: 0.4; }
      30% { transform: translateY(-5px); opacity: 1; }
    }

    #lw-input-area {
      padding: 12px 14px 16px;
      border-top: 1px solid rgba(255,255,255,0.06);
      background: #141414;
      display: flex; gap: 8px; align-items: center;
      flex-shrink: 0;
    }
    #lw-input {
      flex: 1; background: #1c1c1c;
      border: 1px solid rgba(255,255,255,0.09);
      border-radius: 10px; padding: 10px 14px;
      color: #fff; font-size: 0.82rem;
      font-family: 'Inter', sans-serif;
      outline: none; transition: border-color 0.2s;
    }
    #lw-input:focus { border-color: rgba(0,229,255,0.35); }
    #lw-input::placeholder { color: rgba(255,255,255,0.2); }
    #lw-send {
      width: 38px; height: 38px; border-radius: 9px;
      background: #00e5ff; border: none; color: #000;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: all 0.15s; flex-shrink: 0;
    }
    #lw-send:hover { background: #33eeff; transform: scale(1.05); }
    #lw-send:active { transform: scale(0.95); }
    #lw-send:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }

    @media (max-width: 480px) {
      #lw-window { width: calc(100vw - 24px); right: 12px; bottom: 88px; }
      #lw-btn { right: 16px; bottom: 20px; }
    }

    /* ── Widget cards inside floating chat ── */
    .lw-bot-inner { display:flex;flex-direction:column;gap:6px;flex:1;min-width:0; }
    @keyframes lwWidgetIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
    .lw-bot-inner .widget-wrap { width:100%;margin-top:4px;animation:lwWidgetIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both; }

    .wgt-prediction { background:linear-gradient(135deg,#0d0f14,#111318);border:1px solid rgba(0,229,255,0.22);border-radius:12px;overflow:hidden; }
    .wgt-pred-header { background:rgba(0,229,255,0.07);border-bottom:1px solid rgba(0,229,255,0.14);padding:8px 13px;display:flex;align-items:center;justify-content:space-between; }
    .wgt-pred-label { font-family:'Montserrat',sans-serif;font-size:0.52rem;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#00e5ff; }
    .wgt-pred-event { font-family:'Inter',sans-serif;font-size:0.62rem;color:rgba(255,255,255,0.38); }
    .wgt-pred-body { padding:13px; }
    .wgt-pred-fight { font-family:'Montserrat',sans-serif;font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.5);margin-bottom:8px; }
    .wgt-pred-pick { font-family:'Montserrat',sans-serif;font-size:1.05rem;font-weight:900;color:#fff;margin-bottom:7px; }
    .wgt-pred-details { display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px; }
    .wgt-pred-tag { background:rgba(0,229,255,0.08);border:1px solid rgba(0,229,255,0.18);border-radius:20px;padding:2px 9px;font-size:0.62rem;font-weight:600;color:#00e5ff;font-family:'Inter',sans-serif; }
    .wgt-pred-conf { display:flex;align-items:center;gap:7px;margin-top:6px; }
    .wgt-pred-conf-bar { flex:1;height:3px;background:rgba(255,255,255,0.07);border-radius:2px;overflow:hidden; }
    .wgt-pred-conf-fill { height:100%;background:linear-gradient(90deg,#00e5ff,#80ffea);border-radius:2px; }
    .wgt-pred-conf-pct { font-family:'Montserrat',sans-serif;font-size:0.62rem;font-weight:800;color:#00e5ff;min-width:28px;text-align:right; }
    .wgt-pred-reasoning { font-family:'Inter',sans-serif;font-size:0.7rem;line-height:1.5;color:rgba(255,255,255,0.38);margin-top:9px;padding-top:9px;border-top:1px solid rgba(255,255,255,0.05);font-style:italic; }

    .wgt-parlay { background:linear-gradient(135deg,#0f0e14,#111318);border:1px solid rgba(201,162,39,0.3);border-radius:12px;overflow:hidden; }
    .wgt-parlay-header { background:rgba(201,162,39,0.08);border-bottom:1px solid rgba(201,162,39,0.15);padding:8px 13px;display:flex;align-items:center;gap:7px; }
    .wgt-parlay-icon { font-size:0.8rem; }
    .wgt-parlay-title { font-family:'Montserrat',sans-serif;font-size:0.56rem;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#c9a227; }
    .wgt-parlay-picks { padding:10px 13px 13px;display:flex;flex-direction:column;gap:6px; }
    .wgt-parlay-pick { display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:7px; }
    .wgt-parlay-num { font-family:'Montserrat',sans-serif;font-size:0.58rem;font-weight:800;color:#c9a227;min-width:14px; }
    .wgt-parlay-fighter { font-family:'Montserrat',sans-serif;font-size:0.76rem;font-weight:700;color:#fff;flex:1; }
    .wgt-parlay-method { font-family:'Inter',sans-serif;font-size:0.62rem;color:rgba(255,255,255,0.38); }
    .wgt-parlay-check { color:#00e5ff;font-size:0.72rem; }

    .wgt-comparison { background:#0d0f14;border:1px solid rgba(255,255,255,0.1);border-radius:12px;overflow:hidden; }
    .wgt-comp-header { background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.06);padding:8px 13px; }
    .wgt-comp-label { font-family:'Montserrat',sans-serif;font-size:0.52rem;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.3); }
    .wgt-comp-fighters { display:grid;grid-template-columns:1fr auto 1fr;gap:10px;padding:13px;align-items:start; }
    .wgt-comp-fighter { text-align:center; }
    .wgt-comp-name { font-family:'Montserrat',sans-serif;font-size:0.78rem;font-weight:800;color:#fff;margin-bottom:3px; }
    .wgt-comp-record { font-family:'Inter',sans-serif;font-size:0.62rem;color:rgba(255,255,255,0.38);margin-bottom:6px; }
    .wgt-comp-edge { font-family:'Inter',sans-serif;font-size:0.62rem;line-height:1.45;color:rgba(255,255,255,0.42); }
    .wgt-comp-vs { font-family:'Montserrat',sans-serif;font-size:0.65rem;font-weight:900;color:rgba(255,255,255,0.2);padding-top:6px; }
    .wgt-comp-verdict { margin:0 13px 13px;padding:9px 12px;background:rgba(0,229,255,0.06);border:1px solid rgba(0,229,255,0.15);border-radius:7px;font-family:'Inter',sans-serif;font-size:0.7rem;font-weight:600;color:#00e5ff;text-align:center; }

    .wgt-card { background:#0d0f14;border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden; }
    .wgt-card-header { background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.06);padding:8px 13px;display:flex;align-items:center;justify-content:space-between; }
    .wgt-card-event { font-family:'Montserrat',sans-serif;font-size:0.65rem;font-weight:800;letter-spacing:0.1em;color:#fff; }
    .wgt-card-date { font-family:'Inter',sans-serif;font-size:0.6rem;color:rgba(255,255,255,0.38); }
    .wgt-card-fights { padding:8px 13px 12px;display:flex;flex-direction:column;gap:5px; }
    .wgt-card-fight { display:flex;align-items:center;gap:8px;padding:7px 9px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:7px; }
    .wgt-card-weight { font-family:'Inter',sans-serif;font-size:0.52rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.35);min-width:22px; }
    .wgt-card-matchup { flex:1;font-family:'Inter',sans-serif;font-size:0.69rem;color:rgba(255,255,255,0.6); }
    .wgt-card-matchup strong { color:#fff;font-weight:600; }
    .wgt-card-method-tag { font-family:'Inter',sans-serif;font-size:0.55rem;font-weight:600;color:#00e5ff;background:rgba(0,229,255,0.07);border:1px solid rgba(0,229,255,0.14);border-radius:4px;padding:2px 6px; }

    .wgt-upset { background:linear-gradient(135deg,#140a0a,#110d0d);border:1px solid rgba(255,60,60,0.3);border-radius:12px;overflow:hidden; }
    .wgt-upset-header { background:rgba(255,60,60,0.08);border-bottom:1px solid rgba(255,60,60,0.15);padding:8px 13px;display:flex;align-items:center;gap:7px; }
    .wgt-upset-alert { font-family:'Montserrat',sans-serif;font-size:0.52rem;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#ff4444; }
    .wgt-upset-body { padding:13px; }
    .wgt-upset-label { font-family:'Montserrat',sans-serif;font-size:0.66rem;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;color:#ff6666;margin-bottom:8px; }
    .wgt-upset-result { font-family:'Montserrat',sans-serif;font-size:0.92rem;font-weight:900;color:#fff;margin-bottom:3px; }
    .wgt-upset-method { font-family:'Inter',sans-serif;font-size:0.68rem;color:rgba(255,255,255,0.4);margin-bottom:10px; }
    .wgt-upset-hype { font-family:'Inter',sans-serif;font-size:0.7rem;line-height:1.5;color:rgba(255,255,255,0.52);font-style:italic; }
  `;
  document.head.appendChild(style);

  document.getElementById('lw-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendMsg(e.target.value);
  });
  document.getElementById('lw-send').addEventListener('click', () => {
    sendMsg(document.getElementById('lw-input').value);
  });
  document.getElementById('lw-expand').addEventListener('click', () => {
    if (chatHistory.length > 0) {
      try { sessionStorage.setItem('lucas_transfer', JSON.stringify(chatHistory)); } catch(e) {}
    }
    window.location.href = 'lucas.html';
  });
}

function toggleChat() {
  chatOpen = !chatOpen;
  const win = document.getElementById('lw-window');
  if (chatOpen) {
    win.classList.add('open');
    setTimeout(() => document.getElementById('lw-input').focus(), 220);
  } else {
    win.classList.remove('open');
  }
}

// ── Widget renderers (floating widget) ──────────────
function lwRenderWidget(wData) {
  try {
    const d = wData.data || {};
    switch (wData.type) {
      case 'prediction': return lwRenderPrediction(d);
      case 'parlay':     return lwRenderParlay(d);
      case 'comparison': return lwRenderComparison(d);
      case 'card':       return lwRenderCard(d);
      case 'upset':      return lwRenderUpset(d);
      default: return null;
    }
  } catch(e) { return null; }
}
function lwRenderPrediction(d) {
  const conf = Math.min(100, Math.max(0, parseInt(d.confidence) || 75));
  const el = document.createElement('div'); el.className = 'widget-wrap';
  el.innerHTML = `<div class="wgt-prediction"><div class="wgt-pred-header"><span class="wgt-pred-label">Lucas's Pick</span><span class="wgt-pred-event">${esc(d.event||'')}</span></div><div class="wgt-pred-body">${d.fight?`<div class="wgt-pred-fight">${esc(d.fight)}</div>`:''}<div class="wgt-pred-pick">${esc(d.pick||'')}</div><div class="wgt-pred-details">${d.method?`<span class="wgt-pred-tag">${esc(d.method)}</span>`:''}${d.round?`<span class="wgt-pred-tag">R${esc(d.round)}</span>`:''}</div><div class="wgt-pred-conf"><div class="wgt-pred-conf-bar"><div class="wgt-pred-conf-fill" style="width:${conf}%"></div></div><span class="wgt-pred-conf-pct">${conf}%</span></div>${d.reasoning?`<div class="wgt-pred-reasoning">${esc(d.reasoning)}</div>`:''}</div></div>`;
  return el;
}
function lwRenderParlay(d) {
  const picks = d.picks || [];
  const el = document.createElement('div'); el.className = 'widget-wrap';
  el.innerHTML = `<div class="wgt-parlay"><div class="wgt-parlay-header"><span class="wgt-parlay-icon">🎰</span><span class="wgt-parlay-title">${esc(d.title||"Lucas's Parlay")}</span></div><div class="wgt-parlay-picks">${picks.map((p,i)=>`<div class="wgt-parlay-pick"><span class="wgt-parlay-num">${i+1}</span><span class="wgt-parlay-fighter">${esc(p.fighter||'')}</span>${p.method?`<span class="wgt-parlay-method">${esc(p.method)}</span>`:''}<span class="wgt-parlay-check">✓</span></div>`).join('')}</div></div>`;
  return el;
}
function lwRenderComparison(d) {
  const a = d.fighterA||{}, b = d.fighterB||{};
  const el = document.createElement('div'); el.className = 'widget-wrap';
  el.innerHTML = `<div class="wgt-comparison"><div class="wgt-comp-header"><span class="wgt-comp-label">Fighter Comparison</span></div><div class="wgt-comp-fighters"><div class="wgt-comp-fighter"><div class="wgt-comp-name">${esc(a.name||'')}</div>${a.record?`<div class="wgt-comp-record">${esc(a.record)}</div>`:''}${a.edge?`<div class="wgt-comp-edge">${esc(a.edge)}</div>`:''}</div><div class="wgt-comp-vs">VS</div><div class="wgt-comp-fighter"><div class="wgt-comp-name">${esc(b.name||'')}</div>${b.record?`<div class="wgt-comp-record">${esc(b.record)}</div>`:''}${b.edge?`<div class="wgt-comp-edge">${esc(b.edge)}</div>`:''}</div></div>${d.verdict?`<div class="wgt-comp-verdict">${esc(d.verdict)}</div>`:''}</div>`;
  return el;
}
function lwRenderCard(d) {
  const fights = d.fights||[];
  const el = document.createElement('div'); el.className = 'widget-wrap';
  el.innerHTML = `<div class="wgt-card"><div class="wgt-card-header"><span class="wgt-card-event">${esc(d.event||'Fight Card')}</span>${d.date?`<span class="wgt-card-date">${esc(d.date)}</span>`:''}</div><div class="wgt-card-fights">${fights.map(f=>`<div class="wgt-card-fight">${f.weight?`<span class="wgt-card-weight">${esc(f.weight)}</span>`:''}<span class="wgt-card-matchup">${esc(f.a||'')} <strong>vs</strong> ${esc(f.b||'')}</span>${f.pick?`<span class="wgt-card-matchup" style="color:rgba(255,255,255,0.85);font-weight:600;flex:none;">→ ${esc(f.pick)}</span>`:''}${f.method?`<span class="wgt-card-method-tag">${esc(f.method)}</span>`:''}</div>`).join('')}</div></div>`;
  return el;
}
function lwRenderUpset(d) {
  const el = document.createElement('div'); el.className = 'widget-wrap';
  el.innerHTML = `<div class="wgt-upset"><div class="wgt-upset-header"><span>🚨</span><span class="wgt-upset-alert">Upset Alert — ${esc(d.event||'')}</span></div><div class="wgt-upset-body">${d.label?`<div class="wgt-upset-label">${esc(d.label)}</div>`:''}<div class="wgt-upset-result">${esc(d.fighter||'')} def. ${esc(d.victim||'')}</div>${d.method?`<div class="wgt-upset-method">${esc(d.method)}</div>`:''}${d.hype?`<div class="wgt-upset-hype">${esc(d.hype)}</div>`:''}</div></div>`;
  return el;
}
function lwParseAndRender(rawText, container) {
  const parts = rawText.split(/(<widget>[\s\S]*?<\/widget>)/g);
  let bubEl = null;
  parts.forEach(part => {
    const m = part.match(/^<widget>([\s\S]*?)<\/widget>$/);
    if (m) {
      try {
        const wEl = lwRenderWidget(JSON.parse(m[1].trim()));
        if (wEl) container.appendChild(wEl);
      } catch(e) {}
    } else {
      const txt = part.trim();
      if (txt) {
        if (!bubEl) {
          bubEl = document.createElement('div');
          bubEl.className = 'lw-msg-bub';
          container.insertBefore(bubEl, container.firstChild);
        }
        bubEl.textContent += (bubEl.textContent ? '\n' : '') + txt;
      }
    }
  });
}

function addMsg(text, isUser) {
  const msgs = document.getElementById('lw-msgs');
  const row = document.createElement('div');
  row.className = 'lw-msg' + (isUser ? ' lw-user' : ' lw-bot');
  if (isUser) {
    row.innerHTML = `<div class="lw-msg-bub">${esc(text)}</div>`;
  } else {
    const av = document.createElement('div');
    av.className = 'lw-msg-av'; av.textContent = '🥊';
    row.appendChild(av);
    const inner = document.createElement('div');
    inner.className = 'lw-bot-inner';
    row.appendChild(inner);
    lwParseAndRender(text, inner);
  }
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
}

function esc(t) { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function showTyping() {
  const msgs = document.getElementById('lw-msgs');
  const row = document.createElement('div');
  row.className = 'lw-msg lw-bot'; row.id = 'lw-typing';
  row.innerHTML = `<div class="lw-msg-av">🥊</div><div class="lw-typing"><span></span><span></span><span></span></div>`;
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
}

function removeTyping() { document.getElementById('lw-typing')?.remove(); }

function getPageContext() {
  const file = window.location.pathname.split('/').pop().toLowerCase().replace(/\?.*$/, '');
  if (file === 'pfp.html')          return 'pfp';
  if (file === 'events.html')       return 'events';
  if (file === 'leaderboard.html')  return 'leaderboard';
  if (file === 'picks.html')        return 'picks';
  if (file === 'reviews.html')      return 'review';
  if (file === 'event-review.html') return 'review';
  if (file === 'index.html' || file === '') return 'home';
  return 'widget';
}

async function sendMsg(text) {
  if (!text.trim() || chatBusy) return;
  chatBusy = true;
  const sendBtn = document.getElementById('lw-send');
  sendBtn.disabled = true;
  document.getElementById('lw-input').value = '';
  addMsg(text, true);
  showTyping();

  try {
    const res = await fetch(BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: chatHistory, page: getPageContext(), live_data: lucasLiveData })
    });
    const data = await res.json();
    removeTyping();
    if (data.success) {
      chatHistory.push({ role: 'user', content: text }, { role: 'assistant', content: data.response });
      if (chatHistory.length > 16) chatHistory = chatHistory.slice(-16);
      addMsg(data.response, false);
    } else {
      addMsg("Something went wrong. Try again.", false);
    }
  } catch(e) {
    removeTyping();
    addMsg("Can't reach Lucas right now. Try again in a moment.", false);
  }

  chatBusy = false;
  sendBtn.disabled = false;
  document.getElementById('lw-input').focus();
}

// ── Mobile hamburger nav ──────────────────────
function initHamburger() {
  const btn = document.getElementById('nav-hamburger');
  const overlay = document.getElementById('nav-mobile-overlay');
  if (!btn || !overlay) return;

  btn.addEventListener('click', () => {
    const open = overlay.classList.toggle('open');
    btn.classList.toggle('open', open);
    document.body.classList.toggle('no-scroll', open);
  });

  // close on link click
  overlay.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      overlay.classList.remove('open');
      btn.classList.remove('open');
      document.body.classList.remove('no-scroll');
    });
  });

  // close on mobile search submit
  const mobileSearch = overlay.querySelector('form');
  if (mobileSearch) {
    mobileSearch.addEventListener('submit', () => {
      overlay.classList.remove('open');
      btn.classList.remove('open');
      document.body.classList.remove('no-scroll');
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initWidget();
  loadLiveData();
  initHamburger();
});

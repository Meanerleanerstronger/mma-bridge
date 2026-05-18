// ==============================================
// MMA BRIDGE — FANTASY MMA LEAGUES
// ==============================================
(async function () {
  'use strict';

  const SEASON = '2026-Q2';
  const MAX_FIGHTERS = 5;
  const root = document.getElementById('fantRoot');
  const sb = window._sb;

  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function randCode() { return Math.random().toString(36).slice(2,8).toUpperCase(); }

  function waitForAuth(ms=5000) {
    return new Promise(res => {
      const t0 = Date.now();
      const tick = () => {
        const u = window.MMABridgeAuth?.getUser?.();
        if (u || Date.now()-t0>ms) res(u||null);
        else setTimeout(tick,80);
      };
      tick();
    });
  }

  const user = await waitForAuth();
  const fighters = await fetch('data/fighters.json').then(r=>r.ok?r.json():[]).catch(()=>[]);

  // ── Tab routing ────────────────────────────────
  let currentTab = 'team';
  document.querySelectorAll('.fant-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fant-tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      renderTab(currentTab);
    });
  });

  function renderTab(tab) {
    if (tab === 'team')   renderMyTeam();
    if (tab === 'league') renderMyLeague();
    if (tab === 'global') renderGlobal();
  }

  // ── MY TEAM ────────────────────────────────────
  async function renderMyTeam() {
    if (!user) {
      root.innerHTML = `<div class="fant-empty">Sign in to build your fantasy team.<br><a href="auth.html">Sign In &rarr;</a></div>`;
      return;
    }
    root.innerHTML = '<div class="fant-loading"><div class="skel" style="height:18px;width:120px;margin:0 auto 10px"></div><div class="skel" style="height:14px;width:180px;margin:0 auto"></div></div>';

    const [{ data: rosterRows }, { data: scoreRows }] = await Promise.all([
      sb.from('fantasy_rosters').select('fighter_id,fighter_name').eq('user_id',user.id).eq('season',SEASON),
      sb.from('fantasy_scores').select('fighter_id,points').eq('user_id',user.id).eq('season',SEASON),
    ]);

    const roster = rosterRows || [];
    const scores = scoreRows || [];
    const ptsMap = {};
    scores.forEach(s => { ptsMap[s.fighter_id] = (ptsMap[s.fighter_id]||0)+s.points; });
    const totalPts = Object.values(ptsMap).reduce((a,b)=>a+b,0);

    // Build 5 slots
    const slots = Array.from({length:MAX_FIGHTERS}, (_,i) => roster[i]||null);
    const slotsHtml = slots.map(f => {
      if (!f) return `<div class="fant-fighter-card empty"><div style="font-size:1.4rem;opacity:.15;margin-bottom:6px">+</div><div class="fant-fighter-name" style="color:rgba(255,255,255,.2)">Empty</div></div>`;
      const fd = fighters.find(x=>x.id===f.fighter_id);
      const pts = ptsMap[f.fighter_id]||0;
      return `
        <div class="fant-fighter-card filled">
          ${fd?.img ? `<img class="fant-fighter-img" src="${esc(fd.img)}" alt="${esc(f.fighter_name)}" onerror="this.style.display='none'">` : ''}
          <div class="fant-fighter-name">${esc(f.fighter_name)}</div>
          <div class="fant-fighter-class">${esc(fd?.weightClass||'')}</div>
          <div class="fant-fighter-pts">${pts>=0?'+':''}${pts}<span> pts</span></div>
          <button class="fant-remove-btn" data-fid="${esc(f.fighter_id)}" title="Remove">&#x2715;</button>
        </div>`;
    }).join('');

    const isNew = roster.length === 0;
    root.innerHTML = `
      ${isNew ? `
      <div class="fant-welcome">
        <div class="fant-welcome-icon">🥊</div>
        <div class="fant-welcome-title">Build Your Fantasy Team</div>
        <div class="fant-welcome-sub">Pick up to 5 UFC fighters. Earn points every time they win. Compete with friends.</div>
        <div class="fant-steps">
          <div class="fant-step">
            <div class="fant-step-num">Step 1</div>
            <div class="fant-step-text">Pick 5 fighters you believe in</div>
          </div>
          <div class="fant-step">
            <div class="fant-step-num">Step 2</div>
            <div class="fant-step-text">Earn points when they win fights</div>
          </div>
          <div class="fant-step">
            <div class="fant-step-num">Step 3</div>
            <div class="fant-step-text">Climb the global leaderboard</div>
          </div>
        </div>
      </div>` : `
      <div class="fant-season-chip">Season ${SEASON}</div>
      <div class="fant-slot-info">${roster.length}/${MAX_FIGHTERS} fighters &middot; <strong>${totalPts >= 0 ? '+' : ''}${totalPts} pts</strong> this season</div>`}

      <div class="fant-guide">
        <button class="fant-guide-toggle" id="fantGuideToggle">
          How Scoring Works
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="fant-guide-body" id="fantGuideBody">
          <div class="fant-score-grid">
            <div class="fant-score-item"><span class="fant-score-pts pos">+4</span><span class="fant-score-label">KO / TKO win</span></div>
            <div class="fant-score-item"><span class="fant-score-pts pos">+3</span><span class="fant-score-label">Submission win</span></div>
            <div class="fant-score-item"><span class="fant-score-pts pos">+2</span><span class="fant-score-label">Decision win</span></div>
            <div class="fant-score-item"><span class="fant-score-pts neg">−1</span><span class="fant-score-label">Loss (any method)</span></div>
            <div class="fant-score-item"><span class="fant-score-pts" style="color:rgba(255,255,255,.3)">0</span><span class="fant-score-label">No contest / DQ</span></div>
          </div>
        </div>
      </div>

      <div class="fant-roster-grid">${slotsHtml}</div>
      <div class="fant-btns-row">
        ${roster.length < MAX_FIGHTERS ? `<button class="fant-add-btn" id="fantAddBtn">+ Add Fighter</button>` : ''}
      </div>
      <div id="fantPickerArea" style="display:none" class="fant-picker">
        <div class="fant-picker-title">Pick a fighter</div>
        <input class="fant-search" id="fantSearch" placeholder="Search fighters&hellip;" autocomplete="off">
        <div class="fant-picker-grid" id="fantPickerGrid"></div>
      </div>`;

    // Scoring guide toggle
    document.getElementById('fantGuideToggle')?.addEventListener('click', () => {
      const btn = document.getElementById('fantGuideToggle');
      const body = document.getElementById('fantGuideBody');
      btn.classList.toggle('open');
      body.classList.toggle('open');
    });
    // Auto-open scoring guide for new users
    if (isNew) {
      document.getElementById('fantGuideToggle')?.classList.add('open');
      document.getElementById('fantGuideBody')?.classList.add('open');
    }
    window.mmabReveal?.();

    // Remove
    root.querySelectorAll('.fant-remove-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        btn.disabled = true;
        await sb.from('fantasy_rosters').delete().eq('user_id',user.id).eq('fighter_id',btn.dataset.fid).eq('season',SEASON);
        renderMyTeam();
      });
    });

    // Add toggle
    document.getElementById('fantAddBtn')?.addEventListener('click', () => {
      const area = document.getElementById('fantPickerArea');
      area.style.display = area.style.display==='none' ? 'block' : 'none';
      if (area.style.display==='block') { renderPicker('', roster); document.getElementById('fantSearch')?.focus(); }
    });

    let debounce;
    document.getElementById('fantSearch')?.addEventListener('input', e => {
      clearTimeout(debounce);
      debounce = setTimeout(()=>renderPicker(e.target.value.trim().toLowerCase(), roster), 120);
    });
  }

  function renderPicker(query, roster) {
    const grid = document.getElementById('fantPickerGrid');
    if (!grid) return;
    const selectedIds = new Set(roster.map(r=>r.fighter_id));
    const results = fighters
      .filter(f => !selectedIds.has(f.id) && (!query || (f.name||'').toLowerCase().includes(query)))
      .slice(0,40);
    if (!results.length) { grid.innerHTML='<div style="color:rgba(255,255,255,.3);font-size:.78rem;text-align:center;padding:16px">No fighters found</div>'; return; }
    grid.innerHTML = results.map(f=>`
      <div class="fant-pick-item" data-fid="${esc(f.id)}" data-fname="${esc(f.name)}">
        ${f.img?`<img src="${esc(f.img)}" alt="${esc(f.name)}" onerror="this.style.display='none'">`:''}
        <div class="fant-pick-item-name">${esc(f.name)}</div>
        <div class="fant-pick-item-class">${esc(f.weightClass||'')}</div>
      </div>`).join('');
    grid.querySelectorAll('.fant-pick-item').forEach(card => {
      card.addEventListener('click', async () => {
        const fid=card.dataset.fid, fname=card.dataset.fname;
        if (roster.length >= MAX_FIGHTERS) { alert(`Max ${MAX_FIGHTERS} fighters per team`); return; }
        card.style.opacity='0.5';
        await sb.from('fantasy_rosters').upsert({user_id:user.id,fighter_id:fid,fighter_name:fname,season:SEASON},{onConflict:'user_id,fighter_id,season'});
        renderMyTeam();
      });
    });
  }

  // ── MY LEAGUE ──────────────────────────────────
  async function renderMyLeague() {
    if (!user) { root.innerHTML='<div class="fant-empty">Sign in to join a league.</div>'; return; }
    root.innerHTML='<div class="fant-loading"><div class="skel" style="height:18px;width:120px;margin:0 auto 10px"></div><div class="skel" style="height:14px;width:180px;margin:0 auto"></div></div>';

    // Get user's league via any roster row with a league_id
    const { data: rosterRow } = await sb.from('fantasy_rosters')
      .select('league_id').eq('user_id',user.id).eq('season',SEASON).not('league_id','is',null).maybeSingle();

    const leagueId = rosterRow?.league_id;
    if (!leagueId) {
      root.innerHTML=`
        <div class="fant-welcome" style="padding-top:20px">
          <div class="fant-welcome-icon">🏆</div>
          <div class="fant-welcome-title">Compete with Friends</div>
          <div class="fant-welcome-sub">Create a private league or join one with a code. Your points from fights automatically count.</div>
          <div class="fant-steps">
            <div class="fant-step">
              <div class="fant-step-num">Step 1</div>
              <div class="fant-step-text">Build your team on the My Team tab first</div>
            </div>
            <div class="fant-step">
              <div class="fant-step-num">Step 2</div>
              <div class="fant-step-text">Create a league &amp; share the code</div>
            </div>
            <div class="fant-step">
              <div class="fant-step-num">Step 3</div>
              <div class="fant-step-text">Watch your ranking update after each event</div>
            </div>
          </div>
        </div>
        <div class="fant-btns-row" style="justify-content:center">
          <button class="fant-add-btn" id="fantCreateLeague">+ Create League</button>
          <button class="fant-secondary-btn" id="fantJoinLeague">Join with Code</button>
        </div>`;
      document.getElementById('fantCreateLeague')?.addEventListener('click',()=>showLeagueModal('create'));
      document.getElementById('fantJoinLeague')?.addEventListener('click',()=>showLeagueModal('join'));
      return;
    }

    const [{ data: league }, { data: leagueRosters }, { data: leagueScores }, { data: profiles }] = await Promise.all([
      sb.from('fantasy_leagues').select('*').eq('id',leagueId).single(),
      sb.from('fantasy_rosters').select('user_id,fighter_id').eq('league_id',leagueId).eq('season',SEASON),
      sb.from('fantasy_scores').select('user_id,points').eq('season',SEASON),
      sb.from('profiles').select('id,display_name,avatar_url'),
    ]);

    const profileMap={};
    (profiles||[]).forEach(p=>{profileMap[p.id]=p;});
    const leagueMemberIds=new Set((leagueRosters||[]).map(r=>r.user_id));
    const memberPts={};
    leagueMemberIds.forEach(id=>{memberPts[id]=0;});
    (leagueScores||[]).forEach(s=>{if(leagueMemberIds.has(s.user_id)) memberPts[s.user_id]=(memberPts[s.user_id]||0)+s.points;});
    const sorted=Object.entries(memberPts).sort((a,b)=>b[1]-a[1]);

    root.innerHTML=`
      <div class="fant-group-box">
        <div class="fant-group-name">${esc(league?.name||'My League')}</div>
        <div class="fant-group-meta">Code: <span class="fant-group-code">${esc(league?.code||'')}</span> &middot; ${leagueMemberIds.size} member${leagueMemberIds.size!==1?'s':''}</div>
        <div class="fant-btns-row">
          <button class="fant-secondary-btn" id="fantCopyLeagueCode">Copy Code</button>
          <button class="fant-secondary-btn" id="fantLeaveLeague" style="border-color:rgba(255,80,80,.25);color:rgba(255,100,100,.6)">Leave League</button>
        </div>
      </div>
      <div class="fant-section-hd">League Standings</div>
      <div class="fant-lb-wrap">${sorted.map(([uid,pts],i)=>{
        const p=profileMap[uid]||{};
        const init=(p.display_name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
        const posCls=i===0?' gold':i===1?' silver':i===2?' bronze':'';
        return `<div class="fant-lb-row${uid===user.id?' me':''}">
          <div class="fant-lb-pos${posCls}">${i+1}</div>
          <div class="fant-lb-avatar">${p.avatar_url?`<img src="${esc(p.avatar_url)}" onerror="this.style.display='none';this.nextSibling.style.display='flex'">`:''}${init}</div>
          <div class="fant-lb-name">${esc(p.display_name||'Fan')}${uid===user.id?'<span class="fant-lb-you">YOU</span>':''}</div>
          <div class="fant-lb-pts">${pts>=0?'+':''}${pts}<span>pts</span></div>
        </div>`;
      }).join('')}</div>`;

    document.getElementById('fantCopyLeagueCode')?.addEventListener('click',()=>{
      navigator.clipboard?.writeText(league?.code||'');
      const btn=document.getElementById('fantCopyLeagueCode');
      btn.textContent='✓ Copied!';
      setTimeout(()=>{if(btn)btn.textContent='Copy Code';},2000);
    });
    document.getElementById('fantLeaveLeague')?.addEventListener('click',async()=>{
      if(!confirm('Leave this league?')) return;
      await sb.from('fantasy_rosters').update({league_id:null}).eq('user_id',user.id).eq('season',SEASON);
      renderMyLeague();
    });
  }

  function showLeagueModal(mode) {
    const bg=document.createElement('div');
    bg.className='fant-modal-bg';
    bg.innerHTML=`
      <div class="fant-modal">
        <div class="fant-modal-title">${mode==='create'?'Create a League':'Join a League'}</div>
        ${mode==='create'
          ?`<input class="fant-modal-input" id="fantModalInput" placeholder="League name (e.g. Cage Rats)" maxlength="40">`
          :`<input class="fant-modal-input" id="fantModalInput" placeholder="6-character code" maxlength="6" style="text-transform:uppercase;letter-spacing:.12em">`}
        <div class="fant-modal-err" id="fantModalErr"></div>
        <div class="fant-btns-row" style="margin-top:14px">
          <button class="fant-add-btn" id="fantModalSubmit" style="flex:1;justify-content:center">${mode==='create'?'Create':'Join'}</button>
          <button class="fant-secondary-btn" id="fantModalCancel">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(bg);
    document.getElementById('fantModalInput')?.focus();
    document.getElementById('fantModalCancel').addEventListener('click',()=>bg.remove());
    bg.addEventListener('click',e=>{if(e.target===bg)bg.remove();});
    document.getElementById('fantModalSubmit').addEventListener('click',async()=>{
      const btn=document.getElementById('fantModalSubmit');
      const errEl=document.getElementById('fantModalErr');
      const val=document.getElementById('fantModalInput').value.trim();
      btn.disabled=true; errEl.textContent='';
      try {
        if(mode==='create'){
          if(!val){errEl.textContent='Enter a name';btn.disabled=false;return;}
          const code=randCode();
          const {data:league,error}=await sb.from('fantasy_leagues').insert({name:val,code,owner_id:user.id,season:SEASON}).select().single();
          if(error) throw error;
          await sb.from('fantasy_rosters').update({league_id:league.id}).eq('user_id',user.id).eq('season',SEASON);
          bg.remove(); renderMyLeague();
        } else {
          const code=val.toUpperCase();
          if(code.length!==6){errEl.textContent='Enter the 6-char code';btn.disabled=false;return;}
          const {data:league}=await sb.from('fantasy_leagues').select().eq('code',code).maybeSingle();
          if(!league){errEl.textContent='League not found';btn.disabled=false;return;}
          await sb.from('fantasy_rosters').update({league_id:league.id}).eq('user_id',user.id).eq('season',SEASON);
          bg.remove(); renderMyLeague();
        }
      } catch(e){errEl.textContent=e.message||'Error';btn.disabled=false;}
    });
  }

  // ── GLOBAL BOARD ───────────────────────────────
  async function renderGlobal() {
    root.innerHTML='<div class="fant-loading"><div class="skel" style="height:18px;width:120px;margin:0 auto 10px"></div><div class="skel" style="height:14px;width:180px;margin:0 auto"></div></div>';
    if(!sb){root.innerHTML='<div class="fant-empty">Sign in to see global rankings.</div>';return;}

    const [{data:rosters},{data:scores},{data:profiles}]=await Promise.all([
      sb.from('fantasy_rosters').select('user_id').eq('season',SEASON),
      sb.from('fantasy_scores').select('user_id,points').eq('season',SEASON),
      sb.from('profiles').select('id,display_name,avatar_url'),
    ]);

    const profileMap={};
    (profiles||[]).forEach(p=>{profileMap[p.id]=p;});
    const userPts={};
    (rosters||[]).forEach(r=>{userPts[r.user_id]=userPts[r.user_id]||0;});
    (scores||[]).forEach(s=>{if(userPts.hasOwnProperty(s.user_id))userPts[s.user_id]+=s.points;});
    const sorted=Object.entries(userPts).sort((a,b)=>b[1]-a[1]).slice(0,50);

    if(!sorted.length){root.innerHTML='<div class="fant-empty">No fantasy teams yet.<br>Be the first to build yours!</div>';return;}

    root.innerHTML=`
      <div class="fant-season-chip">Season ${SEASON} &middot; Global Rankings</div>
      <div class="fant-lb-wrap">${sorted.map(([uid,pts],i)=>{
        const p=profileMap[uid]||{};
        const init=(p.display_name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
        const posCls=i===0?' gold':i===1?' silver':i===2?' bronze':'';
        return `<div class="fant-lb-row${uid===user?.id?' me':''}">
          <div class="fant-lb-pos${posCls}">${i+1}</div>
          <div class="fant-lb-avatar">${p.avatar_url?`<img src="${esc(p.avatar_url)}" onerror="this.style.display='none';this.nextSibling&&(this.nextSibling.style.display='flex')">`:''}${init}</div>
          <div class="fant-lb-name">${esc(p.display_name||'Fan')}${uid===user?.id?'<span class="fant-lb-you">YOU</span>':''}</div>
          <div class="fant-lb-pts">${pts>=0?'+':''}${pts}<span>pts</span></div>
        </div>`;
      }).join('')}
      </div>`;
  }

  // Initial render
  renderTab('team');
})();

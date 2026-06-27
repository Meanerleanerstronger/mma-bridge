/* ═══════════════════════════════════════════════════
   MMA BRIDGE — PREMIUM v3.0
   Dark cinematic atmosphere + all animations
   ① Page transitions    ② Parallax hero
   ③ Film grain          ④ Scanlines
   ⑤ Glassmorphism       ⑥ Scroll reveal
   ⑦ Cursor glow         ⑧ Micro interactions
   ⑨ Kinetic typography  ⑩ Scroll progress bar
   ⑪ Card 3D tilt        ⑫ Button ripples
═══════════════════════════════════════════════════ */
(function(){
'use strict';

/* ── LOAD BARLOW CONDENSED ───────────────────────── */
if(!document.querySelector('link[href*="Barlow"]')){
  var fl=document.createElement('link');
  fl.rel='stylesheet';
  fl.href='https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,700;0,800;0,900;1,800;1,900&display=swap';
  document.head.appendChild(fl);
}

/* ══════════════════════════════════════════════════
   ① PAGE TRANSITIONS
══════════════════════════════════════════════════ */
document.body.style.opacity='0';
document.body.style.transition='none';
requestAnimationFrame(function(){requestAnimationFrame(function(){
  document.body.style.transition='opacity 0.3s ease';
  document.body.style.opacity='1';
});});

document.addEventListener('click',function(e){
  var a=e.target.closest('a[href]');
  if(!a)return;
  if(e.metaKey||e.ctrlKey||e.shiftKey||e.button===1)return;
  var h=a.getAttribute('href');
  if(!h||h[0]==='#'||h.startsWith('http')||h.startsWith('//')||h.startsWith('mailto')||a.target==='_blank')return;
  if(a.closest('.ev-overlay'))return;
  e.preventDefault();
  document.body.style.transition='opacity 0.2s ease';
  document.body.style.opacity='0';
  setTimeout(function(){window.location.href=h;},215);
});
window.addEventListener('pageshow',function(e){
  if(e.persisted){document.body.style.transition='none';document.body.style.opacity='1';}
});

/* ══════════════════════════════════════════════════
   INJECT ALL STYLES
══════════════════════════════════════════════════ */
var S=document.createElement('style');
S.textContent=`

/* ── BARLOW ON ALL BIG TEXT ── */
h1,h2,.ev-card-matchup,.ov-matchup,#heroTitle,.ev-hero h1{
  font-family:'Barlow Condensed','Montserrat',sans-serif !important;
  font-weight:900 !important;
}

/* ── DEEP BACKGROUND ── */
html,body{ background:#030304 !important; overflow-x:hidden !important; }
body{
  background-image:
    radial-gradient(ellipse 60% 35% at 85% 100%,rgba(200,168,75,0.02) 0%,transparent 55%)
    !important;
}

/* ── SCROLL PROGRESS BAR ── */
#mb-progress{
  position:fixed;top:0;left:0;height:2px;width:0%;z-index:99999;pointer-events:none;
  background:linear-gradient(90deg,#f0b429,#d49514,#f0b429);background-size:200% auto;
  box-shadow:0 2px 10px rgba(240,180,41,0.4);
  clip-path:inset(0 0 -14px 0);
  transition:width 0.08s linear;
}

/* ── SCANLINES ── */
body::before{
  content:'';position:fixed;inset:0;z-index:9996;pointer-events:none;
  background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.006) 2px,rgba(0,0,0,0.006) 4px);
}

/* ── FILM GRAIN ── */
#mb-grain{
  position:fixed;inset:0;width:100%;height:100%;pointer-events:none;
  z-index:9998;opacity:0.02;mix-blend-mode:overlay;
}

/* ── CURSOR GLOW ── */
#mb-glow{
  position:fixed;border-radius:50%;pointer-events:none;z-index:9997;
  width:380px;height:380px;
  background:radial-gradient(circle,rgba(240,180,41,0.03) 0%,transparent 70%);
  transform:translate(-50%,-50%);opacity:0;top:0;left:0;
  transition:opacity 0.4s,width 0.3s,height 0.3s,background 0.3s;
  will-change:left,top;
}

/* ── NAVBAR GLASS ── */
.navbar{
  background:rgba(3,3,4,0.72) !important;
  backdrop-filter:blur(28px) saturate(1.6) !important;
  -webkit-backdrop-filter:blur(28px) saturate(1.6) !important;
  border-bottom:1px solid rgba(255,255,255,0.04) !important;
  transition:background 0.3s,box-shadow 0.3s !important;
}
.navbar.scrolled{
  background:rgba(3,3,4,0.94) !important;
  box-shadow:0 8px 40px rgba(0,0,0,0.7) !important;
}

/* ── NAV LINKS — glossy ── */
.nav-links li a,.nav-links li a:visited{
  font-family:'Inter',sans-serif !important;
  font-weight:500 !important;
  font-size:13px !important;
  letter-spacing:0.01em !important;
  text-transform:none !important;
  color:rgba(255,255,255,0.45) !important;
  text-shadow:0 1px 2px rgba(0,0,0,0.6) !important;
  transition:color 0.2s,text-shadow 0.2s !important;
  position:relative !important;
}
.nav-links li a:hover{
  color:rgba(255,255,255,1) !important;
  text-shadow:0 0 18px rgba(255,255,255,0.55),0 0 40px rgba(255,255,255,0.2),0 1px 0 rgba(255,255,255,0.12) !important;
}
.nav-links li a.active{
  color:#f0b429 !important;
  text-shadow:0 0 20px rgba(240,180,41,0.75),0 0 50px rgba(240,180,41,0.3),0 0 8px rgba(240,180,41,0.3) !important;
}
.nav-links a::after{display:none !important;}

/* ── LOGO ── */
.nav-logo-img{
  height:52px !important;width:auto;object-fit:contain;
  transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1),filter 0.2s !important;
}
.nav-logo-img:hover{
  transform:scale(1.07) !important;
  filter:brightness(1.15) drop-shadow(0 0 8px rgba(240,180,41,0.4)) !important;
}
@media(max-width:768px){.nav-logo-img{height:40px !important;}}

/* ── HERO ── */
#heroImg{filter:brightness(0.75) saturate(1.1) contrast(1.05) !important;}
#heroTitle{
  font-size:clamp(2.2rem,4.5vw,4rem) !important;
  line-height:0.95 !important;
  text-shadow:0 0 80px rgba(0,0,0,0.95),0 2px 4px rgba(0,0,0,1) !important;
}
#heroSection::after{
  content:'';position:absolute;inset:0;z-index:1;pointer-events:none;overflow:hidden;
  background:radial-gradient(ellipse 45% 45% at 65% 50%,rgba(240,180,41,0.025) 0%,transparent 70%);
}
#heroBtn{
  transition:transform 0.25s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.25s !important;
}
#heroBtn:hover{
  transform:translateY(-3px) scale(1.05) !important;
  box-shadow:0 8px 32px rgba(240,180,41,0.45),0 0 0 4px rgba(240,180,41,0.1) !important;
}

/* ── RESULT CARDS ── */
.result-card{
  background:rgba(255,255,255,0.03) !important;
  backdrop-filter:blur(10px) !important;-webkit-backdrop-filter:blur(10px) !important;
  border:1px solid rgba(255,255,255,0.06) !important;
  transition:transform 0.25s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.25s,border-color 0.2s !important;
}
.result-card:hover{
  transform:translateY(-5px) scale(1.025) !important;
  box-shadow:0 18px 48px rgba(0,0,0,0.7),0 0 0 1px rgba(240,180,41,0.12) !important;
  border-color:rgba(240,180,41,0.15) !important;
}

/* ── NEWS/TRENDING CARDS ── */
.news-card,.trending-card{
  background:rgba(255,255,255,0.03) !important;
  backdrop-filter:blur(12px) !important;-webkit-backdrop-filter:blur(12px) !important;
  border:1px solid rgba(255,255,255,0.07) !important;
  box-shadow:0 4px 24px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.04) !important;
  transition:transform 0.28s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.28s,border-color 0.2s !important;
}
.news-card:hover,.trending-card:hover{
  transform:translateY(-5px) !important;
  box-shadow:0 24px 56px rgba(0,0,0,0.65),inset 0 1px 0 rgba(255,255,255,0.08) !important;
  border-color:rgba(240,180,41,0.18) !important;
}

/* ── LIVE FEED ── */
#liveFeed{
  background:rgba(255,255,255,0.022) !important;
  backdrop-filter:blur(16px) !important;-webkit-backdrop-filter:blur(16px) !important;
  border:1px solid rgba(255,255,255,0.06) !important;
  box-shadow:0 0 0 1px rgba(240,180,41,0.04),0 20px 60px rgba(0,0,0,0.5) !important;
}

/* ── SIDEBAR ── */
.sidebar{
  background:rgba(255,255,255,0.02) !important;
  backdrop-filter:blur(20px) !important;-webkit-backdrop-filter:blur(20px) !important;
  border:1px solid rgba(255,255,255,0.05) !important;
}

/* ── EV CARDS 3D ── */
.ev-card{transform-style:preserve-3d;will-change:transform;}
.ev-card.fn:hover{box-shadow:0 20px 60px rgba(0,0,0,0.75),0 0 0 1px rgba(240,180,41,0.1) !important;}
.ev-card.ppv:hover{box-shadow:0 20px 60px rgba(0,0,0,0.75),0 0 0 1px rgba(200,168,75,0.12) !important;}

/* ── OVERLAY GLASS ── */
.ov-hype-bar{
  background:rgba(3,3,4,0.6) !important;
  backdrop-filter:blur(20px) !important;-webkit-backdrop-filter:blur(20px) !important;
}
.ov-section-header{
  background:rgba(3,3,4,0.92) !important;
  backdrop-filter:blur(20px) !important;-webkit-backdrop-filter:blur(20px) !important;
}
.ov-sidebar{
  background:rgba(7,7,10,0.8) !important;
  backdrop-filter:blur(16px) !important;-webkit-backdrop-filter:blur(16px) !important;
}

/* ── FIGHT ROWS ── */
.ov-fight{transition:background 0.18s,box-shadow 0.18s !important;}
.ov-fight:hover{
  background:rgba(240,180,41,0.025) !important;
  box-shadow:inset 3px 0 0 rgba(240,180,41,0.5) !important;
}
.ov-fight.ppv-main:hover{
  background:rgba(200,168,75,0.025) !important;
  box-shadow:inset 3px 0 0 rgba(200,168,75,0.5) !important;
}

/* ── HYPE THUMB ── */
.ov-hype-thumb{
  transition:left 0.08s ease,background 0.25s,border-color 0.25s,
             transform 0.2s cubic-bezier(0.34,1.56,0.64,1) !important;
}

/* ── SEARCH ── */
.search-box input:focus{
  box-shadow:0 0 0 1.5px rgba(240,180,41,0.4),0 4px 20px rgba(240,180,41,0.1) !important;
}

/* ── THEME TOGGLE ── */
.theme-toggle{
  transition:background 0.2s,border-color 0.2s,transform 0.15s cubic-bezier(0.34,1.56,0.64,1) !important;
  position:relative;overflow:hidden;
}
.theme-toggle:active{transform:scale(0.9) !important;}

/* ── SCROLL REVEAL ── */
.sr-init{
  opacity:0;transform:translateY(12px);
  transition:opacity 0.6s cubic-bezier(0.22,1,0.36,1),transform 0.6s cubic-bezier(0.22,1,0.36,1);
}
.sr-init.sr-show{opacity:1;transform:translateY(0);}
.sr-d1{transition-delay:0.07s !important;}
.sr-d2{transition-delay:0.14s !important;}
.sr-d3{transition-delay:0.21s !important;}
.sr-d4{transition-delay:0.28s !important;}

/* ── RIPPLE ── */
@keyframes mb-ripple{to{transform:scale(1);opacity:0;}}

/* ── PARALLAX ── */
#hero-content{will-change:transform,opacity;}
#heroImg{will-change:transform;}

/* ── LIGHT MODE ── */
body.light-mode #mb-glow,
body.light-mode #mb-grain{display:none;}
body.light-mode body::before{display:none;}
body.light-mode .navbar{
  background:rgba(248,248,250,0.85) !important;
  backdrop-filter:blur(24px) !important;
  border-bottom:1px solid rgba(0,0,0,0.08) !important;
  box-shadow:0 1px 0 rgba(0,0,0,0.06) !important;
}
body.light-mode .news-card,
body.light-mode .trending-card{
  background:rgba(255,255,255,0.75) !important;
  border:1px solid rgba(0,0,0,0.08) !important;
  box-shadow:0 4px 20px rgba(0,0,0,0.08) !important;
}
body.light-mode .result-card{
  background:rgba(255,255,255,0.7) !important;
  border:1px solid rgba(0,0,0,0.07) !important;
}
body.light-mode #liveFeed,
body.light-mode .sidebar{
  background:rgba(255,255,255,0.65) !important;
  border:1px solid rgba(0,0,0,0.07) !important;
}
body.light-mode #heroImg{filter:brightness(0.85) saturate(1.0) !important;}
body.light-mode html,body.light-mode body{background:#f0f0f4 !important;}

/* ── REDUCED MOTION ── */
@media(prefers-reduced-motion:reduce){
  .sr-init{opacity:1 !important;transform:none !important;}
  body{transition:none !important;}
  #mb-grain,#mb-glow{display:none !important;}
}

`;

document.head.appendChild(S);

/* ══════════════════════════════════════════════════
   ② SCROLL PROGRESS BAR
══════════════════════════════════════════════════ */
var prog=document.createElement('div');
prog.id='mb-progress';
document.body.appendChild(prog);
window.addEventListener('scroll',function(){
  var d=document.documentElement;
  prog.style.width=Math.min((d.scrollTop/(d.scrollHeight-d.clientHeight))*100,100)+'%';
},{passive:true});

/* ══════════════════════════════════════════════════
   ③ FILM GRAIN
══════════════════════════════════════════════════ */
function initGrain(){
  var c=document.createElement('canvas');
  c.id='mb-grain';
  document.body.appendChild(c);
  var ctx=c.getContext('2d');
  var frame=0;
  function resize(){
    c.width=Math.ceil(window.innerWidth/2);
    c.height=Math.ceil(window.innerHeight/2);
    c.style.imageRendering='pixelated';
  }
  resize();
  window.addEventListener('resize',resize,{passive:true});
  function draw(){
    frame++;
    if(frame%3===0){
      var w=c.width,h=c.height;
      var img=ctx.createImageData(w,h);
      var d=img.data;
      for(var i=0;i<d.length;i+=4){
        var v=(Math.random()*255)|0;
        d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;
      }
      ctx.putImageData(img,0,0);
    }
    requestAnimationFrame(draw);
  }
  draw();
}
initGrain();

/* ══════════════════════════════════════════════════
   ④ PARALLAX HERO
══════════════════════════════════════════════════ */
function initParallax(){
  var img=document.getElementById('heroImg');
  var sec=document.getElementById('heroSection');
  var cnt=document.getElementById('hero-content');
  if(!img||!sec)return;
  img.style.transformOrigin='center top';
  var ticking=false;
  window.addEventListener('scroll',function(){
    if(ticking)return;
    ticking=true;
    requestAnimationFrame(function(){
      var sy=window.scrollY,hh=sec.offsetHeight;
      if(sy<hh*1.5){
        img.style.transform='translateY('+(sy*0.19)+'px) scale(1.07)';
        if(cnt){
          cnt.style.transform='translateY('+(sy*0.07)+'px)';
          cnt.style.opacity=Math.max(0,1-sy/(hh*0.72));
        }
      }
      ticking=false;
    });
  },{passive:true});
}
initParallax();

/* ══════════════════════════════════════════════════
   ⑤ CURSOR GLOW
══════════════════════════════════════════════════ */
function initCursorGlow(){
  if(window.matchMedia('(pointer:coarse)').matches)return;
  var g=document.createElement('div');
  g.id='mb-glow';
  document.body.appendChild(g);
  var mx=0,my=0,cx=0,cy=0,on=false;
  document.addEventListener('mousemove',function(e){
    mx=e.clientX;my=e.clientY;
    if(!on){on=true;g.style.opacity='1';}
  });
  document.addEventListener('mouseleave',function(){g.style.opacity='0';on=false;});
  (function loop(){
    cx+=(mx-cx)*0.1;cy+=(my-cy)*0.1;
    g.style.left=cx+'px';g.style.top=cy+'px';
    requestAnimationFrame(loop);
  })();
  document.addEventListener('mouseover',function(e){
    if(e.target.closest('a,button,.ev-card,.review-card,.result-card,.news-card')){
      g.style.width='440px';g.style.height='440px';
      g.style.background='radial-gradient(circle,rgba(240,180,41,0.05) 0%,transparent 65%)';
    }
  });
  document.addEventListener('mouseout',function(e){
    if(e.target.closest('a,button,.ev-card,.review-card,.result-card,.news-card')){
      g.style.width='380px';g.style.height='380px';
      g.style.background='radial-gradient(circle,rgba(240,180,41,0.05) 0%,transparent 70%)';
    }
  });
}
initCursorGlow();

/* ══════════════════════════════════════════════════
   ⑥ SCROLL REVEAL
══════════════════════════════════════════════════ */
function initScrollReveal(){
  var SEL=[
    '.ev-card','.review-card','.pfp-card','.pfp-row',
    '.result-card','.news-card','.trending-card',
    '.ov-fight','.section-title','.results-section-label',
    '.ov-sb-section','.ev-hero',
  ];
  var obs=new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if(!en.isIntersecting)return;
      en.target.classList.add('sr-show');
      obs.unobserve(en.target);
    });
  },{threshold:0.07,rootMargin:'0px 0px -14px 0px'});

  function apply(){
    SEL.forEach(function(sel){
      document.querySelectorAll(sel).forEach(function(el,i){
        if(el.dataset.srDone)return;
        el.dataset.srDone='1';
        el.classList.add('sr-init');
        var d=Math.min(i%5,4);
        if(d>0)el.classList.add('sr-d'+d);
        obs.observe(el);
      });
    });
  }
  apply();
  var mo=new MutationObserver(function(){clearTimeout(mo._t);mo._t=setTimeout(apply,80);});
  mo.observe(document.body,{childList:true,subtree:true});
}
initScrollReveal();

/* ══════════════════════════════════════════════════
   ⑦ KINETIC TYPOGRAPHY
══════════════════════════════════════════════════ */
function initKineticType(){
  var css=document.createElement('style');
  css.textContent=`
    .kt-wrap{display:inline-block;overflow:hidden;vertical-align:bottom;}
    .kt-char{
      display:inline-block;opacity:0;transform:translateY(110%);
      transition:opacity 0.5s cubic-bezier(0.22,1,0.36,1),transform 0.5s cubic-bezier(0.22,1,0.36,1);
    }
    .kt-char.kt-in{opacity:1;transform:translateY(0);}
  `;
  document.head.appendChild(css);

  function split(el){
    if(el.dataset.ktDone)return;
    el.dataset.ktDone='1';
    var words=el.textContent.trim().split(' ');
    el.innerHTML='';
    words.forEach(function(word,wi){
      var wrap=document.createElement('span');
      wrap.className='kt-wrap';
      word.split('').forEach(function(ch,ci){
        var s=document.createElement('span');
        s.className='kt-char';
        s.textContent=ch||'\u00a0';
        s.style.transitionDelay=((wi*Math.max(word.length,1)+ci)*0.026)+'s';
        wrap.appendChild(s);
      });
      el.appendChild(wrap);
      if(wi<words.length-1)el.appendChild(document.createTextNode(' '));
    });
  }
  function animate(el){
    el.querySelectorAll('.kt-char').forEach(function(c){c.classList.add('kt-in');});
  }

  // Hero title on homepage — watch for injection
  var heroTitle=document.getElementById('heroTitle');
  if(heroTitle){
    var prev='';
    setInterval(function(){
      var t=heroTitle.textContent.trim();
      if(t&&t!==prev&&!heroTitle.dataset.ktDone){
        prev=t;split(heroTitle);
        requestAnimationFrame(function(){requestAnimationFrame(function(){animate(heroTitle);});});
      }
    },200);
  }

  // Other headings via IntersectionObserver
  var ktObs=new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if(!en.isIntersecting)return;
      split(en.target);
      requestAnimationFrame(function(){requestAnimationFrame(function(){animate(en.target);});});
      ktObs.unobserve(en.target);
    });
  },{threshold:0.3});

  function observeHeadings(){ /* kinetic type restricted to homepage hero only */ }
  observeHeadings();
  setTimeout(observeHeadings,1000);
}
initKineticType();

/* ══════════════════════════════════════════════════
   ⑧ 3D CARD TILT
══════════════════════════════════════════════════ */
if(!window.matchMedia('(pointer:coarse)').matches){
  document.addEventListener('mousemove',function(e){
    var card=e.target.closest('.ev-card,.review-card');
    if(!card)return;
    var r=card.getBoundingClientRect();
    var x=(e.clientX-r.left)/r.width-0.5;
    var y=(e.clientY-r.top)/r.height-0.5;
    card.style.transform='perspective(900px) rotateX('+(-y*7)+'deg) rotateY('+(x*7)+'deg) translateY(-4px) scale(1.01)';
    card.style.transition='transform 0.05s ease';
  });
  document.addEventListener('mouseleave',function(e){
    var card=e.target.closest('.ev-card,.review-card');
    if(card){card.style.transform='';card.style.transition='transform 0.4s cubic-bezier(0.34,1.56,0.64,1)';}
  },true);
}

/* ══════════════════════════════════════════════════
   ⑨ BUTTON RIPPLES
══════════════════════════════════════════════════ */
document.addEventListener('click',function(e){
  var btn=e.target.closest('.theme-toggle,#heroBtn,.ov-lock-btn,.nav-hamburger');
  if(!btn)return;
  var rpl=document.createElement('span');
  var r=btn.getBoundingClientRect();
  var sz=Math.max(r.width,r.height)*2.2;
  rpl.style.cssText='position:absolute;border-radius:50%;pointer-events:none;'+
    'width:'+sz+'px;height:'+sz+'px;'+
    'left:'+(e.clientX-r.left-sz/2)+'px;top:'+(e.clientY-r.top-sz/2)+'px;'+
    'background:rgba(240,180,41,0.18);transform:scale(0);'+
    'animation:mb-ripple 0.55s ease-out forwards;';
  btn.style.position=btn.style.position||'relative';
  btn.style.overflow='hidden';
  btn.appendChild(rpl);
  setTimeout(function(){rpl.remove();},580);
});


/* ══════════════════════════════════════════════════
   REMOVE STATS STRIP if it exists from v2
══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded',function(){
  var strip=document.querySelector('.stats-strip');
  if(strip)strip.remove();
});

/* ══════════════════════════════════════════════════
   SITE DISCLAIMER FOOTER
══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded',function(){
  if(document.getElementById('site-disclaimer'))return;
  var d=document.createElement('footer');
  d.id='site-disclaimer';
  d.innerHTML='MMA Bridge is an independent fan-made site and is not affiliated with, endorsed by, or associated with the UFC, Zuffa LLC, or any related organisations. Fighter images, event posters, and all UFC-related media remain the sole property of their respective copyright holders. Fighter records and event data are sourced from publicly available information. No copyright infringement is intended. &nbsp;·&nbsp; <a href="about.html" style="color:inherit;text-decoration:underline;opacity:.6;">About</a> &nbsp;·&nbsp; <a href="mailto:contact@mmabridge.com" style="color:inherit;text-decoration:underline;opacity:.6;">contact@mmabridge.com</a>';
  document.body.appendChild(d);
});

})();

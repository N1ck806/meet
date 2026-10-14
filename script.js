// ============================================
//  СОСТОЯНИЕ
// ============================================
const STATE = {
  step: 0,
  noClicks: 0,
  place: null,
  day: null,
  hour: CONFIG.defaultHour,
  minute: CONFIG.defaultMinute,
  soundOn: CONFIG.soundEnabled,
  audioCtx: null,
  answerSent: false,
};

const STORAGE_KEY = "date-invitation-state";

// ============================================
//  ИНИЦИАЛИЗАЦИЯ
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  initParticles();
  initBackground();
  initProgressBar();
  initSoundToggle();
  initTexts();
  initYesNo();
  initPlaces();
  initDays();
  initTimeControls();
  initTimePresets();
  initStepNav();
  initFinalActions();
});

// ============================================
//  ТЕМА
// ============================================
function applyTheme() {
  if (CONFIG.theme && CONFIG.theme !== "pink") {
    document.body.classList.add("theme-" + CONFIG.theme);
  }
}

// ============================================
//  ЧАСТИЦЫ
// ============================================
function initParticles() {
  const container = document.getElementById('particles');
  const symbols = ['✦', '✧', '·', '✺', '✹'];
  for (let i = 0; i < 30; i++) {
    const el = document.createElement('div');
    el.className = 'star';
    el.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    el.style.left = Math.random() * 100 + '%';
    el.style.top = Math.random() * 100 + '%';
    el.style.fontSize = (8 + Math.random() * 16) + 'px';
    el.style.animationDelay = (Math.random() * 3) + 's';
    el.style.animationDuration = (2 + Math.random() * 4) + 's';
    container.appendChild(el);
  }
}

// ============================================
//  ПЛАВАЮЩИЕ СЕРДЕЧКИ
// ============================================
function initBackground() {
  const container = document.getElementById('floatingHearts');
  const symbols = ['💕','💖','💗','🌸','✨','💝','🌷','🌺','🌷','💖','🩷'];
  for (let i = 0; i < 22; i++) {
    const el = document.createElement('div');
    el.className = 'fh';
    el.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    el.style.left = Math.random() * 100 + '%';
    el.style.fontSize = (12 + Math.random() * 20) + 'px';
    el.style.animationDuration = (8 + Math.random() * 10) + 's';
    el.style.animationDelay = (Math.random() * 10) + 's';
    container.appendChild(el);
  }
}

// ============================================
//  PROGRESS BAR
// ============================================
function initProgressBar() {
  if (!CONFIG.showProgressBar) {
    document.getElementById('progressBar').style.display = 'none';
    return;
  }
  const dots = document.getElementById('progressDots');
  for (let i = 0; i < 5; i++) {
    const d = document.createElement('div');
    d.className = 'dot';
    d.dataset.step = i;
    dots.appendChild(d);
  }
  updateProgress();
}

function updateProgress() {
  if (!CONFIG.showProgressBar) return;
  const fill = document.getElementById('progressFill');
  const dots = document.querySelectorAll('.progress-dots .dot');
  const percent = ((STATE.step + 1) / 5) * 100;
  fill.style.width = percent + '%';
  dots.forEach((d, i) => {
    d.classList.toggle('active', i === STATE.step);
    d.classList.toggle('done', i < STATE.step);
  });
}

// ============================================
//  ЗВУК
// ============================================
function initSoundToggle() {
  const btn = document.getElementById('soundToggle');
  if (!STATE.soundOn) btn.classList.add('muted');
  btn.addEventListener('click', () => {
    STATE.soundOn = !STATE.soundOn;
    btn.classList.toggle('muted', !STATE.soundOn);
    if (STATE.soundOn) playTone(660, 0.1);
  });
}

function playTone(freq = 880, duration = 0.1, type = 'sine') {
  if (!STATE.soundOn) return;
  try {
    if (!STATE.audioCtx) STATE.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = STATE.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

function playSuccess() {
  playTone(523, 0.1);
  setTimeout(() => playTone(659, 0.1), 80);
  setTimeout(() => playTone(784, 0.15), 160);
}

function playHeartbeat() {
  playTone(220, 0.08, 'sine');
  setTimeout(() => playTone(180, 0.1, 'sine'), 100);
}

function vibrate(pattern) {
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch(e) {}
  }
}

// ============================================
//  ПОДСТАНОВКА ПЕРЕМЕННЫХ
// ============================================
function applyVars(text) {
  return String(text)
    .replace(/{herName}/g, CONFIG.herName)
    .replace(/{yourName}/g, CONFIG.yourName);
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================
//  ТЕКСТЫ + ПЕЧАТЬ
// ============================================
function initTexts() {
  const greeting = document.getElementById('greeting');
  const subtitle = document.getElementById('subtitle');
  const question = document.getElementById('question');

  document.getElementById('btnYes').textContent = CONFIG.yesButton;

  const noTextInit = document.querySelector('#btnNo .no-text');
  if (noTextInit) noTextInit.textContent = CONFIG.noButtonPhrases[0];

  document.getElementById('step2Title').textContent = CONFIG.step2Title;
  document.getElementById('step2Subtitle').textContent = CONFIG.step2Subtitle;
  document.getElementById('step3Title').textContent = CONFIG.step3Title;
  document.getElementById('step3Subtitle').textContent = CONFIG.step3Subtitle;
  document.getElementById('step4Title').textContent = CONFIG.step4Title;
  document.getElementById('step4Subtitle').textContent = CONFIG.step4Subtitle;

  document.title = `${CONFIG.title} 💕`;

  typeWriter(greeting, applyVars(CONFIG.greeting), 70, () => {
    subtitle.textContent = CONFIG.subtitle;
    subtitle.style.animation = 'slideDown 0.6s ease';
    setTimeout(() => {
      question.textContent = CONFIG.question;
      question.style.animation = 'slideDown 0.6s ease';
    }, 300);
  });
}

function typeWriter(el, text, speed = 70, onDone) {
  el.textContent = '';
  el.classList.add('typing');
  let i = 0;
  const tick = () => {
    if (i < text.length) {
      el.textContent += text[i++];
      setTimeout(tick, speed);
    } else {
      el.classList.remove('typing');
      if (onDone) onDone();
    }
  };
  tick();
}

// ============================================
//  ПОХВАЛА
// ============================================
function showPraise(text) {
  const praise = document.createElement('div');
  praise.className = 'praise';
  praise.textContent = text;
  document.body.appendChild(praise);
  requestAnimationFrame(() => praise.classList.add('show'));
  setTimeout(() => {
    praise.classList.remove('show');
    setTimeout(() => praise.remove(), 600);
  }, 1800);
}

// ============================================
//  НАВИГАЦИЯ
// ============================================
function goToStep(n) {
  const current = document.querySelector('.step.active');
  const next = document.querySelector(`.step[data-step="${n}"]`);
  if (!next || current === next) return;

  if (current) {
    current.classList.add('leaving');
    setTimeout(() => current.classList.remove('active', 'leaving'), 350);
  }

  setTimeout(() => {
    next.classList.add('active');
    STATE.step = n;
    updateProgress();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 200);
}

// ============================================
//  ДА / НЕТ
// ============================================
function initYesNo() {
  const btnYes = document.getElementById('btnYes');
  const btnNo = document.getElementById('btnNo');

  if (!btnNo.querySelector('.no-text')) {
    btnNo.innerHTML = `
      <span class="no-text">${CONFIG.noButtonPhrases[0]}</span>
      <span class="no-heart">💖</span>
    `;
  }

  btnYes.addEventListener('click', () => {
    playSuccess();
    burstHearts();
    vibrate(30);
    showPraise(randomFrom(CONFIG.praiseAfterYes));
    setTimeout(() => goToStep(1), 900);
  });

  btnNo.addEventListener('click', (e) => {
    STATE.noClicks++;
    playHeartbeat();
    vibrate([20, 30, 20]);

    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 500);

    heartsExplosion(e.clientX, e.clientY);

    const noText = btnNo.querySelector('.no-text');
    const phrases = CONFIG.noButtonPhrases;
    const idx = Math.min(STATE.noClicks, phrases.length - 1);
    if (noText) noText.textContent = phrases[idx];

    const heart = btnNo.querySelector('.no-heart');
    if (heart) {
      const hearts = ['💖','💗','💕','💝','💘','❤️‍🔥','🩷'];
      heart.textContent = hearts[Math.floor(Math.random() * hearts.length)];
    }

    btnNo.classList.remove('shrink-1','shrink-2','shrink-3','shrink-4');
    if (STATE.noClicks <= 4) btnNo.classList.add('shrink-' + STATE.noClicks);

    btnYes.classList.remove('grow-1','grow-2','grow-3','grow-4');
    if (STATE.noClicks <= 4) btnYes.classList.add('grow-' + STATE.noClicks);

    if (STATE.noClicks >= 5) {
      btnNo.classList.add('gone');
      setTimeout(() => { btnNo.style.display = 'none'; }, 600);
    }

    if (STATE.noClicks >= 2) flyAwayHearts(6);
    if (STATE.noClicks >= 3) flyAwayHearts(10);
    if (STATE.noClicks >= 4) flyAwayHearts(15);
  });
}

// ============================================
//  СЕРДЕЧКИ
// ============================================
function heartsExplosion(x, y) {
  const symbols = ['💖','💕','💗','🌸','✨','💝','💘','🩷','❤️'];
  for (let i = 0; i < 20; i++) {
    const h = document.createElement('div');
    h.className = 'click-heart';
    h.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    h.style.left = x + 'px';
    h.style.top = y + 'px';
    h.style.fontSize = (18 + Math.random() * 24) + 'px';
    h.style.transform = 'translate(-50%, -50%) scale(0.5)';
    h.style.opacity = '1';
    h.style.transition = 'all 1s cubic-bezier(0.25, 1, 0.5, 1)';
    document.body.appendChild(h);
    requestAnimationFrame(() => {
      const angle = Math.random() * Math.PI * 2;
      const dist = 80 + Math.random() * 220;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist - 60;
      h.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.2) rotate(${Math.random()*720-360}deg)`;
      h.style.opacity = '0';
    });
    setTimeout(() => h.remove(), 1100);
  }
}

function flyAwayHearts(count) {
  const symbols = ['💖','💕','💗','🌸','✨','💝'];
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const h = document.createElement('div');
      h.className = 'click-heart';
      h.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      h.style.left = (Math.random() * 100) + 'vw';
      h.style.top = '100vh';
      h.style.fontSize = (20 + Math.random() * 20) + 'px';
      h.style.transition = 'all 2s cubic-bezier(0.25, 1, 0.5, 1)';
      document.body.appendChild(h);
      requestAnimationFrame(() => {
        h.style.transform = `translateY(-110vh) rotate(${Math.random()*720-360}deg)`;
        h.style.opacity = '0';
      });
      setTimeout(() => h.remove(), 2100);
    }, i * 80);
  }
}

function burstHearts() {
  for (let i = 0; i < 15; i++) {
    const h = document.createElement('div');
    h.textContent = ['💖','💕','💗','✨','🌸'][i % 5];
    h.style.cssText = `
      position: fixed;
      left: 50%; top: 50%;
      font-size: ${16 + Math.random()*20}px;
      pointer-events: none;
      z-index: 9999;
      transition: all 1s cubic-bezier(0.25, 1, 0.5, 1);
    `;
    document.body.appendChild(h);
    requestAnimationFrame(() => {
      const angle = Math.random() * Math.PI * 2;
      const dist = 150 + Math.random() * 250;
      h.style.transform = `translate(${Math.cos(angle)*dist}px, ${Math.sin(angle)*dist}px) rotate(${Math.random()*720}deg)`;
      h.style.opacity = '0';
    });
    setTimeout(() => h.remove(), 1100);
  }
}

// ============================================
//  SVG-ИКОНКИ МЕСТ (10 штук)
// ============================================
const PLACE_SVGS = {
  park: `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="skyG1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ffd6e8"/>
          <stop offset="100%" stop-color="#ffeaf3"/>
        </linearGradient>
        <linearGradient id="treeG1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#4caf50"/>
          <stop offset="100%" stop-color="#2e7d32"/>
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#skyG1)" stroke="#ff9ecb" stroke-width="2"/>
      <circle cx="75" cy="25" r="10" fill="#ffeb3b" opacity="0.9"/>
      <path d="M20,80 Q30,40 50,45 Q70,40 80,80 Z" fill="url(#treeG1)"/>
      <rect x="47" y="70" width="6" height="20" fill="#795548" rx="2"/>
      <path d="M10,85 Q30,75 50,80 Q70,75 90,85 L90,95 L10,95 Z" fill="#8bc34a"/>
      <circle cx="35" cy="55" r="3" fill="#ff4081" opacity="0.7"/>
      <circle cx="65" cy="50" r="3" fill="#ff4081" opacity="0.7"/>
    </svg>`,
  cinema: `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cinG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#b388ff"/>
          <stop offset="100%" stop-color="#7c4dff"/>
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="#f3e5f5" stroke="#b388ff" stroke-width="2"/>
      <rect x="18" y="35" width="64" height="40" rx="6" fill="url(#cinG)"/>
      <rect x="22" y="39" width="56" height="32" rx="4" fill="#fff"/>
      <circle cx="50" cy="55" r="10" fill="#ff4081" opacity="0.8"/>
      <path d="M46,50 L46,60 L56,55 Z" fill="#fff"/>
      <rect x="30" y="20" width="6" height="15" fill="#ffb300" rx="2"/>
      <rect x="64" y="20" width="6" height="15" fill="#ffb300" rx="2"/>
      <circle cx="33" cy="20" r="5" fill="#ff4081"/>
      <circle cx="67" cy="20" r="5" fill="#ff4081"/>
    </svg>`,
  cafe: `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="coffeeG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#a0522d"/>
          <stop offset="100%" stop-color="#5d3a1a"/>
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="#fff5e6" stroke="#c9a27a" stroke-width="2"/>
      <ellipse cx="50" cy="55" rx="28" ry="22" fill="#fff"/>
      <ellipse cx="50" cy="55" rx="24" ry="18" fill="url(#coffeeG)"/>
      <ellipse cx="50" cy="52" rx="14" ry="6" fill="#8b4513" opacity="0.5"/>
      <path d="M78,50 Q90,50 88,60 Q86,70 76,66" fill="none" stroke="#c9a27a" stroke-width="4" stroke-linecap="round"/>
      <path d="M42,30 Q46,20 42,12" fill="none" stroke="#c9a27a" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
      <path d="M50,32 Q54,22 50,14" fill="none" stroke="#c9a27a" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
      <path d="M58,30 Q62,20 58,12" fill="none" stroke="#c9a27a" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
      <circle cx="50" cy="55" r="3" fill="#ff4081" opacity="0.8"/>
    </svg>`,
  walk: `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="nightG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2c1a4d"/>
          <stop offset="100%" stop-color="#7c4dff"/>
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#nightG)"/>
      <circle cx="70" cy="25" r="8" fill="#fff5b3" opacity="0.95"/>
      <circle cx="72" cy="23" r="7" fill="url(#nightG)"/>
      <circle cx="25" cy="30" r="1.5" fill="#fff"/>
      <circle cx="35" cy="20" r="1" fill="#fff"/>
      <circle cx="60" cy="15" r="1.2" fill="#fff"/>
      <circle cx="80" cy="40" r="1" fill="#fff"/>
      <path d="M15,80 L25,60 L32,72 L38,55 L48,75 L58,58 L68,72 L78,55 L88,80 Z" fill="#1a0f2e" opacity="0.9"/>
      <rect x="30" y="72" width="8" height="15" fill="#ff4081" opacity="0.7"/>
      <rect x="50" y="70" width="6" height="17" fill="#ffb300" opacity="0.7"/>
      <rect x="68" y="73" width="7" height="14" fill="#4fc3f7" opacity="0.7"/>
    </svg>`,
  restaurant: `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="#fff8e1" stroke="#ffb74d" stroke-width="2"/>
      <ellipse cx="50" cy="60" rx="35" ry="8" fill="#8d6e63"/>
      <rect x="15" y="58" width="70" height="4" fill="#8d6e63" rx="2"/>
      <path d="M35,60 L35,40 L38,40 L38,60 Z" fill="#bdbdbd"/>
      <path d="M32,40 L32,35 L34,35 L34,40 L35,40 L35,32 L36,32 L36,40 L37,40 L37,35 L39,35 L39,40 L41,40 L41,35 L42,35 L42,40" fill="#bdbdbd"/>
      <ellipse cx="60" cy="45" rx="12" ry="8" fill="#fff"/>
      <ellipse cx="60" cy="45" rx="9" ry="5" fill="#ff7043"/>
      <circle cx="60" cy="43" r="2" fill="#fff" opacity="0.7"/>
      <path d="M55,50 L50,58 M65,50 L70,58" stroke="#bdbdbd" stroke-width="1.5"/>
    </svg>`,
  sea: `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sunsetG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ffb74d"/>
          <stop offset="40%" stop-color="#ff7043"/>
          <stop offset="100%" stop-color="#4fc3f7"/>
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#sunsetG)"/>
      <circle cx="50" cy="35" r="12" fill="#fff5b3" opacity="0.95"/>
      <path d="M0,70 Q25,65 50,70 T100,70 L100,100 L0,100 Z" fill="#0288d1" opacity="0.85"/>
      <path d="M0,78 Q25,74 50,78 T100,78" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.6"/>
      <path d="M0,86 Q25,82 50,86 T100,86" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.4"/>
      <path d="M0,92 Q25,89 50,92 T100,92" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.3"/>
    </svg>`,
  ferris: `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="#e1bee7" stroke="#ba68c8" stroke-width="2"/>
      <circle cx="50" cy="42" r="22" fill="none" stroke="#7b1fa2" stroke-width="2.5"/>
      <line x1="50" y1="20" x2="50" y2="64" stroke="#7b1fa2" stroke-width="1.5"/>
      <line x1="28" y1="42" x2="72" y2="42" stroke="#7b1fa2" stroke-width="1.5"/>
      <line x1="34" y1="26" x2="66" y2="58" stroke="#7b1fa2" stroke-width="1.5"/>
      <line x1="66" y1="26" x2="34" y2="58" stroke="#7b1fa2" stroke-width="1.5"/>
      <circle cx="50" cy="20" r="3" fill="#ff4081"/>
      <circle cx="72" cy="42" r="3" fill="#4fc3f7"/>
      <circle cx="50" cy="64" r="3" fill="#ffb300"/>
      <circle cx="28" cy="42" r="3" fill="#66bb6a"/>
      <circle cx="50" cy="42" r="3" fill="#fff"/>
      <line x1="50" y1="64" x2="40" y2="85" stroke="#7b1fa2" stroke-width="2.5"/>
      <line x1="50" y1="64" x2="60" y2="85" stroke="#7b1fa2" stroke-width="2.5"/>
      <line x1="35" y1="85" x2="65" y2="85" stroke="#7b1fa2" stroke-width="3"/>
    </svg>`,
  museum: `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="#fce4ec" stroke="#ec407a" stroke-width="2"/>
      <path d="M20,45 L50,25 L80,45 Z" fill="#ec407a"/>
      <rect x="22" y="45" width="56" height="35" fill="#fff"/>
      <rect x="22" y="45" width="56" height="4" fill="#ad1457"/>
      <rect x="30" y="52" width="6" height="22" fill="#ec407a"/>
      <rect x="47" y="52" width="6" height="22" fill="#ec407a"/>
      <rect x="64" y="52" width="6" height="22" fill="#ec407a"/>
      <rect x="18" y="80" width="64" height="6" fill="#ad1457" rx="2"/>
      <circle cx="50" cy="20" r="2.5" fill="#ffb300"/>
    </svg>`,
  zoo: `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="#fff9c4" stroke="#fbc02d" stroke-width="2"/>
      <circle cx="45" cy="48" r="22" fill="#ffb74d"/>
      <circle cx="28" cy="32" r="8" fill="#ffb74d"/>
      <circle cx="62" cy="32" r="8" fill="#ffb74d"/>
      <circle cx="28" cy="32" r="4" fill="#fff3e0"/>
      <circle cx="62" cy="32" r="4" fill="#fff3e0"/>
      <circle cx="40" cy="45" r="3.5" fill="#3e2723"/>
      <circle cx="52" cy="45" r="3.5" fill="#3e2723"/>
      <circle cx="40" cy="45" r="1.5" fill="#fff"/>
      <circle cx="52" cy="45" r="1.5" fill="#fff"/>
      <ellipse cx="46" cy="56" rx="8" ry="5" fill="#fff3e0"/>
      <ellipse cx="46" cy="54" rx="3" ry="2" fill="#3e2723"/>
      <path d="M42,58 Q46,63 50,58" stroke="#3e2723" stroke-width="1.5" fill="none"/>
    </svg>`,
  picnic: `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="#dcedc8" stroke="#8bc34a" stroke-width="2"/>
      <path d="M10,70 Q30,65 50,70 T90,70 L90,90 L10,90 Z" fill="#8bc34a"/>
      <path d="M15,72 L35,72 L35,80 L15,80 Z" fill="#f44336"/>
      <path d="M35,72 L55,72 L55,80 L35,80 Z" fill="#ffeb3b"/>
      <path d="M55,72 L75,72 L75,80 L55,80 Z" fill="#f44336"/>
      <path d="M15,80 L35,80 L35,88 L15,88 Z" fill="#ffeb3b"/>
      <path d="M35,80 L55,80 L55,88 L35,88 Z" fill="#f44336"/>
      <path d="M55,80 L75,80 L75,88 L55,88 Z" fill="#ffeb3b"/>
      <circle cx="65" cy="55" r="6" fill="#f44336"/>
      <path d="M65,50 Q68,45 72,46" stroke="#2e7d32" stroke-width="1.5" fill="none"/>
      <circle cx="35" cy="58" r="5" fill="#ff9800"/>
      <path d="M35,54 Q38,49 42,50" stroke="#2e7d32" stroke-width="1.5" fill="none"/>
      <circle cx="50" cy="62" r="4" fill="#8e24aa"/>
    </svg>`
};

// ============================================
//  МЕСТА
// ============================================
function initPlaces() {
  const grid = document.getElementById('placesGrid');
  CONFIG.places.forEach(place => {
    const card = document.createElement('div');
    card.className = 'place-card';
    card.dataset.id = place.id;
    card.innerHTML = `
      <div class="place-svg">${PLACE_SVGS[place.svg] || ''}</div>
      <div class="place-name">${place.emoji} ${place.name}</div>
      <div class="place-desc">${place.description}</div>
    `;
    card.addEventListener('click', () => {
      document.querySelectorAll('.place-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      STATE.place = place;
      playSuccess();
      vibrate(20);
      burstHearts();
      showPraise(randomFrom(CONFIG.praiseAfterPlace));
      setTimeout(() => goToStep(2), 1400);
    });
    grid.appendChild(card);
  });
}

// ============================================
//  ДНИ
// ============================================
const MONTHS_SHORT = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
const WEEKDAYS_SHORT = ['вс','пн','вт','ср','чт','пт','сб'];

function initDays() {
  const grid = document.getElementById('daysGrid');
  grid.innerHTML = '';

  if (CONFIG.useCalendar) {
    const today = new Date();
    today.setHours(0,0,0,0);
    for (let i = 0; i < CONFIG.daysAhead; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      grid.appendChild(makeDayCard(d, i === 0));
    }
  }
}

function makeDayCard(date, isToday) {
  const card = document.createElement('div');
  const dow = date.getDay();
  const isWeekend = dow === 0 || dow === 6;
  card.className = 'day-card' + (isToday ? ' today' : '') + (isWeekend ? ' weekend' : '');
  const dayName = WEEKDAYS_SHORT[dow];
  const dayNum = date.getDate();
  const month = MONTHS_SHORT[date.getMonth()];

  card.innerHTML = `
    <div class="day-name">${dayName}</div>
    <div class="day-num">${dayNum}</div>
    <div class="day-month">${month}</div>
  `;

  const label = `${dayName}, ${dayNum} ${month}`;
  card.dataset.label = label;
  card.addEventListener('click', () => selectDay(label, card));
  return card;
}

function selectDay(label, card) {
  document.querySelectorAll('.day-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  STATE.day = label;
  playSuccess();
  vibrate(20);
  showPraise(randomFrom(CONFIG.praiseAfterDay));
  setTimeout(() => goToStep(3), 1400);
}

// ============================================
//  ВРЕМЯ — КНОПКИ
// ============================================
function initTimeControls() {
  document.querySelectorAll('.tc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const unit = btn.dataset.unit;
      const dir = btn.dataset.dir === 'up' ? 1 : -1;

      if (unit === 'hour') {
        STATE.hour = (STATE.hour + dir + 24) % 24;
      } else {
        STATE.minute = (STATE.minute + dir * CONFIG.minuteStep + 60) % 60;
      }
      playTone(700, 0.05);
      vibrate(10);
      updateTimeDisplay();
    });
  });
  updateTimeDisplay();
}

function initTimePresets() {
  const container = document.getElementById('timePresets');
  container.innerHTML = '';
  CONFIG.timePresets.forEach(preset => {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.textContent = preset.label;
    btn.addEventListener('click', () => {
      STATE.hour = preset.hour;
      STATE.minute = preset.minute;
      playSuccess();
      vibrate(15);
      updateTimeDisplay();
    });
    container.appendChild(btn);
  });
}

function updateTimeDisplay() {
  const timeStr = fmtTime(STATE.hour, STATE.minute);
  document.getElementById('timeBigValue').textContent = timeStr;
  document.getElementById('tcHour').textContent = String(STATE.hour).padStart(2, '0');
  document.getElementById('tcMinute').textContent = String(STATE.minute).padStart(2, '0');
}

function fmtTime(h, m) {
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

// ============================================
//  НАВИГАЦИЯ
// ============================================
function initStepNav() {
  document.querySelectorAll('.btn-back').forEach(btn => {
    btn.addEventListener('click', () => {
      const to = parseInt(btn.dataset.back, 10);
      playTone(500, 0.08);
      goToStep(to);
    });
  });

  document.getElementById('btnTimeConfirm').addEventListener('click', () => {
    playSuccess();
    vibrate(30);
    showPraise(randomFrom(CONFIG.praiseAfterTime));
    sendAnswer();
    setTimeout(() => {
      showFinal();
      goToStep(4);
    }, 1400);
  });
}

// ============================================
//  ОТПРАВКА ОТВЕТА НА СЕРВЕР (→ meet.json)
// ============================================
async function sendAnswer() {
  if (STATE.answerSent) return;
  STATE.answerSent = true;

  const payload = {
    place: STATE.place ? STATE.place.name : '—',
    place_emoji: STATE.place ? STATE.place.emoji : '📍',
    day: STATE.day || '—',
    time: fmtTime(STATE.hour, STATE.minute),
    her_name: CONFIG.herName,
    his_name: CONFIG.yourName,
  };

  try {
    await fetch('/api/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn('Не удалось сохранить ответ:', e);
  }
}

// ============================================
//  ФИНАЛ
// ============================================
function showFinal() {
  const timeStr = fmtTime(STATE.hour, STATE.minute);
  const placeName = STATE.place ? STATE.place.name : '—';
  const placeEmoji = STATE.place ? STATE.place.emoji : '📍';
  const dayLabel = STATE.day || '—';

  document.getElementById('finalTitle').textContent = applyVars(CONFIG.finalTitle);
  document.getElementById('finalMessage').textContent = applyVars(CONFIG.finalMessage);
  document.getElementById('finalFlirt').textContent = CONFIG.finalFlirt;
  document.getElementById('signature').textContent = applyVars(CONFIG.signature);

  // Кнопка "Написать мне" — ведёт в Telegram
  const btnContact = document.getElementById('btnContact');
  const btnContactLabel = document.getElementById('btnContactLabel');
  const contactSubtext = document.getElementById('contactSubtext');

  const tgUser = (CONFIG.telegramUsername || '').replace('@', '');
  btnContact.href = `https://t.me/${tgUser}`;
  btnContactLabel.textContent = CONFIG.contactButton || '💬 Написать мне';
  contactSubtext.textContent = CONFIG.contactSubtext || '';

  const summary = document.getElementById('finalSummary');
  summary.innerHTML = `
    <div class="summary-item">
      <span class="emoji">${placeEmoji}</span>
      <div>
        <div class="label">место</div>
        <div class="value">${placeName}</div>
      </div>
    </div>
    <div class="summary-item">
      <span class="emoji">📅</span>
      <div>
        <div class="label">день</div>
        <div class="value">${dayLabel}</div>
      </div>
    </div>
    <div class="summary-item">
      <span class="emoji">🕐</span>
      <div>
        <div class="label">время</div>
        <div class="value">${timeStr}</div>
      </div>
    </div>
  `;

  // Конфетти
  const conf = document.getElementById('confetti');
  conf.innerHTML = '';
  const colors = ['#ff6b9d','#c9184a','#b388ff','#ffb3d9','#ffeb3b','#ff4081','#f0eff4'];
  for (let i = 0; i < 80; i++) {
    const s = document.createElement('span');
    s.style.left = Math.random() * 100 + '%';
    s.style.background = colors[Math.floor(Math.random() * colors.length)];
    s.style.animationDuration = (2 + Math.random() * 2.5) + 's';
    s.style.animationDelay = (Math.random() * 1.5) + 's';
    s.style.width = s.style.height = (6 + Math.random() * 10) + 'px';
    if (Math.random() > 0.5) s.style.borderRadius = '50%';
    conf.appendChild(s);
  }

  burstHearts();
  setTimeout(burstHearts, 400);
  setTimeout(burstHearts, 800);
  setTimeout(burstHearts, 1200);
}

// ============================================
//  КНОПКА "НАПИСАТЬ МНЕ" (Telegram)
// ============================================
function initFinalActions() {
  const btnContact = document.getElementById('btnContact');
  if (btnContact) {
    btnContact.addEventListener('click', () => {
      playSuccess();
      vibrate(20);
    });
  }
}

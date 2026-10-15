/* ============================================================
   SCRIPT.JS — Полная логика приглашения (серверная версия)
   ============================================================
   Отправка ответа идёт на /api/answer (сервер + БД).
   Все визуальные фишки как в локальной версии:
   убегающая кнопка «Нет», котик-компаньон, canvas-сердечки,
   боке, искры, сохранение прогресса, авто-скролл.
   ============================================================ */

(() => {
  'use strict';

  /* ============================================================
     1. СОСТОЯНИЕ И УТИЛИТЫ
     ============================================================ */

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
    catTimer: null,
    canvasHeartsRunning: false,
    canvasHearts: [],
    // Убегающая кнопка
    noButtonEscaping: false,
    noButtonLastX: 0,
    noButtonLastY: 0,
    noButtonPhraseTimer: null,
    noButtonCooldown: false,
  };

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const rand       = (min, max) => Math.random() * (max - min) + min;
  const randInt    = (min, max) => Math.floor(rand(min, max + 1));
  const randomFrom = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp      = (v, min, max) => Math.max(min, Math.min(max, v));

  const pad2 = n => String(n).padStart(2, '0');
  const fmtTime = (h, m) => `${pad2(h)}:${pad2(m)}`;

  const applyVars = text => String(text)
    .replace(/{herName}/g, CONFIG.herName)
    .replace(/{yourName}/g, CONFIG.yourName);

  const log  = (...args) => { if (CONFIG.debug) console.log('%c💕', 'color:#ff6b9d', ...args); };
  const warn = (...args) => { if (CONFIG.debug) console.warn('⚠️', ...args); };

  const safe = (fn, name = '') => {
    try { fn(); } catch (e) { warn(`Ошибка в ${name}:`, e); }
  };

  // Fallback-фразы для убегающей кнопки
  const RUNAWAY_PHRASES = (CONFIG.runawayPhrases && CONFIG.runawayPhrases.length)
    ? CONFIG.runawayPhrases
    : [
        "Не поймаешь! 😜",
        "Кнопка сбежала 💨",
        "Попробуй ещё! 😄",
        "Мимо! 🎯",
        "Я быстрее! ⚡",
        "Ну куда ты 😅",
        "Даже не пытайся 🙈",
        "Ой, ой, ой! 🏃‍♀️",
        "Не тут-то было 😏",
        "Догоняй! 🏃‍♂️",
        "Слишком медленно 🐢",
        "Она хочет «Да» 💖",
        "Хитрая кнопка 😼",
        "Почти! 🙃",
        "Ещё разок? 🤭",
        "Тебе не догнать 🕊️",
        "Лучше нажми «Да» 💕",
        "Убежала в закат 🌅"
      ];

  // Настройки убегающей кнопки (с fallback)
  const RUNAWAY = Object.assign({
    enabled: true,
    cooldown: 120,
    minDistance: 0.35,
    padding: 16,
    phraseDuration: 1600,
    playWhoosh: true,
    bodyPulse: true,
    yesPulse: true,
    teleportClassDuration: 600,
  }, CONFIG.runaway || {});

  /* ============================================================
     2. ИНИЦИАЛИЗАЦИЯ
     ============================================================ */

  document.addEventListener('DOMContentLoaded', () => {
    log('DOM загружен, инициализация...');

    safe(applyTheme, 'applyTheme');
    safe(loadProgress, 'loadProgress');
    safe(initParticles, 'initParticles');
    safe(initFloatingHearts, 'initFloatingHearts');
    safe(initSparkles, 'initSparkles');
    safe(initBokeh, 'initBokeh');
    safe(initCanvasHearts, 'initCanvasHearts');
    safe(initProgressBar, 'initProgressBar');
    safe(initSoundToggle, 'initSoundToggle');
    safe(initTexts, 'initTexts');
    safe(initYesNo, 'initYesNo');
    safe(initPlaces, 'initPlaces');
    safe(initDays, 'initDays');
    safe(initTimeControls, 'initTimeControls');
    safe(initTimePresets, 'initTimePresets');
    safe(initStepNav, 'initStepNav');
    safe(initFinalActions, 'initFinalActions');
    safe(initCatCompanion, 'initCatCompanion');
    safe(initRestartButton, 'initRestartButton');

    // Котик
    setTimeout(() => {
      if (CONFIG.showCatCompanion) {
        $('#catCompanion')?.classList.add('visible');
        setTimeout(() => sayCat(randomFrom(CONFIG.catReplicas.hello), 4000), 800);
      }
    }, 1500);

    // Ресайз — пересчитываем позицию убегающей кнопки
    window.addEventListener('resize', () => {
      if (STATE.noButtonEscaping) {
        const btn = $('#btnNo');
        if (btn) escapeButton(btn, false);
      }
    });

    log('Инициализация завершена ✨');
  });

  /* ============================================================
     3. ТЕМА И ЗВУК
     ============================================================ */

  function applyTheme() {
    if (CONFIG.theme && CONFIG.theme !== 'pink') {
      document.body.classList.add('theme-' + CONFIG.theme);
    }
  }

  function initSoundToggle() {
    const btn = $('#soundToggle');
    if (!btn) return;
    if (!STATE.soundOn) btn.classList.add('muted');

    btn.addEventListener('click', () => {
      STATE.soundOn = !STATE.soundOn;
      btn.classList.toggle('muted', !STATE.soundOn);
      if (STATE.soundOn) playTone(660, 0.08);
    });
  }

  function playTone(freq = 880, duration = 0.1, type = 'sine') {
    if (!STATE.soundOn) return;
    try {
      if (!STATE.audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        STATE.audioCtx = new Ctx();
      }
      const ctx = STATE.audioCtx;
      if (ctx.state === 'suspended') ctx.resume();

      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      const vol  = CONFIG.volume?.click ?? 0.15;

      osc.type = type;
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) { warn('playTone:', e); }
  }

  function playSuccess() {
    playTone(523, 0.10);
    setTimeout(() => playTone(659, 0.10), 80);
    setTimeout(() => playTone(784, 0.15), 160);
  }

  function playHeartbeat() {
    playTone(220, 0.08, 'sine');
    setTimeout(() => playTone(180, 0.10, 'sine'), 100);
  }

  function playClick() { playTone(700, 0.05); }

  function playWhoosh() {
    if (!RUNAWAY.playWhoosh) return;
    try {
      if (!STATE.soundOn) return;
      if (!STATE.audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        STATE.audioCtx = new Ctx();
      }
      const ctx = STATE.audioCtx;
      if (ctx.state === 'suspended') ctx.resume();

      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      const vol  = CONFIG.volume?.whoosh ?? 0.08;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(900, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.18);

      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } catch (e) {}
  }

  function vibrate(pattern) {
    if (!CONFIG.vibrateEnabled) return;
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) {}
    }
  }

  /* ============================================================
     4. ФОНОВЫЕ ЭФФЕКТЫ
     ============================================================ */

  function initParticles() {
    const container = $('#particles');
    if (!container) return;
    const symbols = ['✦', '✧', '·', '✺', '✹', '★', '☆'];
    const frag = document.createDocumentFragment();

    for (let i = 0; i < 35; i++) {
      const el = document.createElement('div');
      el.className = 'star';
      el.textContent = randomFrom(symbols);
      el.style.left = rand(0, 100) + '%';
      el.style.top  = rand(0, 100) + '%';
      el.style.fontSize = rand(8, 24) + 'px';
      el.style.animationDelay    = rand(0, 3) + 's';
      el.style.animationDuration = rand(2, 6) + 's';
      el.style.opacity = rand(0.3, 0.9);
      frag.appendChild(el);
    }
    container.appendChild(frag);
  }

  function initFloatingHearts() {
    const container = $('#floatingHearts');
    if (!container) return;
    const frag = document.createDocumentFragment();
    const symbols = CONFIG.flyingHearts;

    for (let i = 0; i < 24; i++) {
      const el = document.createElement('div');
      el.className = 'fh';
      el.textContent = randomFrom(symbols);
      el.style.left = rand(0, 100) + '%';
      el.style.fontSize = rand(12, 32) + 'px';
      el.style.animationDuration = rand(8, 18) + 's';
      el.style.animationDelay    = rand(0, 10) + 's';
      frag.appendChild(el);
    }
    container.appendChild(frag);
  }

  function initSparkles() {
    if (!CONFIG.showSparkles) return;
    const container = $('#sparkles');
    if (!container) return;
    const frag = document.createDocumentFragment();

    for (let i = 0; i < 30; i++) {
      const s = document.createElement('div');
      s.className = 'sparkle';
      s.style.left = rand(0, 100) + '%';
      s.style.top  = rand(0, 100) + '%';
      s.style.animationDelay    = rand(0, 2.4) + 's';
      s.style.animationDuration = rand(1.6, 3.2) + 's';
      frag.appendChild(s);
    }
    container.appendChild(frag);
  }

  function initBokeh() {
    if (!CONFIG.showBokeh) return;
    const container = $('#bokeh');
    if (!container) return;
    const frag = document.createDocumentFragment();

    for (let i = 0; i < 18; i++) {
      const b = document.createElement('div');
      b.className = 'bokeh-dot';
      const size = rand(20, 90);
      b.style.width  = size + 'px';
      b.style.height = size + 'px';
      b.style.left = rand(0, 100) + '%';
      b.style.top  = rand(0, 100) + '%';
      b.style.animationDelay    = rand(0, 8) + 's';
      b.style.animationDuration = rand(6, 14) + 's';
      frag.appendChild(b);
    }
    container.appendChild(frag);
  }

  function initCanvasHearts() {
    if (!CONFIG.showCanvasHearts) return;
    const canvas = $('#heartsCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width  = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    const emojis = CONFIG.flyingHearts;

    class Heart {
      constructor() { this.reset(true); }
      reset(initial = false) {
        this.x = rand(0, W);
        this.y = initial ? rand(H, H * 2) : H + 30;
        this.size = rand(14, 32);
        this.speedY = rand(0.4, 1.2);
        this.speedX = rand(-0.3, 0.3);
        this.emoji = randomFrom(emojis);
        this.opacity = rand(0.35, 0.85);
        this.rot = rand(-0.2, 0.2);
        this.rotSpeed = rand(-0.01, 0.01);
        this.sway = rand(0, Math.PI * 2);
        this.swaySpeed = rand(0.005, 0.015);
      }
      update() {
        this.y -= this.speedY;
        this.sway += this.swaySpeed;
        this.x += this.speedX + Math.sin(this.sway) * 0.4;
        this.rot += this.rotSpeed;
        if (this.y < -50) this.reset();
      }
      draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.font = `${this.size}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.emoji, 0, 0);
        ctx.restore();
      }
    }

    const particles = Array.from({ length: 22 }, () => new Heart());
    STATE.canvasHearts = particles;
    STATE.canvasHeartsRunning = true;

    function loop() {
      if (!STATE.canvasHeartsRunning) return;
      ctx.clearRect(0, 0, W, H);
      particles.forEach(p => { p.update(); p.draw(); });
      requestAnimationFrame(loop);
    }
    loop();

    document.addEventListener('visibilitychange', () => {
      STATE.canvasHeartsRunning = !document.hidden;
      if (STATE.canvasHeartsRunning) loop();
    });
  }

  /* ============================================================
     5. ПРОГРЕСС-БАР
     ============================================================ */

  function initProgressBar() {
    const bar = $('#progressBar');
    if (!bar) return;

    if (!CONFIG.showProgressBar) {
      bar.style.display = 'none';
      return;
    }

    const dots = $('#progressDots');
    if (!dots) return;

    const frag = document.createDocumentFragment();
    for (let i = 0; i < 5; i++) {
      const d = document.createElement('div');
      d.className = 'dot';
      d.dataset.step = i;
      frag.appendChild(d);
    }
    dots.appendChild(frag);

    updateProgress();
  }

  function updateProgress() {
    if (!CONFIG.showProgressBar) return;
    const fill = $('#progressFill');
    const dots = $$('.progress-dots .dot');
    if (!fill) return;

    const percent = ((STATE.step + 1) / 5) * 100;
    fill.style.width = percent + '%';

    dots.forEach((d, i) => {
      d.classList.toggle('active', i === STATE.step);
      d.classList.toggle('done',   i <  STATE.step);
    });
  }

  /* ============================================================
     6. ТЕКСТЫ И ПЕЧАТЬ
     ============================================================ */

  function initTexts() {
    const greeting = $('#greeting');
    const subtitle = $('#subtitle');
    const question = $('#question');

    const btnYes = $('#btnYes');
    const btnNoText = $('#btnNoText');
    if (btnYes) {
      const span = btnYes.querySelector('.btn-text');
      if (span) span.textContent = CONFIG.yesButton;
      const emoji = btnYes.querySelector('.btn-emoji');
      if (emoji) emoji.textContent = CONFIG.yesButtonEmoji || '💖';
    }
    if (btnNoText) btnNoText.textContent = CONFIG.noButtonPhrases[0];

    $('#step2Title')?.replaceChildren(document.createTextNode(CONFIG.step2Title));
    $('#step2Subtitle')?.replaceChildren(document.createTextNode(CONFIG.step2Subtitle));
    $('#step3Title')?.replaceChildren(document.createTextNode(CONFIG.step3Title));
    $('#step3Subtitle')?.replaceChildren(document.createTextNode(CONFIG.step3Subtitle));
    $('#step4Title')?.replaceChildren(document.createTextNode(CONFIG.step4Title));
    $('#step4Subtitle')?.replaceChildren(document.createTextNode(CONFIG.step4Subtitle));

    document.title = CONFIG.title;

    if (greeting) {
      typeWriter(greeting, applyVars(CONFIG.greeting), CONFIG.delays.typewriter, () => {
        if (subtitle) {
          subtitle.textContent = CONFIG.subtitle;
          subtitle.style.animation = 'slideDown 0.6s ease both';
        }
        setTimeout(() => {
          if (question) {
            question.textContent = CONFIG.question;
            question.style.animation = 'slideDown 0.6s ease both';
          }
        }, 300);
      });
    }
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
        onDone && onDone();
      }
    };
    tick();
  }

  /* ============================================================
     7. ПОХВАЛА И РЕПЛИКИ КОТИКА
     ============================================================ */

  function showPraise(text) {
    if (!text) return;
    const praise = document.createElement('div');
    praise.className = 'praise';
    praise.textContent = text;
    document.body.appendChild(praise);
    requestAnimationFrame(() => praise.classList.add('show'));
    setTimeout(() => {
      praise.classList.remove('show');
      setTimeout(() => praise.remove(), 700);
    }, CONFIG.delays.praiseDuration);
  }

  function sayCat(text, duration = CONFIG.delays.catBubble) {
    if (!CONFIG.showCatCompanion) return;
    const bubble = $('#catBubble');
    if (!bubble || !text) return;

    bubble.textContent = text;
    bubble.classList.add('show');

    if (STATE.catTimer) clearTimeout(STATE.catTimer);
    STATE.catTimer = setTimeout(() => bubble.classList.remove('show'), duration);
  }

  function initCatCompanion() {
    if (!CONFIG.showCatCompanion) return;
    const cat = $('#catCompanion');
    if (!cat) return;

    cat.addEventListener('click', () => {
      const pools = [
        CONFIG.catReplicas.hello,
        CONFIG.catReplicas.onYes,
      ];
      const pool = randomFrom(pools);
      sayCat(randomFrom(pool), 3000);
      playClick();
    });
  }

  /* ============================================================
     8. СЕРДЕЧКИ
     ============================================================ */

  function heartsExplosion(x, y, count = 20) {
    const symbols = CONFIG.flyingHearts;
    const frag = document.createDocumentFragment();

    for (let i = 0; i < count; i++) {
      const h = document.createElement('div');
      h.className = 'click-heart';
      h.textContent = randomFrom(symbols);
      h.style.left = x + 'px';
      h.style.top  = y + 'px';
      h.style.fontSize = rand(18, 42) + 'px';
      h.style.transform = 'translate(-50%, -50%) scale(0.4)';
      h.style.opacity = '1';
      h.style.transition = 'all 1s cubic-bezier(0.25, 1, 0.5, 1)';
      frag.appendChild(h);
    }
    document.body.appendChild(frag);

    const last = document.body.lastElementChild;
    const nodes = last ? Array.from(last.children) : [];
    if (!nodes.length) {
      Array.from(frag.childNodes).forEach(n => animateHeartBurst(n, x, y));
    } else {
      nodes.forEach(n => animateHeartBurst(n, x, y));
    }
  }

  function animateHeartBurst(h, x, y) {
    requestAnimationFrame(() => {
      const angle = Math.random() * Math.PI * 2;
      const dist = rand(80, 300);
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist - 60;
      h.style.transform =
        `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) ` +
        `scale(1.2) rotate(${rand(-360, 360)}deg)`;
      h.style.opacity = '0';
    });
    setTimeout(() => h.remove(), 1100);
  }

  function flyAwayHearts(count = 6) {
    const symbols = CONFIG.flyingHearts;
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const h = document.createElement('div');
        h.className = 'click-heart';
        h.textContent = randomFrom(symbols);
        h.style.left = rand(0, 100) + 'vw';
        h.style.top  = '100vh';
        h.style.fontSize = rand(20, 40) + 'px';
        h.style.transition = 'all 2s cubic-bezier(0.25, 1, 0.5, 1)';
        h.style.opacity = '1';
        document.body.appendChild(h);
        requestAnimationFrame(() => {
          h.style.transform = `translateY(-115vh) rotate(${rand(-360, 360)}deg)`;
          h.style.opacity = '0';
        });
        setTimeout(() => h.remove(), 2100);
      }, i * 80);
    }
  }

  function burstHearts() {
    const symbols = CONFIG.flyingHearts;
    for (let i = 0; i < 15; i++) {
      const h = document.createElement('div');
      h.textContent = symbols[i % symbols.length];
      h.style.cssText = `
        position: fixed;
        left: 50%; top: 50%;
        font-size: ${rand(16, 36)}px;
        pointer-events: none;
        z-index: 9999;
        transition: all 1s cubic-bezier(0.25, 1, 0.5, 1);
        transform: translate(-50%, -50%) scale(1);
        opacity: 1;
      `;
      document.body.appendChild(h);
      requestAnimationFrame(() => {
        const angle = Math.random() * Math.PI * 2;
        const dist = rand(150, 400);
        h.style.transform =
          `translate(calc(-50% + ${Math.cos(angle) * dist}px), ` +
          `calc(-50% + ${Math.sin(angle) * dist}px)) ` +
          `rotate(${rand(-720, 720)}deg) scale(1.4)`;
        h.style.opacity = '0';
      });
      setTimeout(() => h.remove(), 1100);
    }
  }

  /* ============================================================
     9. УБЕГАЮЩАЯ КНОПКА «НЕТ» + КНОПКА «ДА»
     ============================================================ */

  function initYesNo() {
    const btnYes = $('#btnYes');
    const btnNo  = $('#btnNo');
    if (!btnYes || !btnNo) return;

    if (!btnNo.querySelector('.no-text')) {
      btnNo.innerHTML = `
        <span class="no-text">${CONFIG.noButtonPhrases[0]}</span>
        <span class="no-heart">💖</span>
      `;
    }

    /* ---------- ДА ---------- */
    btnYes.addEventListener('click', () => {
      playSuccess();
      burstHearts();
      vibrate(30);
      showPraise(randomFrom(CONFIG.praiseAfterYes));
      sayCat(randomFrom(CONFIG.catReplicas.onYes), 3000);
      saveProgress({ step: 1 });
      setTimeout(() => goToStep(1), CONFIG.delays.afterPraise);
    });

    /* ---------- НЕТ: убегающая кнопка ---------- */
    if (!RUNAWAY.enabled) {
      // Если убегание выключено — обычное поведение
      btnNo.addEventListener('click', (e) => handleNoClick(e, btnNo));
      return;
    }

    // Наведение мыши
    btnNo.addEventListener('mouseenter', () => {
      if (STATE.noButtonCooldown) return;
      escapeButton(btnNo, true);
    });

    // Тап на мобилке
    btnNo.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (STATE.noButtonCooldown) return;
      escapeButton(btnNo, true);
    }, { passive: false });

    // Если всё-таки поймала — обрабатываем клик
    btnNo.addEventListener('click', (e) => {
      e.preventDefault();
      handleNoClick(e, btnNo);
      escapeButton(btnNo, true);
    });

    // Фокус (Tab)
    btnNo.addEventListener('focus', () => {
      if (STATE.noButtonCooldown) return;
      escapeButton(btnNo, true);
    });
  }

  /**
   * Обработка «пойманного» клика по кнопке «Нет».
   * Меняет текст, добавляет эффекты.
   */
  function handleNoClick(e, btnNo) {
    STATE.noClicks++;
    playHeartbeat();
    vibrate([20, 30, 20]);

    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 500);

    const rect = btnNo.getBoundingClientRect();
    const x = (e && e.clientX) || (rect.left + rect.width / 2);
    const y = (e && e.clientY) || (rect.top + rect.height / 2);
    heartsExplosion(x, y, 22);

    const noText = btnNo.querySelector('.no-text');
    const phrases = CONFIG.noButtonPhrases;
    const idx = Math.min(STATE.noClicks, phrases.length - 1);
    if (noText) noText.textContent = phrases[idx];

    const heart = btnNo.querySelector('.no-heart');
    if (heart) heart.textContent = randomFrom(CONFIG.emojiSets.hearts);

    sayCat(randomFrom(CONFIG.catReplicas.onNo), 2500);

    if (STATE.noClicks >= 2) flyAwayHearts(6);
    if (STATE.noClicks >= 3) flyAwayHearts(10);
    if (STATE.noClicks >= 4) flyAwayHearts(15);
  }

  function escapeButton(btn, showPhrase = true) {
    if (!btn || !RUNAWAY.enabled) return;

    if (!STATE.noButtonEscaping) {
      const rect = btn.getBoundingClientRect();
      btn.style.width  = rect.width + 'px';
      btn.style.height = rect.height + 'px';
      btn.classList.add('runaway');
      STATE.noButtonEscaping = true;
    }

    const rect = btn.getBoundingClientRect();
    const btnW = rect.width  || 150;
    const btnH = rect.height || 56;

    const padX = RUNAWAY.padding;
    const padY = RUNAWAY.padding;
    const maxX = Math.max(padX, window.innerWidth  - btnW - padX);
    const maxY = Math.max(padY, window.innerHeight - btnH - padY);

    let newX = 0, newY = 0;
    const minDist = Math.min(window.innerWidth, window.innerHeight) * RUNAWAY.minDistance;
    for (let attempt = 0; attempt < 8; attempt++) {
      newX = rand(padX, maxX);
      newY = rand(padY, maxY);
      const dx = newX - STATE.noButtonLastX;
      const dy = newY - STATE.noButtonLastY;
      if (Math.sqrt(dx * dx + dy * dy) >= minDist) break;
    }
    STATE.noButtonLastX = newX;
    STATE.noButtonLastY = newY;

    STATE.noButtonCooldown = true;
    setTimeout(() => { STATE.noButtonCooldown = false; }, RUNAWAY.cooldown);

    btn.classList.add('teleporting');
    setTimeout(() => btn.classList.remove('teleporting'), RUNAWAY.teleportClassDuration);

    btn.style.transform = `translate(${newX}px, ${newY}px)`;

    if (RUNAWAY.bodyPulse) {
      document.body.classList.add('escape-pulse');
      setTimeout(() => document.body.classList.remove('escape-pulse'), 600);
    }

    if (RUNAWAY.yesPulse) {
      const btnYes = $('#btnYes');
      if (btnYes) {
        btnYes.classList.add('pulse-once');
        setTimeout(() => btnYes.classList.remove('pulse-once'), 750);
      }
    }

    playWhoosh();
    vibrate([15, 25, 15]);

    if (showPhrase) showRunawayPhrase(btn);
  }

  function showRunawayPhrase(btn) {
    $$('.runaway-phrase').forEach(el => el.remove());

    const phrase = document.createElement('div');
    phrase.className = 'runaway-phrase';
    phrase.textContent = randomFrom(RUNAWAY_PHRASES);
    document.body.appendChild(phrase);

    const btnRect = btn.getBoundingClientRect();
    const phraseRect = phrase.getBoundingClientRect();

    const margin = 12;
    let px = btnRect.left - phraseRect.width / 2 + btnRect.width / 2;
    let py = btnRect.top - phraseRect.height - margin;

    if (py < 8) py = btnRect.bottom + margin;
    px = clamp(px, 8, window.innerWidth - phraseRect.width - 8);
    py = clamp(py, 8, window.innerHeight - phraseRect.height - 8);

    phrase.style.left = px + 'px';
    phrase.style.top  = py + 'px';

    requestAnimationFrame(() => phrase.classList.add('show'));

    if (STATE.noButtonPhraseTimer) clearTimeout(STATE.noButtonPhraseTimer);
    STATE.noButtonPhraseTimer = setTimeout(() => {
      phrase.classList.remove('show');
      setTimeout(() => phrase.remove(), 400);
    }, RUNAWAY.phraseDuration);
  }

  /* ============================================================
     10. ШАГИ: МЕСТО / ДЕНЬ / ВРЕМЯ
     ============================================================ */

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
      </svg>`,
    bowling: `
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="48" fill="#e1f5fe" stroke="#4fc3f7" stroke-width="2"/>
        <circle cx="50" cy="55" r="22" fill="#4fc3f7"/>
        <circle cx="44" cy="48" r="3" fill="#fff"/>
        <circle cx="56" cy="48" r="3" fill="#fff"/>
        <circle cx="50" cy="42" r="3" fill="#fff"/>
        <ellipse cx="50" cy="82" rx="30" ry="5" fill="#8d6e63"/>
      </svg>`,
    rooftop: `
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="skyR" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#7c4dff"/>
            <stop offset="60%" stop-color="#ff7043"/>
            <stop offset="100%" stop-color="#ffb74d"/>
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill="url(#skyR)"/>
        <circle cx="50" cy="50" r="14" fill="#ffeb3b" opacity="0.9"/>
        <path d="M10,80 L20,60 L28,72 L38,55 L48,75 L58,60 L68,72 L78,55 L90,80 Z" fill="#2c1a4d" opacity="0.85"/>
        <rect x="15" y="80" width="70" height="15" fill="#1a0f2e"/>
      </svg>`
  };

  function initPlaces() {
    const grid = $('#placesGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const frag = document.createDocumentFragment();

    CONFIG.places.forEach((place, i) => {
      const card = document.createElement('div');
      card.className = 'place-card';
      card.dataset.id = place.id;
      card.style.animationDelay = (i * 0.05) + 's';
      card.innerHTML = `
        <div class="place-svg">${PLACE_SVGS[place.svg] || ''}</div>
        <div class="place-name">${place.emoji} ${place.name}</div>
        <div class="place-desc">${place.description}</div>
      `;
      card.addEventListener('click', () => {
        $$('.place-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        STATE.place = place;

        playSuccess();
        vibrate(20);
        burstHearts();
        showPraise(randomFrom(CONFIG.praiseAfterPlace));

        const reaction = CONFIG.catReplicas.placeReactions?.[place.id];
        if (reaction) sayCat(reaction, 3000);

        saveProgress({ placeId: place.id });
        setTimeout(() => goToStep(2), CONFIG.delays.afterPraise);
      });
      frag.appendChild(card);
    });
    grid.appendChild(frag);
  }

  /* ---------- ДНИ ---------- */
  const MONTHS_SHORT = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  const WEEKDAYS_SHORT = ['вс','пн','вт','ср','чт','пт','сб'];

  function initDays() {
    const grid = $('#daysGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const frag = document.createDocumentFragment();

    if (CONFIG.useCalendar) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      for (let i = 0; i < CONFIG.daysAhead; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        frag.appendChild(makeDayCard(d, i === 0, i));
      }
    } else {
      CONFIG.days.forEach((name, i) => {
        const card = document.createElement('div');
        card.className = 'day-card';
        card.innerHTML = `
          <div class="day-name">${name.slice(0, 3).toLowerCase()}</div>
          <div class="day-num">${i + 1}</div>
          <div class="day-month">день</div>
        `;
        card.dataset.label = name;
        card.addEventListener('click', () => selectDay(name, card));
        frag.appendChild(card);
      });
    }
    grid.appendChild(frag);
  }

  function makeDayCard(date, isToday, index) {
    const card = document.createElement('div');
    const dow = date.getDay();
    const isWeekend = dow === 0 || dow === 6;
    card.className = 'day-card' + (isToday ? ' today' : '') + (isWeekend ? ' weekend' : '');
    card.style.animationDelay = (index * 0.03) + 's';

    const dayName = WEEKDAYS_SHORT[dow];
    const dayNum  = date.getDate();
    const month   = MONTHS_SHORT[date.getMonth()];
    const emoji   = CONFIG.dayEmojis?.[dow] || '';

    card.innerHTML = `
      <div class="day-name">${dayName}</div>
      <div class="day-num">${emoji ? `<span style="font-size:0.85em;">${emoji}</span> ` : ''}${dayNum}</div>
      <div class="day-month">${month}</div>
    `;

    const label = `${dayName}, ${dayNum} ${month}`;
    card.dataset.label = label;
    card.addEventListener('click', () => selectDay(label, card));
    return card;
  }

  function selectDay(label, card) {
    $$('.day-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    STATE.day = label;

    playSuccess();
    vibrate(20);
    showPraise(randomFrom(CONFIG.praiseAfterDay));
    sayCat(randomFrom(CONFIG.catReplicas.onDayStep), 2500);

    saveProgress({ day: label });
    setTimeout(() => goToStep(3), CONFIG.delays.afterPraise);
  }

  /* ---------- ВРЕМЯ ---------- */
  function initTimeControls() {
    $$('.tc-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const unit = btn.dataset.unit;
        const dir  = btn.dataset.dir === 'up' ? 1 : -1;

        if (unit === 'hour') {
          STATE.hour = (STATE.hour + dir * (CONFIG.hourStep || 1) + 24) % 24;
        } else {
          STATE.minute = (STATE.minute + dir * CONFIG.minuteStep + 60) % 60;
        }
        playClick();
        vibrate(10);
        updateTimeDisplay();
      });
    });
    updateTimeDisplay();
  }

  function initTimePresets() {
    const container = $('#timePresets');
    if (!container) return;
    container.innerHTML = '';
    const frag = document.createDocumentFragment();

    CONFIG.timePresets.forEach(preset => {
      const btn = document.createElement('button');
      btn.className = 'preset-btn';
      btn.type = 'button';
      btn.textContent = preset.label;
      btn.addEventListener('click', () => {
        STATE.hour   = preset.hour;
        STATE.minute = preset.minute;
        playSuccess();
        vibrate(15);
        updateTimeDisplay();
        saveProgress({ hour: STATE.hour, minute: STATE.minute });
      });
      frag.appendChild(btn);
    });
    container.appendChild(frag);
  }

  function updateTimeDisplay() {
    const timeStr = fmtTime(STATE.hour, STATE.minute);
    const big = $('#timeBigValue');
    const h   = $('#tcHour');
    const m   = $('#tcMinute');
    if (big) big.textContent = timeStr;
    if (h)   h.textContent   = pad2(STATE.hour);
    if (m)   m.textContent   = pad2(STATE.minute);

    const label = $('#timeBigLabel');
    if (label && CONFIG.timeLabels) {
      const lbl = getTimeLabel(STATE.hour);
      label.textContent = `${lbl.emoji} ${lbl.text}`;
    }
  }

  function getTimeLabel(hour) {
    const L = CONFIG.timeLabels;
    if (hour >= L.morning.from && hour < L.morning.to)         return L.morning;
    if (hour >= L.afternoon.from && hour < L.afternoon.to)     return L.afternoon;
    if (hour >= L.evening.from && hour < L.evening.to)         return L.evening;
    return L.night;
  }

  /* ============================================================
     11. НАВИГАЦИЯ
     ============================================================ */

  function goToStep(n) {
    const current = $('.step.active');
    const next    = $(`.step[data-step="${n}"]`);
    if (!next || current === next) return;

    if (current) {
      current.classList.add('leaving');
      setTimeout(() => current.classList.remove('active', 'leaving'),
                 CONFIG.delays.stepTransition);
    }

    setTimeout(() => {
      next.classList.add('active');
      STATE.step = n;
      updateProgress();

      if (CONFIG.autoScrollTop) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      saveProgress({ step: n });

      const catMsgs = {
        1: CONFIG.catReplicas.onPlaceStep,
        2: CONFIG.catReplicas.onDayStep,
        3: CONFIG.catReplicas.onTimeStep,
        4: CONFIG.catReplicas.onFinal,
      }[n];
      if (catMsgs) setTimeout(() => sayCat(randomFrom(catMsgs), 3500), 700);

    }, CONFIG.delays.stepTransition - 50);
  }

  function initStepNav() {
    $$('.btn-back').forEach(btn => {
      btn.addEventListener('click', () => {
        const to = parseInt(btn.dataset.back, 10);
        playClick();
        goToStep(to);
      });
    });

    const confirm = $('#btnTimeConfirm');
    if (confirm) {
      confirm.addEventListener('click', () => {
        playSuccess();
        vibrate(30);
        showPraise(randomFrom(CONFIG.praiseAfterTime));
        sayCat(randomFrom(CONFIG.catReplicas.onFinal), 3000);

        sendAnswer();
        saveProgress({ hour: STATE.hour, minute: STATE.minute, step: 4 });

        setTimeout(() => {
          showFinal();
          goToStep(4);
        }, CONFIG.delays.afterPraise);
      });
    }
  }

  /* ============================================================
     12. ФИНАЛЬНЫЙ ЭКРАН
     ============================================================ */

  function showFinal() {
    const timeStr = fmtTime(STATE.hour, STATE.minute);
    const place   = STATE.place;
    const placeName  = place ? place.name  : CONFIG.finalFallbacks.place;
    const placeEmoji = place ? place.emoji : CONFIG.summaryEmojis.place;
    const dayLabel   = STATE.day || CONFIG.finalFallbacks.day;

    $('#finalTitle')?.replaceChildren(document.createTextNode(applyVars(CONFIG.finalTitle)));
    $('#finalMessage')?.replaceChildren(document.createTextNode(applyVars(CONFIG.finalMessage)));
    $('#finalFlirt')?.replaceChildren(document.createTextNode(CONFIG.finalFlirt));
    $('#signature')?.replaceChildren(document.createTextNode(applyVars(CONFIG.signature)));

    const btnContact = $('#btnContact');
    const btnContactLabel = $('#btnContactLabel');
    const contactSubtext = $('#contactSubtext');
    const tgUser = (CONFIG.telegramUsername || '').replace('@', '');
    if (btnContact) btnContact.href = `https://t.me/${tgUser}`;
    if (btnContactLabel) btnContactLabel.textContent = CONFIG.contactButton;
    if (contactSubtext) contactSubtext.textContent = CONFIG.contactSubtext;

    const summary = $('#finalSummary');
    if (summary) {
      summary.innerHTML = `
        <div class="summary-item">
          <span class="emoji">${placeEmoji}</span>
          <div>
            <div class="label">${CONFIG.summaryLabels.place}</div>
            <div class="value">${placeName}</div>
          </div>
        </div>
        <div class="summary-item">
          <span class="emoji">${CONFIG.summaryEmojis.day}</span>
          <div>
            <div class="label">${CONFIG.summaryLabels.day}</div>
            <div class="value">${dayLabel}</div>
          </div>
        </div>
        <div class="summary-item">
          <span class="emoji">${CONFIG.summaryEmojis.time}</span>
          <div>
            <div class="label">${CONFIG.summaryLabels.time}</div>
            <div class="value">${timeStr}</div>
          </div>
        </div>
      `;
    }

    spawnConfetti();

    burstHearts();
    setTimeout(burstHearts, 400);
    setTimeout(burstHearts, 800);
    setTimeout(burstHearts, 1200);

    saveProgress({ completed: true });
  }

  function spawnConfetti() {
    const conf = $('#confetti');
    if (!conf) return;
    conf.innerHTML = '';
    const colors = ['#ff6b9d','#c9184a','#b388ff','#ffb3d9','#ffeb3b','#ff4081','#4fc3f7'];
    const frag = document.createDocumentFragment();

    for (let i = 0; i < 90; i++) {
      const s = document.createElement('span');
      s.style.left = rand(0, 100) + '%';
      s.style.background = randomFrom(colors);
      s.style.animationDuration = rand(2, 4.5) + 's';
      s.style.animationDelay    = rand(0, 1.5) + 's';
      const size = rand(6, 16);
      s.style.width  = size + 'px';
      s.style.height = size + 'px';
      if (Math.random() > 0.5) s.style.borderRadius = '50%';
      frag.appendChild(s);
    }
    conf.appendChild(frag);
  }

  /* ============================================================
     13. СОХРАНЕНИЕ ПРОГРЕССА
     ============================================================ */

  function saveProgress(data) {
    if (!CONFIG.saveProgress) return;
    try {
      const key = CONFIG.progressKey || 'date-invitation-v2';
      const existing = JSON.parse(localStorage.getItem(key) || '{}');
      const merged = { ...existing, ...data, updated: Date.now() };
      localStorage.setItem(key, JSON.stringify(merged));
    } catch (e) { warn('saveProgress:', e); }
  }

  function loadProgress() {
    if (!CONFIG.saveProgress) return;
    try {
      const key = CONFIG.progressKey || 'date-invitation-v2';
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (!saved) return;

      if (typeof saved.hour === 'number')   STATE.hour   = saved.hour;
      if (typeof saved.minute === 'number') STATE.minute = saved.minute;

      if (saved.placeId) {
        const place = CONFIG.places.find(p => p.id === saved.placeId);
        if (place) STATE.place = place;
      }

      if (saved.day) STATE.day = saved.day;

      log('Прогресс восстановлен:', saved);
    } catch (e) { warn('loadProgress:', e); }
  }

  /* ============================================================
     14. КНОПКА TELEGRAM И РЕСТАРТ
     ============================================================ */

  function initFinalActions() {
    const btnContact = $('#btnContact');
    if (btnContact) {
      btnContact.addEventListener('click', () => {
        playSuccess();
        vibrate(20);
      });
    }
  }

  function initRestartButton() {
    const btn = $('#btnRestart');
    if (!btn) return;

    btn.addEventListener('click', () => {
      try {
        const key = CONFIG.progressKey || 'date-invitation-v2';
        localStorage.removeItem(key);
      } catch (e) {}
      location.reload();
    });
  }

  /* ============================================================
     15. ОТПРАВКА ОТВЕТА НА СЕРВЕР (БД)
     ============================================================
     POST /api/answer
     Body (JSON): { place, place_emoji, day, time, her_name, his_name, timestamp }
     Ответ: { ok: true } — успех, иначе ошибку логируем.
     ============================================================ */

  async function sendAnswer() {
    if (STATE.answerSent) return;
    STATE.answerSent = true;

    const payload = {
      place:       STATE.place ? STATE.place.name  : CONFIG.finalFallbacks.place,
      place_id:    STATE.place ? STATE.place.id    : null,
      place_emoji: STATE.place ? STATE.place.emoji : CONFIG.summaryEmojis.place,
      day:         STATE.day || CONFIG.finalFallbacks.day,
      time:        fmtTime(STATE.hour, STATE.minute),
      hour:        STATE.hour,
      minute:      STATE.minute,
      her_name:    CONFIG.herName,
      his_name:    CONFIG.yourName,
      timestamp:   new Date().toISOString(),
      user_agent:  navigator.userAgent || '—',
    };

    log('Отправляем ответ на сервер:', payload);

    try {
      const res = await fetch('/api/answer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json().catch(() => ({}));
      log('Ответ сервера:', data);

    } catch (e) {
      warn('Не удалось отправить ответ:', e);
      // Не показываем пользователю ошибку — UX важнее.
      // Но сохраняем локально, чтобы можно было отправить повторно.
      saveProgress({ pendingAnswer: payload });
    }
  }

})();

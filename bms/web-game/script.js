// 2LBMS Retro web game with sounds and tutorial
(() => {
  // Levels configuration
  const levels = [
    {cells:2, tolerance:0.18, startV:3.80, difficulty:'Easy', safeMaxCurrent:30},
    {cells:4, tolerance:0.12, startV:3.75, difficulty:'Easy+', safeMaxCurrent:20},
    {cells:6, tolerance:0.09, startV:3.70, difficulty:'Medium', safeMaxCurrent:12},
    {cells:8, tolerance:0.06, startV:3.65, difficulty:'Hard', safeMaxCurrent:8},
    {cells:12, tolerance:0.04, startV:3.60, difficulty:'Very Hard', safeMaxCurrent:5}
  ];

  let levelIndex = 0;
  let cells = [];
  let running = false;
  let phase = 'idle'; // 'charging' | 'discharging' | 'finished' | 'exploded'
  let tickTimer = null;
  const TICK_MS = 250;
  const SAFE_TRUE_OV = 4.20;
  const EXPLOSION_OV = 4.30;
  const EXPLOSION_TEMP = 85;
  let soundOn = true;

  // WebAudio context and simple FM-like synth for retro sounds
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new AudioCtx();
  }
  function playBeep(freq = 880, time = 0.08, type = 'sine') {
    if (!soundOn) return;
    ensureAudio();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + time);
    o.start(now);
    o.stop(now + time + 0.02);
  }
  function playAlarm() {
    if (!soundOn) return;
    ensureAudio();
    const now = audioCtx.currentTime;
    const o1 = audioCtx.createOscillator();
    const o2 = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o1.type = 'square';
    o2.type = 'sawtooth';
    o1.frequency.value = 440;
    o2.frequency.value = 220;
    g.gain.value = 0.0001;
    o1.connect(g); o2.connect(g);
    g.connect(audioCtx.destination);
    g.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
    o1.start(now); o2.start(now);
    o1.stop(now + 1.6); o2.stop(now + 1.6);
  }
  function playExplosion() {
    if (!soundOn) return;
    ensureAudio();
    const now = audioCtx.currentTime;
    // create noise burst
    const bufferSize = 2 * audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    const noise = audioCtx.createBufferSource();
    const g = audioCtx.createGain();
    noise.buffer = buffer;
    g.gain.value = 0.0001;
    noise.connect(g);
    g.connect(audioCtx.destination);
    g.gain.exponentialRampToValueAtTime(0.6, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);
    noise.start(now);
    noise.stop(now + 2.0);
  }

  // DOM helpers
  const el = id => document.getElementById(id);
  const chargeCurrent = el('chargeCurrent');
  const balanceThreshold = el('balanceThreshold');
  const ovCutoff = el('ovCutoff');
  const uvCutoff = el('uvCutoff');
  const tempLimit = el('tempLimit');
  const startBtn = el('startBtn');
  const nextBtn = el('nextLevelBtn');
  const tutorialBtn = el('tutorialBtn');
  const soundToggle = el('soundToggle');
  const cellsWrap = el('cells');
  const packFill = el('packFill');
  const log = el('log');
  const levelNum = el('level-num');

  const tutorialOverlay = el('tutorialOverlay');
  const tutorialSteps = Array.from(document.querySelectorAll('#tutorialSteps li'));
  const tutorialPrev = el('tutorialPrev');
  const tutorialNext = el('tutorialNext');
  const tutorialClose = el('tutorialClose');

  // outputs map
  const outputs = {
    chargeCurrentVal: el('chargeCurrentVal'),
    balanceThresholdVal: el('balanceThresholdVal'),
    ovCutoffVal: el('ovCutoffVal'),
    uvCutoffVal: el('uvCutoffVal'),
    tempLimitVal: el('tempLimitVal')
  };

  function updateOutputs() {
    outputs.chargeCurrentVal.textContent = chargeCurrent.value;
    outputs.balanceThresholdVal.textContent = Number(balanceThreshold.value).toFixed(2);
    outputs.ovCutoffVal.textContent = Number(ovCutoff.value).toFixed(2);
    outputs.uvCutoffVal.textContent = Number(uvCutoff.value).toFixed(2);
    outputs.tempLimitVal.textContent = tempLimit.value;
  }
  [chargeCurrent, balanceThreshold, ovCutoff, uvCutoff, tempLimit].forEach(i => i.addEventListener('input', updateOutputs));

  function logLine(s) {
    const time = new Date().toLocaleTimeString();
    log.textContent += `[${time}] ${s}\n`;
    log.scrollTop = log.scrollHeight;
  }

  function buildCellsDOM(n) {
    cellsWrap.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const elCell = document.createElement('div');
      elCell.className = 'cell';
      elCell.innerHTML = `<div class="label">C${i+1}</div><div class="level" style="height:10%"></div><div class="vlabel">0.00V</div>`;
      cellsWrap.appendChild(elCell);
    }
  }

  function renderCells() {
    const domCells = cellsWrap.children;
    let total = 0;
    for (let i = 0; i < cells.length; i++) {
      const v = cells[i].v;
      total += v;
      const h = Math.min(100, ((v - 2.5) / (4.4 - 2.5)) * 100);
      domCells[i].querySelector('.level').style.height = `${h}%`;
      domCells[i].querySelector('.vlabel').textContent = `${v.toFixed(3)}V`;
      if (v > SAFE_TRUE_OV) domCells[i].querySelector('.level').style.background = 'linear-gradient(#ff9a9a,#ff0000)';
      else domCells[i].querySelector('.level').style.background = 'linear-gradient(#7CFF7C,#0a6)';
    }
    const avg = total / cells.length;
    const percent = Math.max(0, Math.min(100, ((avg - 2.5) / (4.4 - 2.5)) * 100));
    packFill.style.width = `${percent}%`;
  }

  function setupLevel() {
    const L = levels[levelIndex];
    levelNum.textContent = levelIndex + 1;
    buildCellsDOM(L.cells);
    cells = [];
    for (let i = 0; i < L.cells; i++) {
      const v = L.startV + (Math.random() - 0.5) * L.tolerance;
      cells.push({ v: Number(v.toFixed(3)), t: 25 + Math.random() * 5 });
    }
    renderCells();
    log.textContent = `Retro BMS Console\nLevel ${levelIndex + 1} - ${L.difficulty}\nTune BMS and press START.\n`;
    phase = 'idle';
    running = false;
    startBtn.disabled = false;
  }

  function applyBalancing(balanceThresh) {
    const avg = cells.reduce((s, c) => s + c.v, 0) / cells.length;
    let highestIdx = 0, highestV = -Infinity;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].v > highestV) {
        highestV = cells[i].v;
        highestIdx = i;
      }
    }
    if (highestV - avg > balanceThresh) {
      cells[highestIdx].v -= 0.005 + Math.random() * 0.01;
      if (cells[highestIdx].v < avg) cells[highestIdx].v = avg;
      logLine(`Balancer active on cell ${highestIdx + 1}`);
      playBeep(660, 0.06, 'square');
    }
  }

  function checkExplode() {
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].v > EXPLOSION_OV) {
        triggerExplosion(`Cell ${i + 1} exceeded ${EXPLOSION_OV.toFixed(2)} V!`);
        return true;
      }
      if (cells[i].t > EXPLOSION_TEMP) {
        triggerExplosion(`Cell ${i + 1} overheated to ${cells[i].t.toFixed(0)}°C!`);
        return true;
      }
    }
    return false;
  }

  function triggerExplosion(reason) {
    phase = 'exploded';
    running = false;
    startBtn.disabled = true;
    logLine('BOOM! ' + reason);
    const crt = el('crt');
    crt.classList.add('explode');
    playExplosion();
    setTimeout(() => crt.classList.remove('explode'), 1600);
    cellsWrap.querySelectorAll('.level').forEach(l => l.style.background = 'linear-gradient(#ffb347,#ff0000)');
    playAlarm();
  }

  function stopSimulation(msg) {
    running = false;
    phase = 'finished';
    clearInterval(tickTimer);
    startBtn.disabled = true;
    logLine(msg);
    playBeep(880, 0.12, 'sine');
  }

  function tick() {
    const cc = Number(chargeCurrent.value);
    const bth = Number(balanceThreshold.value);
    const ov = Number(ovCutoff.value);
    const uv = Number(uvCutoff.value);
    const tlim = Number(tempLimit.value);
    const L = levels[levelIndex];

    const avg = cells.reduce((s, c) => s + c.v, 0) / cells.length;

    if (phase === 'charging') {
      const perCellChargeEffect = (cc / Math.max(1, L.cells)) * 0.0008;
      for (let i = 0; i < cells.length; i++) {
        const imbalanceFactor = 1 - Math.min(0.8, (cells[i].v - avg) * 0.3);
        cells[i].v += perCellChargeEffect * imbalanceFactor * (1 + Math.random() * 0.1);
        const tempRise = (cc / Math.max(1, L.safeMaxCurrent)) * 0.6 + Math.abs(cells[i].v - SAFE_TRUE_OV) * 2;
        cells[i].t += tempRise * 0.02;
      }

      applyBalancing(bth);
      renderCells();

      const anyAboveOVcut = cells.some(c => c.v >= ov);
      if (anyAboveOVcut) {
        logLine(`BMS: Over-voltage threshold reached (OV cutoff ${ov.toFixed(2)}V). Stopping charge.`);
        if (ov > 4.25) {
          for (let j = 0; j < 3; j++) {
            cells[Math.floor(Math.random() * cells.length)].v += 0.02;
          }
          renderCells();
        }
        setTimeout(() => {
          if (phase !== 'exploded') {
            phase = 'discharging';
            logLine('Switching to discharge phase.');
            playBeep(660, 0.06, 'sine');
          }
        }, 800);
      }

      const anyTempExceeded = cells.some(c => c.t >= tlim);
      if (anyTempExceeded) {
        logLine(`BMS: Temperature threshold reached (${tlim}°C). Stopping charge.`);
        setTimeout(() => {
          if (phase !== 'exploded') {
            phase = 'discharging';
            logLine('Switching to discharge phase due to temp.');
            playBeep(600, 0.08, 'sine');
          }
        }, 600);
      }

      if (checkExplode()) { clearInterval(tickTimer); return; }

    } else if (phase === 'discharging') {
      const dischargeRate = 0.0006 + (Math.random() * 0.0003);
      for (let i = 0; i < cells.length; i++) {
        cells[i].v -= dischargeRate * (1 + Math.random() * 0.1);
        cells[i].t -= 0.05 + Math.random() * 0.02;
        if (cells[i].t < 20) cells[i].t = 20;
      }
      applyBalancing(bth);
      renderCells();

      const anyBelowUV = cells.some(c => c.v <= uv);
      if (anyBelowUV) {
        stopSimulation('BMS: Under-voltage reached. Pack safe but undercharged. Level failed.');
        clearInterval(tickTimer);
        return;
      }

      const avgNow = cells.reduce((s, c) => s + c.v, 0) / cells.length;
      if (avgNow <= levels[levelIndex].startV - 0.05) {
        stopSimulation('Cycle complete. Level success!');
        clearInterval(tickTimer);
        return;
      }

      if (checkExplode()) { clearInterval(tickTimer); return; }
    }

    if (checkExplode()) { clearInterval(tickTimer); return; }
  }

  function startGame() {
    if (running) return;
    running = true;
    phase = 'charging';
    logLine('START pressed: beginning charge sequence...');
    logLine(`Settings: I=${chargeCurrent.value}A, Bal_th=${Number(balanceThreshold.value).toFixed(2)}V, OV=${Number(ovCutoff.value).toFixed(2)}V, UV=${Number(uvCutoff.value).toFixed(2)}V, Tlim=${tempLimit.value}°C`);
    tickTimer = setInterval(tick, TICK_MS);
    startBtn.disabled = true;
    playBeep(1200, 0.06);
  }

  // Tutorial logic: step through items and highlight targets
  let tutorialIndex = 0;
  function openTutorial(startIndex = 0) {
    tutorialIndex = startIndex;
    tutorialOverlay.classList.remove('hidden');
    tutorialOverlay.setAttribute('aria-hidden', 'false');
    highlightTutorial();
    playBeep(880, 0.06);
  }
  function closeTutorial() {
    tutorialOverlay.classList.add('hidden');
    tutorialOverlay.setAttribute('aria-hidden', 'true');
    removeHighlights();
    playBeep(440, 0.06);
  }
  function highlightTutorial() {
    removeHighlights();
    const li = tutorialSteps[tutorialIndex];
    tutorialSteps.forEach(s => s.classList.remove('current'));
    li.classList.add('current');
    const target = li.getAttribute('data-target');
    const targetEl = el(target);
    if (targetEl) {
      targetEl.classList.add('highlight');
      // flash a few times
      let f=0;
      const iv=setInterval(()=>{targetEl.classList.toggle('highlight');f++;if(f>5){clearInterval(iv);targetEl.classList.add('highlight')}} ,200);
    }
  }
  function removeHighlights() {
    ['chargeCurrent','balanceThreshold','ovCutoff','uvCutoff','tempLimit'].forEach(id => {
      const e = el(id);
      if (e) e.classList.remove('highlight');
    });
  }
  tutorialPrev.addEventListener('click', () => {
    tutorialIndex = Math.max(0, tutorialIndex - 1);
    highlightTutorial();
    playBeep(660, 0.05);
  });
  tutorialNext.addEventListener('click', () => {
    tutorialIndex = Math.min(tutorialSteps.length - 1, tutorialIndex + 1);
    highlightTutorial();
    playBeep(880, 0.05);
  });
  tutorialClose.addEventListener('click', closeTutorial);
  tutorialBtn.addEventListener('click', () => openTutorial(0));

  // Sound toggle
  soundToggle.addEventListener('click', () => {
    soundOn = !soundOn;
    soundToggle.textContent = `SOUND: ${soundOn ? 'ON' : 'OFF'}`;
    playBeep(800, 0.04);
  });

  // wiring
  startBtn.addEventListener('click', startGame);
  nextBtn.addEventListener('click', () => {
    levelIndex = Math.min(levels.length - 1, levelIndex + 1);
    setupLevel();
    playBeep(720, 0.05);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); startGame(); }
    else if (e.key === 'n' || e.key === 'N') { levelIndex = Math.min(levels.length - 1, levelIndex + 1); setupLevel(); }
    else if (e.key === 't' || e.key === 'T') { openTutorial(); }
    else if (e.key === 'm' || e.key === 'M') { soundOn = !soundOn; soundToggle.textContent = `SOUND: ${soundOn ? 'ON' : 'OFF'}`; }
  });

  // init
  updateOutputs();
  setupLevel();
  // auto-show tutorial on first load
  setTimeout(()=>openTutorial(0), 600);
})();

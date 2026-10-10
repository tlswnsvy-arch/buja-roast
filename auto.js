// AI 완전 자동 로스팅 (사용자 허락 2026-10-08: "완전자동제어 허락, 꼭 옆에 있어야 한다는 경고")
// AI 추천(lastRec)대로 예열 → 투입 감지 → 온도별 버너 → 목표 곡선 보정 → 1차 크랙 뒤 상승폭 도달 시 자동 배출 → 쿨링 자동 끄기.
// '예열만' 모드는 목표 온도로 데우고 유지하다가 투입하면 자동을 멈춘다(그다음은 손으로).
// 명령은 control.js의 cmd(버너·쿨링·배출구)만 쓰고, 전체 정지·온도 한계·응답 끊김·화면 이탈 안전장치를 그대로 따른다.

// 알람: 삑 소리 + 진동 + 한국어 음성. 소리는 사용자가 버튼을 누른 뒤에만 나므로 시작 버튼에서 unlock
window.ALARM = (() => {
  let ctx = null;
  const unlock = () => { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); ctx.resume(); } catch {} };
  function beep(times = 3) {
    try {
      for (let i = 0; i < times; i++) {
        const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * 0.35;
        o.frequency.value = 1046; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        o.start(t); o.stop(t + 0.3);
      }
    } catch {}
    try { navigator.vibrate?.([300, 150, 300, 150, 300]); } catch {}
  }
  // 목소리: 'ai' = Gemini 음성(하집사 AI 목소리와 같은 방식, 1~3초 걸림), 'device' = 기기 기본 음성(빠름)
  // AI 목소리는 순서대로 읽고(겹치지 않게), 같은 문장은 기억해 두었다가 바로 다시 쓴다. 안 되면 기기 음성으로
  const TTS_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', 'gemini-2.5-flash-preview-tts'];
  const cache = new Map();
  let queue = Promise.resolve(), current = null, gen = 0;   // gen: 멈추면 올라가서, 그 전에 줄 서 있던 소리는 버린다
  const pref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
  // ---------- 하집사 목소리 (2026-10-10): 태블릿 하집사 앱에 "이 문장 읽어줘" → 일레븐랩스·Fish Audio 목소리, 하집사가 저장해 두고 다시 씀 ----------
  const HJ = 'http://127.0.0.1:8790/api/say';
  let hjDownUntil = 0;   // 하집사가 꺼져 있으면 1분 동안은 묻지 않고 바로 Gemini 로
  async function hjAudio(text, provider) {
    if (Date.now() < hjDownUntil) throw new Error('하집사 꺼짐');
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 15000);
    try {
      const r = await fetch(HJ + '?app=roast&provider=' + provider + '&text=' + encodeURIComponent(text), { signal: ac.signal });
      if (r.status !== 200) throw new Error('하집사 ' + r.status);
      return await ctx.decodeAudioData(await r.arrayBuffer());
    } catch (e) { if (e.name !== 'AbortError') hjDownUntil = Date.now() + 60000; throw e; }
    finally { clearTimeout(t); }
  }
  // 하집사에 미리 녹음 (같은 문장은 하집사가 저장해서 두 번째부터 돈 안 씀)
  // 하집사에 미리 만들어 두기. 문장마다 어디서 왔는지 센다: saved 이미 있음 · peer 다른 기기에서 불러옴 · new 새로 만듦
  async function hjPrepare(texts, providers, onStep) {
    let ok = 0, n = 0, total = texts.length * providers.length; const cnt = { saved: 0, peer: 0, new: 0 };
    for (const p of providers) for (const t of texts) {
      n++; onStep?.(n, total, p, t, '');
      try {
        const r = await fetch(HJ + '?app=roast&provider=' + p + '&text=' + encodeURIComponent(t));
        if (r.status === 200) { await r.arrayBuffer(); ok++; const s = r.headers.get('X-Source') || 'new'; cnt[s] = (cnt[s] || 0) + 1; onStep?.(n, total, p, t, s); }
      } catch { return { ok, total, cnt, down: true }; }
    }
    return { ok, total, cnt };
  }
  // 리포트(긴 글, 80자 넘음)는 맨 위 📖 칩의 목소리로 따로 (짧은 안내는 설정의 목소리) — 2026-10-10
  const modeFor = text => String(text).length > 80 ? pref('reportVoice', 'hj-fish') : pref('voiceMode', 'hj-eleven');
  async function aiAudio(text, mode = pref('voiceMode', 'hj-eleven')) {
    if (mode.startsWith('hj-')) {
      const ck = mode + '|' + text;
      if (cache.has(ck)) return cache.get(ck);
      try { const b = await hjAudio(text, mode.slice(3)); if (text.length < 80) cache.set(ck, b); return b; } catch {}   // 안 되면 아래 Gemini 로
    }
    // 기억은 목소리별로 (목소리를 바꿔도 예전 목소리 소리가 나오던 문제)
    const voice = pref('aiVoice', 'Kore'), ck = voice + '|' + text;
    if (cache.has(ck)) return cache.get(ck);
    let key = ''; try { key = JSON.parse(localStorage.getItem('gemKey') || '""'); } catch {}
    if (!key) throw new Error('키 없음');
    for (const m of TTS_MODELS) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }),
        });
        if (!r.ok) continue;
        const d = (await r.json()).candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (!d?.data) continue;
        const raw = atob(d.data), bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        let buf;
        if (/wav/i.test(d.mimeType || '') || raw.startsWith('RIFF')) {
          // WAV 파일로 온다: 머리와 꼬리 정보까지 소리로 틀면 끝에 '콰악' 잡음이 나므로 브라우저가 해석하게 한다
          buf = await ctx.decodeAudioData(bytes.buffer);
        } else {
          // 날 PCM(24kHz 16비트)
          const n = bytes.length >> 1, dv = new DataView(bytes.buffer); buf = ctx.createBuffer(1, n, 24000);
          const ch = buf.getChannelData(0); for (let i = 0; i < n; i++) ch[i] = dv.getInt16(2 * i, true) / 32768;
        }
        if (text.length < 80) cache.set(ck, buf);
        return buf;
      } catch {}
    }
    throw new Error('AI 목소리 실패');
  }
  function play(buf) {
    return new Promise(res => { const s = ctx.createBufferSource(); s.buffer = buf; s.connect(ctx.destination); s.onended = res; current = s; s.start(); });
  }
  // 긴 글은 문장 하나씩 나눠 읽는다 (2026-10-10). 예전엔 120자씩 묶어서 섹션이 섞이고 조각이 매번 새것이라
  // 하집사 창고에서 한 번도 다시 못 썼다. 문장 하나 = 조각 하나면 '예상 맛.', '투입 210도.' 같은 말이 다음 레시피에서 다시 쓰인다.
  // '¶' 는 섹션 경계: 그 자리에서 잠깐(PAUSE) 쉰다. 다음 문장들은 읽는 동안 미리 만든다.
  // 실험 결과 (2026-10-10, Fish 조각 22개 분석): 조각마다 앞 0.1~0.2초, 뒤 0.15~0.55초 무음이 붙어 있고 소리 크기가 최대 6dB 달랐다.
  // 그냥 이어 틀면 문장 사이가 0.3~0.7초씩 떠서 끊겨 들린다 → 앞뒤 무음을 잘라 내고, 문장 사이 GAP·섹션 사이 PAUSE 만큼만 쉬고, 크기를 맞춘다
  const GAP = 180, PAUSE = 500, TARGET_RMS = 0.07;   // 0.07 ≈ -23dB
  function tidy(buf) {
    try {
      const ch = buf.getChannelData(0), sr = buf.sampleRate, W = Math.round(sr * 0.01), n = Math.floor(ch.length / W);
      const rms = new Float32Array(n);
      for (let k = 0; k < n; k++) { let e = 0; for (let i = k * W; i < (k + 1) * W; i++) e += ch[i] * ch[i]; rms[k] = Math.sqrt(e / W); }
      const on = v => v > 0.01;   // -40dB
      let a = 0, b = n - 1; while (a < n && !on(rms[a])) a++; while (b > a && !on(rms[b])) b--;
      if (a >= b) return buf;
      // 자른 자리에서 "지직" 소리가 나지 않게: 앞 40ms·뒤 60ms 여유를 두고, 양 끝을 20ms 동안 부드럽게 키우고 줄인다
      const s0 = Math.max(0, (a - 4) * W), s1 = Math.min(ch.length, (b + 1 + 6) * W), F = Math.round(sr * 0.02);
      let e = 0, c = 0, peak = 0; for (let k = a; k <= b; k++) if (on(rms[k])) { e += rms[k] * rms[k]; c++; }
      for (let i = s0; i < s1; i++) peak = Math.max(peak, Math.abs(ch[i]));
      const g = Math.min(2.5, TARGET_RMS / Math.sqrt(e / Math.max(1, c)), 0.98 / Math.max(1e-6, peak));
      const out = ctx.createBuffer(buf.numberOfChannels, s1 - s0, sr);
      for (let c2 = 0; c2 < buf.numberOfChannels; c2++) { const src = buf.getChannelData(c2), dst = out.getChannelData(c2); for (let i = 0; i < dst.length; i++) { const f = Math.min(1, i / F, (dst.length - 1 - i) / F); dst[i] = src[s0 + i] * g * f; } }
      return out;
    } catch { return buf; }
  }
  function chunks(text) {
    const out = [];
    String(text).split('¶').forEach(para => {
      const ss = para.split(/(?<=[.!?。])\s+/).map(s => s.trim()).filter(s => s && !/^[.!?。]+$/.test(s));
      if (out.length && ss.length) out.push('¶');
      out.push(...ss);
    });
    return out;
  }
  const flat = text => String(text).replace(/\s*¶\s*/g, ' ').trim();
  // 음성 끔(🔇)이면 말은 안 하고, ring()의 삑 소리·진동만 남는다
  const level = () => pref('voiceLevel', pref('mute', '0') === '1' ? 'off' : 'key');
  const muted = () => level() === 'off';
  function speak(text) {
    if (muted()) return;
    const mode = modeFor(flat(text));
    if (mode !== 'device') {
      unlock();
      const my = gen, parts = chunks(text);
      const make = i => parts[i] === '¶' ? Promise.resolve('¶') : aiAudio(parts[i], mode).catch(() => null);
      queue = queue.then(async () => {
        // 3개 앞까지 미리 만든다 (문장이 짧아져서 하나만 앞서 만들면 사이가 뜬다)
        const ahead = []; const pre = i => { if (i < parts.length && !ahead[i]) ahead[i] = make(i); };
        pre(0); pre(1); pre(2);
        for (let i = 0; i < parts.length && my === gen; i++) {
          const buf = await ahead[i]; pre(i + 3);
          if (my !== gen) return;
          if (buf === '¶') { await new Promise(r => setTimeout(r, PAUSE - GAP)); continue; }
          if (buf) { await play(parts.length > 1 ? tidy(buf) : buf); if (i < parts.length - 1) await new Promise(r => setTimeout(r, GAP)); } else deviceSpeak(parts[i]);
        }
      }).catch(() => { if (my === gen) deviceSpeak(flat(text)); });
      return;
    }
    deviceSpeak(flat(text));
  }
  function stopSpeaking() { gen++; try { current?.stop(); } catch {} queue = Promise.resolve(); try { speechSynthesis.cancel(); } catch {} }
  // 한국어 목소리를 골라서 읽는다. 태블릿 기본 엔진(삼성 TTS)에 한국어가 없으면 조용하므로 알려준다
  function deviceSpeak(text) {
    try {
      const ko = speechSynthesis.getVoices().find(v => /^ko/i.test(v.lang));
      if (!ko) {
        const c = $('coach'); c.style.display = 'block';
        c.textContent = '태블릿에 한국어 음성이 없어서 읽어줄 수 없어요. 설정 → 일반 → 텍스트 음성 변환 → 기본 엔진을 Google로 바꿔 주세요';
        return;
      }
      const u = new SpeechSynthesisUtterance(text); u.voice = ko; u.lang = ko.lang;
      if (speechSynthesis.speaking) speechSynthesis.cancel();
      setTimeout(() => speechSynthesis.speak(u), 60);   // 안드로이드 크롬은 cancel 직후 speak가 씹히는 경우가 있다
    } catch {}
  }
  try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices(); } catch {}
  // buzz=false면 로스터 부저는 빼고 태블릿 소리만 (1차 크랙 임박처럼 귀를 기울여야 할 때 부저가 방해돼서)
  const ring = (text, times = 3, buzz = true) => { beep(times); if (buzz) try { window.CONTROL?.buzz(Math.min(3, times)); } catch {} setTimeout(() => speak(text), times * 350 + 100); };
  return { unlock, ring, beep, speak, stopSpeaking, level, hjPrepare };
})();

window.AUTO = (() => {
  let paused = null, on = false, phase = 'off', mode = 'full', target = 0, burnerNow = null, lastSet = 0, adj = 0, lastAdjAt = 0,
    holdSince = 0, readyRung = false, fcWarned = false, wake = null, stepIdx = 0, holdBase = 40, coolTimer = null, preStart = 0, stallSince = 0, maillardSaid = false, damperSaid = false, lastReadyRing = 0, prepRung = false;
  const PREHEAT_MAX_MIN = 20;
  const say = t => { $('autoMsg').textContent = t; log('자동: ' + t); };

  // ✋ 사람이 손댄 것 (2026-10-10): 예전엔 사람이 버너 50%를 눌러도 AI가 3초 뒤 레시피 값(80%)으로 덮어썼다.
  // 이제 손으로 버너를 바꾸면(화면 수동 조작이든 로스터 본체 버튼이든) 1분 동안 AI가 버너를 안 건드린다. 또 바꾸면 다시 1분.
  // 손으로 배출구를 열면 배출로 보고 버너 끄기·쿨링·기록까지 한다 (예전엔 모르고 빈 드럼을 계속 데웠다).
  // 손댄 순간은 배치 기록(hands)에 남겨서 다음 레시피를 만들 때 참고한다
  const HAND_MS = 60000;
  // 🔁 연속 배치 (2026-10-10): 체크하면 배출 때 버너를 끄지 않고 30초 뒤(원두가 다 떨어진 뒤) 다음 예열을 이어간다.
  // 그 사이 레시피를 다른 생두로 바꾸면 예열 목표도 새 레시피 투입 온도로 바뀐다. 마지막 배치 땐 끄면 예전처럼 버너 0
  let contTimer = null;
  const contOn = () => { try { return localStorage.getItem('contBatch') === '1'; } catch { return false; } };
  { const c = $('contBatch'); if (c) { c.checked = contOn(); c.onchange = () => { try { localStorage.setItem('contBatch', c.checked ? '1' : '0'); } catch {} }; } }
  let aiBurner = null, aiSent = [], prevBurner = null, prevDrop = null, handUntil = 0, handBackSaid = true;
  window.HANDS = [];
  function handUi() {
    const b = $('handBack'), left = Math.ceil((handUntil - Date.now()) / 1000);
    if (b) b.hidden = !(on && left > 0);
    for (const id of ['takeBurner', 'takeAll']) if ($(id)) $(id).hidden = !on;
    if ($('takeBurner')) $('takeBurner').hidden = !on || handUntil === Infinity;
    if (on && left > 0 && $('manualMsg')) $('manualMsg').textContent = handUntil === Infinity
      ? '✋ 버너는 손으로 · AI는 1차 크랙·배출 타이밍과 안내만 맡아요'
      : `✋ 손 조작 중 · AI가 버너를 ${left}초 동안 안 건드려요`;
  }
  function hand(kind, v, src) {
    if (!on) return;
    const now = Date.now();
    HANDS.push({ t: samples.at(-1)?.t ?? 0, kind, v, src, phase });
    if (kind === 'burner') {
      burnerNow = v; aiBurner = v;
      if (handUntil === Infinity) { log(`✋ 손으로 버너 ${v}%`); return handUi(); }   // 이미 "버너는 이제 내가" 모드
      handUntil = now + HAND_MS; handBackSaid = false;
      log(`✋ 손으로 버너 ${v}% (${src === 'roaster' ? '로스터 본체' : '화면'}) → AI 버너 1분 쉼`);
      ALARM.speak(`손으로 버너 ${v}퍼센트. 1분 동안 AI가 버너를 안 건드려요`);
      handUi();
    } else if (kind === 'drop' && v === 1 && phase === 'roast' && chargeAt != null && !events['배출']) {
      log(`✋ 손으로 배출구 열림 (${src === 'roaster' ? '로스터 본체' : '화면'}) → 배출로 처리`);
      doDrop('손으로 배출구를 열었어요');
    }
  }
  function handBack() {
    if (!handUntil) return;
    handUntil = 0; handBackSaid = true; lastSet = 0; lastAdjAt = Date.now(); handUi(); if ($('manualMsg')) $('manualMsg').textContent = '🤖 AI가 다시 버너를 맡았어요';
    log('✋ AI가 다시 버너를 맡아요'); ALARM.speak('AI가 다시 버너를 맡아요');
  }
  $('handBack')?.addEventListener('click', handBack);
  // 자동 중 수동 전환 (2026-10-10, 사용자: 앞부분은 AI 에게 맡기고 뒷부분만 사람이 세세하게)
  // 1) 버너만 내가: 끝까지 AI가 버너를 안 건드린다. 1차 크랙 안내·자동 배출·쿨링은 AI가 계속
  // 2) 전부 내가: AI 자동을 끈다 (버너는 지금 값 그대로, 배출도 사람이). 그래프·기록·식힘 안내는 그대로
  $('takeBurner')?.addEventListener('click', () => {
    if (!on) return;
    handUntil = Infinity; handBackSaid = false; HANDS.push({ t: samples.at(-1)?.t ?? 0, kind: 'takeBurner', v: burnerNow, src: 'screen', phase });
    log('✋ 여기서부터 버너는 손으로 (AI는 배출 타이밍만)'); ALARM.speak('이제부터 버너는 직접 조절하세요. 배출 타이밍은 AI가 계속 봐요'); handUi();
  });
  $('takeAll')?.addEventListener('click', () => {
    if (!on) return;
    HANDS.push({ t: samples.at(-1)?.t ?? 0, kind: 'takeAll', v: burnerNow, src: 'screen', phase });
    cancel('수동으로 전환했어요. 버너는 지금 값 그대로예요. 배출도 직접 하세요');
    handUntil = 0; handUi(); $('manualMsg').textContent = '✋ 수동 로스팅 중 · 배출 버튼이나 배출구 열기를 직접 누르세요';
    ALARM.speak('수동으로 바꿨어요. 버너는 지금 그대로고, 배출도 직접 하세요');
  });

  async function setBurner(v, why) {
    v = Math.max(0, Math.min(100, Math.round(v / 5) * 5));
    if (v === burnerNow) return;
    burnerNow = v; aiBurner = v; lastSet = Date.now(); aiSent.push([v, lastSet]);
    await CONTROL.cmd('burner', v);
    say(`버너 ${v}% · ${why}`);
    if (phase === 'roast' && ALARM.level() === 'all') ALARM.speak(`버너 ${v}퍼센트${adj ? `, 레시피보다 ${Math.abs(adj)} ${adj > 0 ? '높게' : '낮게'}` : ''}`);   // level()만 쓰면 여기서는 없는 함수라 오류였음
  }

  async function begin(m, preheatTo, resuming = false) {
    if (!CONTROL.enabled) return say('먼저 "로스터 옆에 있어요"를 체크하세요');
    if (!chr || !CONTROL.last) return say('먼저 로스터를 연결하세요');
    if (!resuming && !$('autoAck').checked) return say('"끝날 때까지 옆에서 지켜볼게요"를 체크해야 시작돼요');
    paused = null; $('resumeBtn').style.display = 'none';
    ALARM.unlock();
    mode = m; target = preheatTo;
    on = true; adj = 0; handUntil = 0; handBackSaid = true; aiBurner = null; prevBurner = null; prevDrop = null; if (!resuming) window.HANDS = []; setTimeout(handUi); preTestState = 0; roastTestSaid = false; roastTestDone = false; holdSince = 0; preStart = 0; stallSince = 0; maillardSaid = false; damperSaid = false; readyRung = false; prepRung = false; fcWarned = false; stepIdx = 0; burnerNow = CONTROL.last.burner;
    phase = chargeAt == null ? 'preheat' : 'roast';
    $('autoBanner').style.display = 'block';
    $('autoBanner').textContent = (mode === 'full' ? 'AI 자동 로스팅 중' : `예열 중 (${target}°C)`) + ' · 로스터 옆을 떠나지 마세요 · 문제가 있으면 전체 정지';
    say(phase === 'preheat' ? `${mode === 'full' ? '자동 시작' : '예열만'}: ${target}°C까지 예열해요` : '자동 시작: 로스팅 진행 중이라 지금부터 따라가요');
    // 안내를 먼저 쓰고 나서 화면 켜두기 요청 (기다리는 사이 단계가 바뀌면 안내가 엉뚱해지지 않게)
    try { wake = await navigator.wakeLock?.request('screen'); } catch {}   // 화면이 꺼지면 안전장치가 버너를 끄므로 켜둔다
  }

  function start() {
    const r = lastRec;
    if (!r || !r.charge || !r.steps?.length) return say('먼저 AI 프로파일 추천을 받으세요');
    // 레시피를 만든 생두·투입량과 지금 칸이 다르면 먼저 확인
    const warn = [];
    const amt = +$('bAmt').value, rAmt = +(r.bean?.amt || 0), name = $('bName').value.trim(), rName = (r.bean?.name || '').trim();
    if (rAmt && amt && rAmt !== amt) warn.push(`이 레시피는 ${rAmt}g 기준인데 지금 투입량은 ${amt}g이에요. 양이 다르면 시간과 온도가 달라져요.`);
    if (rName && name && rName !== name) warn.push(`이 레시피는 "${rName}" 생두용인데 지금 생두는 "${name}"이에요.`);
    if (warn.length && !confirm(warn.join('\n') + '\n\n그래도 이 레시피로 시작할까요?')) return;
    if (window.autoSaveBean) autoSaveBean(true);   // 볶은 생두는 목록에 자동으로 남긴다 (취소하면 저장 안 함)
    begin('full', +r.charge);
  }
  function preheatOnly() {
    const t = +$('preheatTo').value;
    if (!(t >= 120 && t <= 240)) return say('예열 온도는 120~240 사이로 넣어주세요');
    begin('preheat', t);
  }

  function stopUi() {
    on = false; $('autoAck').checked = false; $('autoBanner').style.display = 'none'; handUi();
    try { wake?.release(); } catch {} wake = null;
  }

  // 자동을 먼저 끊고(다음 틱이 버너를 다시 올리지 않게) 그다음 버너 0
  async function preheatAbort(why) {
    if (!on) return;
    cancel(why + ' → 버너를 껐어요');
    tvView({ state: 'stopped', msg: why + ' → 버너를 껐어요' }, true);
    $('phase').textContent = '예열 멈춤';
    ALARM.ring('예열을 멈췄어요. ' + why, 4);
    await CONTROL.cmd('burner', 0);
    await CONTROL.cmd('burner', 0);
  }

  function cancel(reason) {
    if (contTimer) { clearTimeout(contTimer); contTimer = null; log('🔁 연속 배치 예약 취소'); }
    if (!on) return;
    // 실수로 홈으로 나간 경우: 돌아오면 이어갈 수 있게 기억해 둔다 (밖에 있는 동안은 버너 0 그대로)
    if (/화면 벗어남/.test(reason || '') && !events['배출']) paused = { mode, target, at: Date.now() };
    phase = 'off'; tvView({ state: 'off' }, true); stopUi(); say('자동 멈춤: ' + (reason || ''));
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !paused) return;
    if (Date.now() - paused.at > 10 * 60000) { paused = null; return; }
    $('resumeBtn').textContent = '화면을 벗어나서 버너를 껐어요 · 눌러서 자동 이어가기';
    $('resumeBtn').style.display = 'block';
    ALARM.ring('화면을 벗어나서 버너를 껐어요. 이어가려면 자동 이어가기를 누르세요', 2);
  });

  // 로스터가 정말 바꿨는지 확인하며 하나씩 보낸다 (2026-10-10: 배출구가 자동으로 안 열리고 안 닫힘.
  // 버너·배출구·쿨링을 쉬지 않고 연달아 보내면 블루투스가 앞 명령을 처리하는 중이라 뒤 명령이 빠질 수 있다)
  async function cmdSure(kind, v, tries = 4) {
    for (let i = 0; i < tries; i++) {
      await CONTROL.cmd(kind, v);
      for (let w = 0; w < 12; w++) { await new Promise(r => setTimeout(r, 250)); if (CONTROL.last && CONTROL.last[kind] === v) return true; }
      log(`${kind} ${v} 확인 안 됨 → 다시 보냄 (${i + 2}번째)`);
    }
    say(`${{ drop: '배출구', fan: '쿨링', burner: '버너' }[kind]}를 로스터가 안 받았어요. 직접 눌러 주세요`);
    return false;
  }
  const DOOR_CLOSE_SEC = 20;   // 배출 뒤 배출구 닫기까지 (원두는 보통 10~20초면 다 빠짐)
  let doorTimer = null;
  async function doDrop(why) {
    phase = 'done'; aiBurner = 0; handUntil = 0;
    if (testOn('roastTest')) { try { localStorage.setItem('roastTest', '0'); } catch {} const e = document.getElementById('roastTest'); if (e) e.checked = false; log('🧪 볶는 중 반응 시험 기록 완료 (다음 배치부터 꺼짐)'); }
    const cont = contOn() && mode === 'full';
    if (!cont) await cmdSure('burner', 0);
    await cmdSure('drop', 1);
    await cmdSure('fan', 1);
    // 원두만 빠지면 배출구를 바로 닫는다 (부자로스터 안내: 열어 두면 드럼 열에 베어링 쪽이 상함). 쿨링은 따로 계속
    // 예전엔 4분 쿨링이 끝날 때 같이 닫아서, 5번째 배치 때 사용자가 손으로 닫았다
    clearTimeout(doorTimer);
    doorTimer = setTimeout(async () => {
      if (!CONTROL.enabled || !chr || CONTROL.last?.drop === 0) return;
      if (!await cmdSure('drop', 0)) { ALARM.ring('배출구가 안 닫혔어요. 직접 닫아 주세요', 2, false); return; }
      log('배출 20초: 원두가 다 빠져서 배출구를 닫았어요 (쿨링은 계속)');
      say('원두가 다 빠져서 배출구를 닫았어요. 쿨링은 계속 돌아요');
    }, DOOR_CLOSE_SEC * 1000);
    if (!events['배출']) mark('배출');
    stopUi();
    $('nextBatch').hidden = false;
    if (cont) {
      log('🔁 연속 배치: 버너 그대로, 30초 뒤 다음 예열');
      setTimeout(() => ALARM.speak('연속 배치예요. 30초 뒤 다음 예열을 이어가요. 그만하려면 전체 정지를 누르세요'), 2500);
      contTimer = setTimeout(() => {
        contTimer = null;
        if (!CONTROL.enabled || !chr || on || !lastRec?.charge) return;
        if (!newBatch()) return;
        $('autoAck').checked = true;
        begin('full', +lastRec.charge);
      }, 30000);
    }
    ALARM.ring('배출했어요', 3, false);   // 로스터 부저는 예열 완료 때 한 번만 (사용자 요청)
    const coolMin = +($('coolMin')?.value || 0);
    say(`자동 배출 (${why}). 쿨링 켰어요. 배출구는 ${DOOR_CLOSE_SEC}초 뒤 닫아요.` + (coolMin ? ` 쿨링은 ${coolMin}분 뒤 꺼요` : ' 원두가 식으면 쿨링을 끄세요'));
    clearTimeout(coolTimer);
    if (coolMin) coolTimer = setTimeout(async () => {
      if (!CONTROL.enabled || !chr) return;
      await cmdSure('fan', 0); await cmdSure('drop', 0);
      ALARM.ring('쿨링 끝났어요', 2, false);
      say('쿨링 끄고 배출구 닫았어요. 로스팅 끝!');
    }, coolMin * 60000);
  }

  // 배출 뒤 식히기: BT·ET가 모두 80도 아래로 내려가면 "기계 꺼도 돼요" (부자로스터 대표 권장: 80도 이하에서 끄기)
  const COOL_OFF = 80;
  let coolHist = [], coolHistAt = null, coolStart = 0;
  // 🧪 반응 시험 (2026-10-10): 4배치 곡선은 버너가 늘 온도 따라 같은 모양으로 내려가서 버너 효과를 따로 못 쟀다.
  // 일부러 버너를 잠깐 바꾼 기록이 필요하다. 예열 땐 내리기만(안전), 볶는 중엔 건조 구간 30초만 +10%
  const testOn = k => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
  let preTestState = 0, preTestUntil = 0, roastTestSaid = false, roastTestDone = false;
  const TEST_START = 90, TEST_END = 150, TEST_UP = 20;
  // ☕ 장면 손으로 켜고 끄기: 이 기기 하집사 → TV 하집사
  const sceneCall = act => { const m = $('sceneMsg'); if (m) m.textContent = '보내는 중...';
    let music = true; try { music = localStorage.getItem('roastSceneMusic') !== '0'; } catch {}
    fetch('http://127.0.0.1:8790/api/roastscene?act=' + act + '&music=' + (music ? 1 : 0)).then(r => r.text())
      .then(t => { if (m) m.textContent = t === 'ok' ? (act === 'on' ? '켰어요. 주방벽등을 보세요' : '원래대로 돌렸어요') : t; })
      .catch(() => { if (m) m.textContent = '이 기기 하집사에 못 닿았어요. 하집사가 켜져 있는지 봐 주세요'; }); };
  $('sceneOn')?.addEventListener('click', () => sceneCall('on'));
  $('sceneOff')?.addEventListener('click', () => sceneCall('off'));
  for (const k of ['roastScene', 'roastSceneMusic']) { const el = document.getElementById(k); if (el) { try { el.checked = localStorage.getItem(k) !== '0'; } catch {} el.onchange = () => { try { localStorage.setItem(k, el.checked ? '1' : '0'); } catch {} }; } }
  for (const k of ['preTest', 'roastTest']) { const el = document.getElementById(k); if (el) { el.checked = testOn(k); el.onchange = () => { try { localStorage.setItem(k, el.checked ? '1' : '0'); } catch {} }; } }
  let coolSaid = false, coolDropAt = null;
  function cooldown(st) {
    const d = events['배출'];
    if (!d) { coolSaid = false; coolDropAt = null; return; }
    if (coolDropAt !== d.t) { coolDropAt = d.t; coolSaid = false; }
    const hot = Math.max(st.bt, st.et);
    if (!coolSaid) $('phase').textContent = `식는 중 · ${hot}° → ${COOL_OFF}° 아래면 기계 꺼도 돼요`;
    // TV 에 식는 온도·남은 시간 (보기 전용). 최근 1분 동안 내려간 속도로 80도까지 남은 시간을 어림한다
    if (!coolSaid) {
      const now = Date.now(); if (!coolHist.length || coolDropAt !== coolHistAt) { coolHist = []; coolHistAt = coolDropAt; coolStart = hot; }
      coolHist.push([now, hot]); while (coolHist.length > 2 && now - coolHist[0][0] > 60000) coolHist.shift();
      const [t0, h0] = coolHist[0], rate = now - t0 > 15000 ? (h0 - hot) / ((now - t0) / 60000) : 0;
      tvView({ state: 'cool', bt: hot, target: COOL_OFF, start: coolStart, sec: (samples.at(-1)?.t ?? d.t) - d.t, eta: rate > 0.5 ? (hot - COOL_OFF) / rate : 0 });
    }
    if (!coolSaid && hot < COOL_OFF) {
      coolSaid = true;
      tvView({ state: 'cooldone', bt: hot, target: COOL_OFF }, true);   // TV 도 '이제 꺼도 돼요' 하고 알린다
      $('phase').textContent = `${hot}° · 이제 기계를 꺼도 돼요`;
      ALARM.ring(`${COOL_OFF}도 아래로 내려왔어요. 이제 기계를 꺼도 돼요. 채프통도 확인해 주세요`, 3, false);
    }
  }

  // TV(스트리머)에 예열 상태 보여 주기 (2026-10-10): 같은 기기 하집사에 상태만 보낸다. 보기 전용, TV 에서 로스터를 움직일 길은 없다
  let tvLast = 0;
  function tvView(v, now) {
    if (window.DEMO?.on) return;   // 시연(가짜 로스팅) 중엔 TV·위젯에 안 보낸다 (2026-10-10, TV 가 가짜 예열을 말함)
    if (!now && Date.now() - tvLast < 4000) return; tvLast = Date.now();
    // ☕ 로스팅 장면 (TV 하집사가 주방벽등·음악): 설정 체크를 같이 보낸다
    const flag = k => { try { return localStorage.getItem(k) !== '0'; } catch { return true; } };
    v = { ...v, scene: flag('roastScene'), music: flag('roastSceneMusic') };
    fetch('http://127.0.0.1:8790/api/roastview?d=' + encodeURIComponent(JSON.stringify(v))).catch(() => {});
  }
  window.TVVIEW = tvView;
  function tick(st) {
    cooldown(st);
    if (phase === 'roast' && Date.now() - tvLast > 15000) tvView({ state: 'roast' });
    if (!on) return;
    // ✋ AI가 보낸 값이 아닌데 버너·배출구가 바뀌었으면 사람이 손댄 것 (명령이 안 먹힌 건 값이 안 바뀌니 여기 안 걸린다)
    aiSent = aiSent.filter(a => Date.now() - a[1] < 15000);   // 로스터가 늦게 반영한 AI 의 앞 명령은 사람 것으로 보지 않는다
    if (prevBurner != null && st.burner !== prevBurner && st.burner !== aiBurner && !aiSent.some(a => a[0] === st.burner)) hand('burner', st.burner, 'roaster');
    if (prevDrop != null && st.drop === 1 && prevDrop !== 1 && phase === 'roast') hand('drop', 1, 'roaster');
    prevBurner = st.burner; prevDrop = st.drop;
    if (!on) return;   // 배출로 처리됐으면 여기서 끝
    const handOn = Date.now() < handUntil;
    if (!handOn && !handBackSaid) handBack();
    else if (handOn) handUi();
    burnerNow = st.burner;
    const r = lastRec, now = Date.now();

    if (phase === 'preheat') {
      if (mode === 'full' && lastRec?.charge && +lastRec.charge !== target) {
        log(`🔁 레시피가 바뀌어서 예열 목표 ${target}° → ${+lastRec.charge}°`); ALARM.speak(`레시피가 바뀌어서 예열 목표를 ${+lastRec.charge}도로 바꿔요`);
        target = +lastRec.charge; holdSince = 0; readyRung = false; prepRung = false; lastSet = 0;
      }
      if (chargeAt != null) {
        if (mode === 'preheat') { cancel('투입 감지. 예열만 모드라 여기서부터는 손으로 조절하세요'); return; }
        phase = 'roast'; tvView({ state: 'roast' }, true); setBurner(r.startBurner ?? 100, '투입 감지: 시작 버너'); return;
      }
      // 목표 온도까지 데우고 유지: 멀면 100%, 가까워지면 PI 제어(유지에 필요한 버너를 천천히 배움)
      const gap = target - st.bt;
      if (!preStart) preStart = now;
      const preSec = (now - preStart) / 1000, rr = ror('bt');

      // 예열 안전장치 (예전 로스터에서 목표에 못 닿아 계속 과열된 일이 있어서)
      // 1) 20분 넘게 예열  2) 버너를 세게 넣는데 3분째 1분에 1도도 안 오름  3) 준비 완료 뒤 15분 동안 투입 없음
      if (!holdSince && !readyRung && preSec > PREHEAT_MAX_MIN * 60) return preheatAbort(`예열이 ${PREHEAT_MAX_MIN}분을 넘었어요 (BT ${st.bt}°, 목표 ${target}°)`);
      if (st.burner >= 70 && gap > 5 && rr != null && rr < 1) { if (!stallSince) stallSince = now; } else stallSince = 0;
      if (stallSince && now - stallSince > 180000) return preheatAbort(`버너를 세게 넣는데 3분째 온도가 안 올라요 (BT ${st.bt}°). 히터나 센서를 확인하세요`);
      if (holdSince && now - holdSince > 15 * 60000) return preheatAbort('준비 완료 뒤 15분 동안 투입이 없어서 예열을 껐어요');

      // 🧪 예열 반응 시험: 버너를 40%로 40초 내렸다가 원래대로 (내리는 쪽이라 안전, 예열이 1분쯤 길어진다)
      if (!handOn && testOn('preTest') && preTestState === 0 && st.bt >= 140 && st.bt <= 170 && gap > 25) {
        preTestState = 1; preTestUntil = now + 40000;
        log('🧪 예열 반응 시험 시작: 버너 40% · 40초'); ALARM.ring('예열 반응 시험이에요. 40초 동안 버너를 낮춰요', 1, false);
        setBurner(40, '🧪 예열 반응 시험');
      }
      if (preTestState === 1) {
        if (now < preTestUntil) { $('phase').textContent = `🧪 예열 반응 시험 중 · BT ${st.bt}° · ${Math.ceil((preTestUntil - now) / 1000)}초 남음`; tvView({ state: 'preheat', bt: st.bt, target, gap, eta: 0, sec: preSec, soon: false, ready: false }); return; }
        preTestState = 2; lastSet = 0; log('🧪 예열 반응 시험 끝'); say('🧪 반응 시험 끝, 예열을 계속해요');
      }

      // 예열 진행 표시: 경과 시간 · 남은 온도 · 예상 시간
      const eta = gap > 3 && rr > 1 ? ` · 약 ${Math.ceil(gap / rr)}분 예상` : '';
      const prog = `예열 ${Math.floor(preSec / 60)}:${String(Math.floor(preSec % 60)).padStart(2, '0')} · BT ${st.bt}° → 목표 ${target}°` + (gap > 3 ? ` · ${Math.round(gap)}° 남음${eta}` : ' · 도착');
      $('phase').textContent = prog;
      // soon: 끝나기 약 5분 전(또는 35도 남음, 끝 무렵엔 천천히 올라서 예상 시간이 짧게 나온다) — 이때 TV가 '지금 로스터로 가세요' 하고 알린다 (다 끝나고 알리면 늦다, 사용자 2026-10-10)
      const etaMin = gap > 3 && rr > 1 ? gap / rr : 0;
      tvView({ state: 'preheat', bt: st.bt, target, gap, eta: etaMin, sec: preSec, soon: gap <= 35 || (etaMin > 0 && etaMin <= 5), ready: !!readyRung, maxMin: PREHEAT_MAX_MIN });
      if (!holdSince || now - holdSince <= 30000) $('autoMsg').textContent = prog + ` (최대 ${PREHEAT_MAX_MIN}분)`;
      if (!handOn && now - lastSet > 5000) {
        if (gap > 25) { holdBase = 40; setBurner(100, `예열 BT ${st.bt}° → 목표 ${target}°`); }
        else {
          holdBase = Math.max(0, Math.min(85, holdBase + gap * 0.3));
          setBurner(holdBase + gap * 2.5, `예열 유지 BT ${st.bt}° → 목표 ${target}°`);
          lastSet = now;   // 같은 값이어도 5초마다 다시 계산
        }
      }
      if (Math.abs(gap) <= 3) {
        if (!holdSince) holdSince = now;
        // 두 단계 알림 (3번째 배치: 닿자마자 "넣으세요"가 나와 온도가 자리 잡기 전에 투입함)
        // 1) 목표에 닿으면 "준비하세요"(태블릿만)  2) 20초 동안 ±3도로 자리 잡으면 "넣으세요"(태블릿 + 로스터 부저)
        {
          if (!prepRung) { prepRung = true; ALARM.ring('곧 투입 온도예요. 생두를 준비하세요', 2, false); }
          if (now - holdSince < 20000) {
            $('autoMsg').textContent = `곧 투입 온도예요 (BT ${st.bt}°). 생두를 준비하세요. 온도가 자리 잡으면 다시 알려요`;
          } else {
            $('autoMsg').textContent = `투입하세요 (BT ${st.bt}°). 레버로 생두를 넣으세요. 투입은 자동으로 알아채요`;
            if (!readyRung) { readyRung = true; lastReadyRing = now; ALARM.ring('이제 생두를 넣으세요', 3); }
            // 기다리는 동안 2분 30초마다 다시 알림 (태블릿만, 15분이 지나면 위 안전장치가 예열을 끈다)
            else if (now - lastReadyRing > 150000) {
              lastReadyRing = now;
              const left = Math.max(1, Math.round(15 - (now - holdSince) / 60000));
              ALARM.ring(`투입 준비돼 있어요. ${left}분 안에 넣지 않으면 예열을 꺼요`, 2, false);
            }
          }
        }
      } else holdSince = 0;
      return;
    }

    if (phase !== 'roast') return;
    if (events['배출']) { phase = 'done'; stopUi(); return; }   // 배출 뒤엔 cooldown() 이 TV 에 식는 온도를 보낸다
    const s = samples.at(-1), el = s.t - chargeAt, fc = events['1차 크랙'];

    // 계획 버너: 부자 프로파일 모드처럼 BT가 단계 온도를 넘으면 그 %로.
    // 한 번 넘은 단계는 유지한다 (온도가 1도 오르내릴 때 버너가 왔다갔다하지 않게)
    // 투입 직후엔 BT가 아직 높게 읽히므로 TP(또는 투입 90초) 뒤부터 단계를 본다
    const steps = r.steps || [];
    if (events.TP || el > 90) while (stepIdx < steps.length && st.bt >= steps[stepIdx].bt) stepIdx++;
    const planned = stepIdx ? steps[stepIdx - 1].burner : (r.startBurner ?? 100);

    // AI 보정: TP 뒤~1차 크랙 전, 목표 곡선보다 5도 넘게 늦거나 빠르면 30초마다 10%씩.
    // 첫 실전(2026-10-08)에서 -20%가 끝까지 가서 크랙 뒤 힘이 모자랐으므로 BT 175도 이후엔 -10%까지만 줄인다
    const minAdj = st.bt >= 175 ? -10 : -20;
    // 반응 시험 중과 그 뒤 1분은 보정을 멈춘다 (보정이 같이 움직이면 버너 효과를 따로 못 잰다)
    const testWindow = testOn('roastTest') && !fc && el < TEST_END + 60;
    if (!fc && !testWindow && window.TARGET && el > 90 && now - lastAdjAt > 30000) {
      const tgt = TARGET.reduce((a, b) => Math.abs(b.t - el) < Math.abs(a.t - el) ? b : a).bt;
      const diff = st.bt - tgt;
      if (diff < -5 && adj < 20) { adj += 10; lastAdjAt = now; log(`자동 보정 +10% (목표보다 ${Math.round(-diff)}도 늦음)`); }
      else if (diff > 5 && adj > minAdj) { adj -= 10; lastAdjAt = now; log(`자동 보정 -10% (목표보다 ${Math.round(diff)}도 빠름)`); }
    }
    adj = Math.max(adj, minAdj);
    if (fc) adj = Math.min(adj, 0);   // 1차 크랙 뒤에는 올리지 않는다 (플릭 방지)
    // 🧪 볶는 중 반응 시험: 투입 1:30~2:30 (건조 구간) 계획보다 +20% (다음 1배치만, 배출하면 저절로 꺼짐)
    // 5번째 배치의 +10%·30초는 배치마다 생기는 차이(분당 2~3도)에 묻혀서, 크게·길게 다시 잰다
    const roastTest = testOn('roastTest') && !fc && el >= TEST_START && el < TEST_END;
    if (roastTest && !roastTestSaid) { roastTestSaid = true; log(`🧪 볶는 중 반응 시험: ${TEST_END - TEST_START}초 동안 버너 +${TEST_UP}%`); ALARM.ring(`볶는 중 반응 시험이에요. 1분 동안 버너를 ${TEST_UP} 올려요`, 1, false); }
    if (roastTest) $('phase').textContent = `🧪 볶는 중 반응 시험 · 버너 +${TEST_UP}% · ${Math.ceil(TEST_END - el)}초 남음`;
    if (testOn('roastTest') && roastTestSaid && !roastTest && el >= TEST_END && !roastTestDone) { roastTestDone = true; log('🧪 볶는 중 반응 시험 끝'); say('🧪 반응 시험 끝, 레시피대로 이어가요'); }
    const v = Math.max(0, Math.min(100, planned + adj + (roastTest ? TEST_UP : 0)));
    if (!handOn && v !== burnerNow && now - lastSet > 3000) setBurner(v, `BT ${st.bt}° 계획 ${planned}%${adj ? ` 보정 ${adj > 0 ? '+' : ''}${adj}` : ''}`);

    // 구간 표시와 마이야르 시작 안내 (생두가 노래지는 BT 약 150~160도)
    const yellowT = 155;
    if (!fc && !maillardSaid && (events.TP || el > 90) && st.bt >= yellowT) {
      maillardSaid = true;
      const dc = r.damperChange;
      const damperMsg = dc && dc.notch && (!dc.atBt || dc.atBt <= yellowT + 5) ? ` 댐퍼를 ${dc.notch}칸으로 돌리고 화면의 ${dc.notch}을 눌러 주세요.` : '';
      ALARM.ring('지금부터 마이야르 구간이에요.' + damperMsg, 2, false);
    }
    if (r.damperChange?.atBt && r.damperChange.atBt > yellowT + 5 && !damperSaid && st.bt >= r.damperChange.atBt && !fc) {
      damperSaid = true; ALARM.ring(`댐퍼를 ${r.damperChange.notch}칸으로 돌려 주세요`, 2, false);
    }
    // 1차 크랙이 곧 올 때 알림 (귀 기울이세요)
    const fcT = r.expected?.fcTemp || 186;
    if (!fc && !fcWarned && (events.TP || el > 120) && st.bt >= fcT - 6) { fcWarned = true; ALARM.ring('곧 1차 크랙이에요. 첫 크랙 들리면 버튼을 누르세요', 2, false); }

    // 자동 배출: 1차 크랙 온도 + 목표 상승폭에 닿으면 (일찍 닿아도 끌지 않음), DT가 지나면.
    // 상승폭이 4도 이내로 모자라고 RoR이 살아 있으면 DT+15초까지 기다린다 (첫 실전: +5도에서 끊김)
    const rise = r.rise ?? 8, dt = r.dtSec ?? 60;
    if (fc) {
      const dev = s.t - fc.t, goal = fc.bt + rise, rr = ror('bt') ?? 0, short = goal - st.bt;
      if (dev >= 30 && st.bt >= goal) return doDrop(`1차 크랙 뒤 ${Math.round(dev)}초, +${st.bt - fc.bt}도`);
      const wait = short <= 4 && rr > 2 && dev < dt + 15;
      if (dev >= dt && !wait) return doDrop(`DT ${Math.round(dev)}초 (+${st.bt - fc.bt}도, 목표 +${rise}도)`);
    } else if (r.drop && st.bt >= r.drop + 3) return doDrop('1차 크랙 표시 없이 배출 온도를 넘음');
    // 너무 오래 걸리면(18분) 자동을 멈추고 버너를 끈다. 배출은 사람이 판단
    if (el > 18 * 60 && !fc) { CONTROL.cmd('burner', 0); ALARM.ring('18분이 지났어요. 버너를 껐어요'); cancel('18분이 지나도 1차 크랙이 없어요. 버너 껐어요. 원두 상태 보고 직접 배출하세요'); }
  }

  $('autoStart').addEventListener('click', start);
  // 다음 배치: 비우고 같은 레시피로 자동 시작 (버튼을 누른 것 자체를 "지켜볼게요" 확인으로 본다)
  $('nextBatch').addEventListener('click', () => {
    if (!CONTROL.enabled) { $('nextBatch').hidden = true; return say('"로스터 옆에 있어요"를 체크한 뒤 다시 시작하세요'); }
    if (!newBatch()) return;
    ALARM.speak('다음 배치를 시작해요. 채프통이 차 있지 않은지 확인해 주세요');
    $('autoAck').checked = true; start();
  });
  $('preheatStart').addEventListener('click', preheatOnly);
  $('resumeBtn').addEventListener('click', () => { if (paused) { $('autoAck').checked = true; begin(paused.mode, paused.target, true); } });
  // 블루투스가 다시 연결됐을 때: 멈춘 자동을 이어갈 수 있게 버튼을 띄운다
  function offerResume() {
    if (!paused || Date.now() - paused.at > 10 * 60000) return;
    $('resumeBtn').textContent = '로스터가 다시 연결됐어요 · 눌러서 자동 이어가기';
    $('resumeBtn').style.display = 'block';
    ALARM.ring('로스터가 다시 연결됐어요. 이어가려면 자동 이어가기를 누르세요', 2, false);
  }
  // 다음 단계에서 실제로 보낼 버너 값 (레시피 값 + 지금 보정). 음성 안내가 실제 값과 같게
  const plannedBurner = (stepBurner, bt) => { const min = bt >= 175 ? -10 : -20; return Math.max(0, Math.min(100, stepBurner + Math.max(adj, min))); };
  return { tick, cancel, offerResume, plannedBurner, hand, get adj() { return adj; }, get on() { return on; } };
})();

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
  async function hjPrepare(texts, providers, onStep) {
    let ok = 0, n = 0, total = texts.length * providers.length;
    for (const p of providers) for (const t of texts) {
      n++; onStep?.(n, total, p, t);
      try { const r = await fetch(HJ + '?app=roast&provider=' + p + '&text=' + encodeURIComponent(t)); if (r.status === 200) { await r.arrayBuffer(); ok++; } } catch { return { ok, total, down: true }; }
    }
    return { ok, total };
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
  // 긴 글은 문장 단위(약 120자)로 나눠서, 첫 문장을 바로 읽는 동안 다음 문장을 미리 만든다
  function chunks(text) {
    const out = []; let cur = '';
    for (const s of String(text).split(/(?<=[.!?。])\s+/)) {
      if (cur && (cur + ' ' + s).length > 120) { out.push(cur); cur = s; } else cur = cur ? cur + ' ' + s : s;
    }
    if (cur) out.push(cur);
    return out;
  }
  // 음성 끔(🔇)이면 말은 안 하고, ring()의 삑 소리·진동만 남는다
  const level = () => pref('voiceLevel', pref('mute', '0') === '1' ? 'off' : 'key');
  const muted = () => level() === 'off';
  function speak(text) {
    if (muted()) return;
    const mode = modeFor(text);
    if (mode !== 'device') {
      unlock();
      const my = gen, parts = chunks(text);
      queue = queue.then(async () => {
        let next = my === gen ? aiAudio(parts[0], mode) : null;
        for (let i = 0; i < parts.length && my === gen; i++) {
          const buf = await next;
          next = i + 1 < parts.length ? aiAudio(parts[i + 1], mode).catch(() => null) : null;   // 미리 만들기
          if (my !== gen) return;
          if (buf) await play(buf); else deviceSpeak(parts[i]);
        }
      }).catch(() => { if (my === gen) deviceSpeak(text); });
      return;
    }
    deviceSpeak(text);
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

  async function setBurner(v, why) {
    v = Math.max(0, Math.min(100, Math.round(v / 5) * 5));
    if (v === burnerNow) return;
    burnerNow = v; lastSet = Date.now();
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
    on = true; adj = 0; holdSince = 0; preStart = 0; stallSince = 0; maillardSaid = false; damperSaid = false; readyRung = false; prepRung = false; fcWarned = false; stepIdx = 0; burnerNow = CONTROL.last.burner;
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
    on = false; $('autoAck').checked = false; $('autoBanner').style.display = 'none';
    try { wake?.release(); } catch {} wake = null;
  }

  // 자동을 먼저 끊고(다음 틱이 버너를 다시 올리지 않게) 그다음 버너 0
  async function preheatAbort(why) {
    if (!on) return;
    cancel(why + ' → 버너를 껐어요');
    $('phase').textContent = '예열 멈춤';
    ALARM.ring('예열을 멈췄어요. ' + why, 4);
    await CONTROL.cmd('burner', 0);
    await CONTROL.cmd('burner', 0);
  }

  function cancel(reason) {
    if (!on) return;
    // 실수로 홈으로 나간 경우: 돌아오면 이어갈 수 있게 기억해 둔다 (밖에 있는 동안은 버너 0 그대로)
    if (/화면 벗어남/.test(reason || '') && !events['배출']) paused = { mode, target, at: Date.now() };
    phase = 'off'; stopUi(); say('자동 멈춤: ' + (reason || ''));
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !paused) return;
    if (Date.now() - paused.at > 10 * 60000) { paused = null; return; }
    $('resumeBtn').textContent = '화면을 벗어나서 버너를 껐어요 · 눌러서 자동 이어가기';
    $('resumeBtn').style.display = 'block';
    ALARM.ring('화면을 벗어나서 버너를 껐어요. 이어가려면 자동 이어가기를 누르세요', 2);
  });

  async function doDrop(why) {
    phase = 'done';
    await CONTROL.cmd('burner', 0);
    await CONTROL.cmd('drop', 1);
    await CONTROL.cmd('fan', 1);
    if (!events['배출']) mark('배출');
    stopUi();
    $('nextBatch').hidden = false;
    ALARM.ring('배출했어요', 3, false);   // 로스터 부저는 예열 완료 때 한 번만 (사용자 요청)
    const coolMin = +($('coolMin')?.value || 0);
    say(`자동 배출 (${why}). 쿨링 켰어요.` + (coolMin ? ` ${coolMin}분 뒤 쿨링을 끄고 배출구를 닫아요` : ' 원두가 식으면 쿨링 끄고 배출구 닫으세요'));
    clearTimeout(coolTimer);
    if (coolMin) coolTimer = setTimeout(async () => {
      if (!CONTROL.enabled || !chr) return;
      await CONTROL.cmd('fan', 0); await CONTROL.cmd('drop', 0);
      ALARM.ring('쿨링 끝났어요', 2, false);
      say('쿨링 끄고 배출구 닫았어요. 로스팅 끝!');
    }, coolMin * 60000);
  }

  // 배출 뒤 식히기: BT·ET가 모두 80도 아래로 내려가면 "기계 꺼도 돼요" (부자로스터 대표 권장: 80도 이하에서 끄기)
  const COOL_OFF = 80;
  let coolSaid = false, coolDropAt = null;
  function cooldown(st) {
    const d = events['배출'];
    if (!d) { coolSaid = false; coolDropAt = null; return; }
    if (coolDropAt !== d.t) { coolDropAt = d.t; coolSaid = false; }
    const hot = Math.max(st.bt, st.et);
    if (!coolSaid) $('phase').textContent = `식는 중 · ${hot}° → ${COOL_OFF}° 아래면 기계 꺼도 돼요`;
    if (!coolSaid && hot < COOL_OFF) {
      coolSaid = true;
      $('phase').textContent = `${hot}° · 이제 기계를 꺼도 돼요`;
      ALARM.ring(`${COOL_OFF}도 아래로 내려왔어요. 이제 기계를 꺼도 돼요. 채프통도 확인해 주세요`, 3, false);
    }
  }

  function tick(st) {
    cooldown(st);
    if (!on) return;
    burnerNow = st.burner;
    const r = lastRec, now = Date.now();

    if (phase === 'preheat') {
      if (chargeAt != null) {
        if (mode === 'preheat') { cancel('투입 감지. 예열만 모드라 여기서부터는 손으로 조절하세요'); return; }
        phase = 'roast'; setBurner(r.startBurner ?? 100, '투입 감지: 시작 버너'); return;
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

      // 예열 진행 표시: 경과 시간 · 남은 온도 · 예상 시간
      const eta = gap > 3 && rr > 1 ? ` · 약 ${Math.ceil(gap / rr)}분 예상` : '';
      const prog = `예열 ${Math.floor(preSec / 60)}:${String(Math.floor(preSec % 60)).padStart(2, '0')} · BT ${st.bt}° → 목표 ${target}°` + (gap > 3 ? ` · ${Math.round(gap)}° 남음${eta}` : ' · 도착');
      $('phase').textContent = prog;
      if (!holdSince || now - holdSince <= 30000) $('autoMsg').textContent = prog + ` (최대 ${PREHEAT_MAX_MIN}분)`;
      if (now - lastSet > 5000) {
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
    if (events['배출']) { phase = 'done'; stopUi(); return; }
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
    if (!fc && window.TARGET && el > 90 && now - lastAdjAt > 30000) {
      const tgt = TARGET.reduce((a, b) => Math.abs(b.t - el) < Math.abs(a.t - el) ? b : a).bt;
      const diff = st.bt - tgt;
      if (diff < -5 && adj < 20) { adj += 10; lastAdjAt = now; log(`자동 보정 +10% (목표보다 ${Math.round(-diff)}도 늦음)`); }
      else if (diff > 5 && adj > minAdj) { adj -= 10; lastAdjAt = now; log(`자동 보정 -10% (목표보다 ${Math.round(diff)}도 빠름)`); }
    }
    adj = Math.max(adj, minAdj);
    if (fc) adj = Math.min(adj, 0);   // 1차 크랙 뒤에는 올리지 않는다 (플릭 방지)
    const v = Math.max(0, Math.min(100, planned + adj));
    if (v !== burnerNow && now - lastSet > 3000) setBurner(v, `BT ${st.bt}° 계획 ${planned}%${adj ? ` 보정 ${adj > 0 ? '+' : ''}${adj}` : ''}`);

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
  return { tick, cancel, offerResume, plannedBurner, get adj() { return adj; }, get on() { return on; } };
})();

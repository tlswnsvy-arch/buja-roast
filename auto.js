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
  function speak(text) { try { const u = new SpeechSynthesisUtterance(text); u.lang = 'ko-KR'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch {} }
  const ring = (text, times = 3) => { beep(times); setTimeout(() => speak(text), times * 350 + 100); };
  return { unlock, ring, beep, speak };
})();

window.AUTO = (() => {
  let paused = null, on = false, phase = 'off', mode = 'full', target = 0, burnerNow = null, lastSet = 0, adj = 0, lastAdjAt = 0,
    holdSince = 0, readyRung = false, fcWarned = false, wake = null, stepIdx = 0, holdBase = 40, coolTimer = null;
  const say = t => { $('autoMsg').textContent = t; log('자동: ' + t); };

  async function setBurner(v, why) {
    v = Math.max(0, Math.min(100, Math.round(v / 5) * 5));
    if (v === burnerNow) return;
    burnerNow = v; lastSet = Date.now();
    await CONTROL.cmd('burner', v);
    say(`버너 ${v}% · ${why}`);
    if ($('voiceOn')?.checked && phase === 'roast') ALARM.speak(`버너 ${v}퍼센트`);
  }

  async function begin(m, preheatTo, resuming = false) {
    if (!CONTROL.enabled) return say('먼저 "로스터 옆에 있어요"를 체크하세요');
    if (!chr || !CONTROL.last) return say('먼저 로스터를 연결하세요');
    if (!resuming && !$('autoAck').checked) return say('"끝날 때까지 옆에서 지켜볼게요"를 체크해야 시작돼요');
    paused = null; $('resumeBtn').style.display = 'none';
    ALARM.unlock();
    mode = m; target = preheatTo;
    on = true; adj = 0; holdSince = 0; readyRung = false; fcWarned = false; stepIdx = 0; burnerNow = CONTROL.last.burner;
    phase = chargeAt == null ? 'preheat' : 'roast';
    try { wake = await navigator.wakeLock?.request('screen'); } catch {}   // 화면이 꺼지면 안전장치가 버너를 끄므로 켜둔다
    $('autoBanner').style.display = 'block';
    $('autoBanner').textContent = (mode === 'full' ? 'AI 자동 로스팅 중' : `예열 중 (${target}°C)`) + ' · 로스터 옆을 떠나지 마세요 · 문제가 있으면 전체 정지';
    say(phase === 'preheat' ? `${mode === 'full' ? '자동 시작' : '예열만'}: ${target}°C까지 예열해요` : '자동 시작: 로스팅 진행 중이라 지금부터 따라가요');
  }

  function start() {
    const r = lastRec;
    if (window.autoSaveBean) autoSaveBean(true);   // 볶은 생두는 목록에 자동으로 남긴다
    if (!r || !r.charge || !r.steps?.length) return say('먼저 AI 프로파일 추천을 받으세요');
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

  function cancel(reason) {
    if (!on) return;
    // 실수로 홈으로 나간 경우: 돌아오면 이어갈 수 있게 기억해 둔다 (밖에 있는 동안은 버너 0 그대로)
    if (/화면 벗어남/.test(reason || '') && !events['배출']) paused = { mode, target, at: Date.now() };
    phase = 'off'; stopUi(); say('자동 멈춤: ' + (reason || ''));
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !paused) return;
    if (Date.now() - paused.at > 10 * 60000) { paused = null; return; }
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
    ALARM.ring('배출했어요');
    const coolMin = +($('coolMin')?.value || 0);
    say(`자동 배출 (${why}). 쿨링 켰어요.` + (coolMin ? ` ${coolMin}분 뒤 쿨링을 끄고 배출구를 닫아요` : ' 원두가 식으면 쿨링 끄고 배출구 닫으세요'));
    clearTimeout(coolTimer);
    if (coolMin) coolTimer = setTimeout(async () => {
      if (!CONTROL.enabled || !chr) return;
      await CONTROL.cmd('fan', 0); await CONTROL.cmd('drop', 0);
      ALARM.ring('쿨링 끝났어요', 2);
      say('쿨링 끄고 배출구 닫았어요. 로스팅 끝!');
    }, coolMin * 60000);
  }

  function tick(st) {
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
        if (now - holdSince > 30000) {
          $('autoMsg').textContent = `투입 준비 완료 (BT ${st.bt}°). 레버로 생두를 넣으세요. 투입은 자동으로 알아채요`;
          if (!readyRung) { readyRung = true; ALARM.ring('투입 준비 완료. 생두를 넣으세요', 4); }
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

    // 1차 크랙이 곧 올 때 알림 (귀 기울이세요)
    const fcT = r.expected?.fcTemp || 186;
    if (!fc && !fcWarned && st.bt >= fcT - 6) { fcWarned = true; ALARM.ring('곧 1차 크랙이에요. 첫 크랙 들리면 버튼을 누르세요', 2); }

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
  $('preheatStart').addEventListener('click', preheatOnly);
  $('resumeBtn').addEventListener('click', () => { if (paused) { $('autoAck').checked = true; begin(paused.mode, paused.target, true); } });
  return { tick, cancel, get on() { return on; } };
})();

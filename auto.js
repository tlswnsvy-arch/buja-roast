// AI 완전 자동 로스팅 (사용자 허락 2026-10-08: "완전자동제어 허락, 꼭 옆에 있어야 한다는 경고")
// AI 추천(lastRec)대로 예열 → 투입 감지 → 온도별 버너 → 목표 곡선 보정 → 1차 크랙 뒤 상승폭 도달 시 자동 배출.
// 명령은 control.js의 cmd(버너·쿨링·배출구)만 쓰고, 전체 정지·온도 한계·응답 끊김·화면 이탈 안전장치를 그대로 따른다.

window.AUTO = (() => {
  let on = false, phase = 'off', burnerNow = null, lastSet = 0, adj = 0, lastAdjAt = 0, holdSince = 0, wake = null, stepIdx = 0, holdBase = 40;
  const say = t => { $('autoMsg').textContent = t; log('자동: ' + t); };

  async function setBurner(v, why) {
    v = Math.max(0, Math.min(100, Math.round(v / 5) * 5));
    if (v === burnerNow) return;
    burnerNow = v; lastSet = Date.now();
    await CONTROL.cmd('burner', v);
    say(`버너 ${v}% · ${why}`);
  }

  async function start() {
    const r = lastRec;
    if (!CONTROL.enabled) return say('먼저 "로스터 옆에 있어요"를 체크하세요');
    if (!chr || !CONTROL.last) return say('먼저 로스터를 연결하세요');
    if (!r || !r.charge || !r.steps?.length) return say('먼저 AI 프로파일 추천을 받으세요');
    if (!$('autoAck').checked) return say('"끝날 때까지 옆에서 지켜볼게요"를 체크해야 시작돼요');
    on = true; adj = 0; holdSince = 0; stepIdx = 0; burnerNow = CONTROL.last.burner;
    phase = chargeAt == null ? 'preheat' : 'roast';
    try { wake = await navigator.wakeLock?.request('screen'); } catch {}   // 화면이 꺼지면 안전장치가 버너를 끄므로 켜둔다
    $('autoBanner').style.display = 'block';
    say(phase === 'preheat' ? `자동 시작: 투입 온도 ${r.charge}°C까지 예열해요` : '자동 시작: 로스팅 진행 중이라 지금부터 따라가요');
  }

  function stopUi() {
    on = false; $('autoAck').checked = false; $('autoBanner').style.display = 'none';
    try { wake?.release(); } catch {} wake = null;
  }

  function cancel(reason) { if (!on) return; phase = 'off'; stopUi(); say('자동 멈춤: ' + (reason || '')); }

  async function doDrop(why) {
    phase = 'done';
    await CONTROL.cmd('burner', 0);
    await CONTROL.cmd('drop', 1);
    await CONTROL.cmd('fan', 1);
    if (!events['배출']) mark('배출');
    stopUi();
    say(`자동 배출 (${why}). 쿨링 켰어요. 원두가 식으면 쿨링 끄고 배출구 닫으세요`);
  }

  function tick(st) {
    if (!on) return;
    burnerNow = st.burner;
    const r = lastRec, now = Date.now();

    if (phase === 'preheat') {
      if (chargeAt != null) { phase = 'roast'; setBurner(r.startBurner ?? 100, '투입 감지: 시작 버너'); return; }
      // 투입 온도까지 데우고 유지: 멀면 100%, 가까워지면 PI 제어(유지에 필요한 버너를 천천히 배움)
      const gap = r.charge - st.bt;
      if (now - lastSet > 5000) {
        if (gap > 25) { holdBase = 40; setBurner(100, `예열 BT ${st.bt}° → 목표 ${r.charge}°`); }
        else {
          holdBase = Math.max(0, Math.min(85, holdBase + gap * 0.3));
          setBurner(holdBase + gap * 2.5, `예열 유지 BT ${st.bt}° → 목표 ${r.charge}°`);
          lastSet = now;   // 같은 값이어도 5초마다 다시 계산
        }
      }
      if (Math.abs(gap) <= 3) {
        if (!holdSince) holdSince = now;
        if (now - holdSince > 30000) $('autoMsg').textContent = `투입 준비 완료 (BT ${st.bt}°). 레버로 생두를 넣으세요. 투입은 자동으로 알아채요`;
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

    // AI 보정: TP 뒤~1차 크랙 전, 목표 곡선보다 5도 넘게 늦거나 빠르면 30초마다 10%씩 (계획 ±20% 안)
    if (!fc && window.TARGET && el > 90 && now - lastAdjAt > 30000) {
      const tgt = TARGET.reduce((a, b) => Math.abs(b.t - el) < Math.abs(a.t - el) ? b : a).bt;
      const diff = st.bt - tgt;
      if (diff < -5 && adj < 20) { adj += 10; lastAdjAt = now; log(`자동 보정 +10% (목표보다 ${Math.round(-diff)}도 늦음)`); }
      else if (diff > 5 && adj > -20) { adj -= 10; lastAdjAt = now; log(`자동 보정 -10% (목표보다 ${Math.round(diff)}도 빠름)`); }
    }
    if (fc) adj = Math.min(adj, 0);   // 1차 크랙 뒤에는 올리지 않는다 (플릭 방지)
    const v = Math.max(0, Math.min(100, planned + adj));
    if (v !== burnerNow && now - lastSet > 3000) setBurner(v, `BT ${st.bt}° 계획 ${planned}%${adj ? ` 보정 ${adj > 0 ? '+' : ''}${adj}` : ''}`);

    // 자동 배출: 1차 크랙 온도 + 목표 상승폭에 닿으면 (일찍 닿아도 끌지 않음), DT를 많이 넘으면, 안전 한계
    const rise = r.rise ?? 8, dt = r.dtSec ?? 60;
    if (fc) {
      const dev = s.t - fc.t, goal = fc.bt + rise, rr = ror('bt') ?? 0;
      if (dev >= 30 && st.bt >= goal) return doDrop(`1차 크랙 뒤 ${Math.round(dev)}초, +${st.bt - fc.bt}도`);
      if (dev >= dt && !(goal - st.bt <= 2 && rr > 3 && dev < dt + 10)) return doDrop(`DT ${Math.round(dev)}초 (목표 온도까지 ${goal - st.bt}도 남음)`);
    } else if (r.drop && st.bt >= r.drop + 3) return doDrop('1차 크랙 표시 없이 배출 온도를 넘음');
    // 너무 오래 걸리면(18분) 자동을 멈추고 버너를 끈다. 배출은 사람이 판단
    if (el > 18 * 60 && !fc) { CONTROL.cmd('burner', 0); cancel('18분이 지나도 1차 크랙이 없어요. 버너 껐어요. 원두 상태 보고 직접 배출하세요'); }
  }

  $('autoStart').addEventListener('click', start);
  return { tick, cancel, get on() { return on; } };
})();

// 시연 모드 (소개 영상용): 가상 로스터로 레시피 추천 → 예열 → 투입 → 자동 로스팅 → 1차 크랙 → 자동 배출 → AI 리뷰까지 혼자 진행.
// 안전: 진짜 로스터가 연결돼 있으면 시작하지 않는다. 명령은 가상 로스터로만 간다.
// 데이터: 시작 전에 저장된 모든 것(기록·레시피·설정)을 복사해 두고, 끝나면(또는 중간에 새로고침해도) 그대로 되돌린다.
//         자동 백업 파일·공유도 시연 중엔 만들지 않는다. AI는 미리 준비한 답을 쓴다 (네트워크 안 씀).
window.DEMO = (() => {
  const SNAP = '__demoSnap';
  let on = false, timer = null, vt = 0, cap = null;

  // ---------- 가상 로스터 (tools/thermal.js 와 같은 모델, 실제 배치에 대충 맞춤) ----------
  function makeRoaster(P = {}) {
    const K = Object.assign({ gain: 2.3, base: 25, etTau: 260, load: 0.012, tbTau: 75, probeTau: 13, preTau: 70, preRatio: 0.92 }, P);
    const R = { et: 25, tb: 25, bt: 25, burner: 0, charged: false, fan: 0, drop: 0, K };
    R.step = () => {
      const heat = R.burner * K.gain + K.base;
      const load = R.charged && !R.drop ? (R.et - R.tb) * K.load : 0;
      R.et += (heat - R.et) / K.etTau - load;
      if (R.fan) R.et += (25 - R.et) / 40;
      if (R.charged && !R.drop) R.tb += (R.et - R.tb) / K.tbTau;
      if (R.drop) R.bt += (40 - R.bt) / 60;
      else if (R.charged) R.bt += (R.tb - R.bt) / K.probeTau;
      else R.bt += (R.et * K.preRatio - R.bt) / K.preTau;
    };
    R.charge = () => { R.charged = true; R.tb = 25; R.et -= 15; };
    return R;
  }

  // ---------- 미리 준비한 AI 답 ----------
  const REC = {
    summary: '꽃향과 레몬 같은 산미를 살리도록 조금 빠르게 볶고, 1차 크랙 뒤 1분 동안 8도만 더 올려요.',
    level: '라이트 미디엄', levelWhy: '워시드 예가체프의 꽃향·산미를 살리기 좋은 배전도예요.',
    approach: '향미 보존형: 빠른 전체 속도에 짧은 디벨롭', type: '향미 보존형', speed: '빠름', dtSec: 60, rise: 8,
    charge: 210, startBurner: 80, damper: '처음 10칸 → 마이야르 시작 때 8칸', damperChange: { atBt: 155, notch: 8 },
    steps: [{ bt: 152, burner: 80 }, { bt: 175, burner: 60 }, { bt: 185, burner: 40 }], drop: 196,
    expected: { tpSec: 56, tpTemp: 85, fcSec: 450, fcTemp: 188, dropSec: 510 }, dtr: 12,
    nextTry: '꽃향이 약하면 다음엔 DT를 50초로 줄여 보세요.',
    why: ['고지대 워시드라 밀도가 높아 투입을 210도로 높게', '1차 크랙 전에 버너를 미리 줄여 크랙 뒤 급상승 방지', '디벨롭을 짧게 해 꽃향 보존'],
    watch: ['TP가 55초쯤 오는지', '마이야르 구간에서 댐퍼 8칸', '1차 크랙 소리가 나면 바로 버튼'],
    flavor: '자스민 꽃향, 레몬·홍차, 깔끔한 단맛',
  };
  const REVIEW = {
    deviation: ['1차 크랙이 예상과 거의 같은 때 왔어요 (예상대로 진행)'],
    good: ['TP 뒤 온도 오름이 고르게 줄어들었어요', '1차 크랙 뒤 목표 상승폭에 맞춰 배출됐어요'],
    bad: ['마이야르 구간이 조금 짧아 단맛이 덜 날 수 있어요'],
    changes: [
      { label: '마이야르 30초 늘리기 (175도 버너 60→55%)', why: '단맛과 바디를 조금 더', patch: { steps: [{ bt: 152, burner: 80 }, { bt: 175, burner: 55 }, { bt: 185, burner: 40 }] } },
      { label: 'DT 50초로 줄이기', why: '꽃향을 더 살리고 싶다면', patch: { dtSec: 50 } },
    ],
  };

  // ---------- 자막 ----------
  function say(text) {
    if (!cap) {
      cap = document.createElement('div');
      cap.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:9999;max-width:92vw;padding:14px 22px;border-radius:16px;' +
        'background:rgba(20,20,24,.88);color:#f3d38a;font-size:22px;font-weight:700;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.5);pointer-events:none';
      document.body.appendChild(cap);
    }
    cap.textContent = text || '';
    cap.style.display = text ? 'block' : 'none';
  }

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id);

  // ---------- 시작 ----------
  async function start() {
    if (on) return;
    if (chr && !chr.__demo) return alert('로스터가 연결돼 있어요. 시연은 로스터 연결을 끊고 해 주세요.');
    if (!confirm('시연 모드를 시작할까요?\n\n· 가상 로스터로 2~3분 동안 혼자 진행해요 (화면 녹화를 켜 두세요)\n· 진짜 로스터에는 아무 명령도 안 가요\n· 끝나면 기록·레시피·설정이 시연 전 그대로 돌아와요')) return;
    on = true;
    ALARM.unlock();   // 소리는 사람이 누른 순간에만 켤 수 있다
    // 저장된 것 전부 복사 (끝나거나 새로고침되면 되돌림)
    const snap = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); snap[k] = localStorage.getItem(k); }
    sessionStorage.setItem(SNAP, JSON.stringify(snap));
    try { localStorage.setItem('voiceLevel', 'key'); } catch {}

    // 시연 중엔 파일·공유·AI 네트워크 안 씀
    HTMLAnchorElement.prototype.click = function () {};
    if (navigator.share) navigator.share = async () => {};
    window.confirm = () => true;
    window.gemini = gemini = async contents => {
      const text = JSON.stringify(contents);
      await wait(1800);
      if (text.includes('방금 이 생두를 볶았다')) return JSON.parse(JSON.stringify(REVIEW));
      if (text.includes('프로파일 설정 모드')) return JSON.parse(JSON.stringify(REC));
      return '시연 모드에서는 미리 준비한 답만 보여 드려요.';
    };

    // 가상 로스터 + 가상 시계
    const R = makeRoaster({ gain: 2.5, etTau: 200, load: 0.003, tbTau: 80, probeTau: 22 });
    const realNow = performance.now.bind(performance), base = Date.now();
    performance.now = () => vt * 1000;
    Date.now = () => base + vt * 1000;
    chr = { __demo: true, writeValueWithResponse: async a => {
      const b = [...new Uint8Array(a.buffer || a)];
      if (b[2] === 0x44) {
        const k = String.fromCharCode(b[3]), v = b[4];
        if (k === 'H') R.burner = v; if (k === 'F') R.fan = v; if (k === 'S' && v && R.charged) R.drop = 1;
      } else if (b[2] === 0x48) R.burner = 0;
    } };
    const frame = () => {
      const bt = Math.round(R.bt), et = Math.round(R.et);
      handle([0x43, 0, bt >> 8, bt & 255, et >> 8, et & 255, R.burner, 1, R.fan, 0, R.drop, 2, 0x58, 0, 0, 0, 0, 0]);
    };
    let speed = 1, holdTo = 0, curveT0 = null;
    let acc = 0, last = realNow();
    timer = setInterval(() => {
      const now = realNow(); acc += (now - last) / 1000 * speed; last = now;
      while (acc >= 1) {
        acc -= 1; R.step();
        // 예열 마무리 도우미: 가상 로스터 반응이 앱의 예열 조절과 안 맞아 목표 근처에서 오르내린다 (실측) → 목표에 부드럽게 붙인다
        if (holdTo) { R.bt += (holdTo - R.bt) / 10; R.et += (holdTo + 22 - R.et) / 10; }
        // 투입 뒤엔 실제 배치처럼 보이는 곡선을 따라간다 (가상 모델은 앱의 버너 보정과 맞물려 1차 크랙 전에 멈췄다, 실측)
        // TP 85°@56초 → 1차 크랙 188°@7:30 → 196°@8:30 (추천의 예상값과 같게)
        if (curveT0 != null && !R.drop) {
          const t = vt - curveT0;
          R.bt = t < 56 ? 85 + 125 * (1 - t / 56) ** 2 : 85 + 150 * (1 - Math.exp(-(t - 56) / 339));
          R.et = R.bt + (t < 56 ? 25 - t / 4 : 18 - Math.min(8, (t - 56) / 60));
        }
        frame(); vt++;
      }
    }, 50);

    try {
      // 1. 레시피
      showTab('recipe');
      say('BUJA AI 로스팅 · AI가 함께 볶는 커피');
      await wait(3000);
      const fill = (id, v) => { const el = $(id); if (el) { el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); } };
      fill('bName', '에티오피아 예가체프 워시드 (시연)'); fill('bOrigin', '에티오피아'); fill('bProcess', '워시드');
      fill('bMoist', '10.5'); fill('bAmt', '200'); fill('bTaste', '');
      addTasteWord('꽃향'); await wait(700); addTasteWord('레몬'); window.tasteState?.();
      say('생두와 원하는 맛(꽃향, 레몬)을 고르면');
      await wait(3500);
      say('AI가 이 기계에 맞는 로스팅 레시피를 짜요');
      $('recBtn').click();
      await wait(3000);
      $('rec')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      await wait(5000);

      // 2. 로스팅: 예열 (빨리 감기)
      showTab('roast');
      say('로스팅 탭: 온도·버너·그래프를 실시간으로');
      const cb = $('ctlOn'); cb.checked = true; cb.dispatchEvent(new Event('change'));
      const ack = $('autoAck'); ack.checked = true; ack.dispatchEvent(new Event('change'));
      await wait(2500);
      // 예열: 앱은 "실제 시간 20초 동안 온도가 안정"해야 준비 완료라, 빨리 감으면 판정이 안 된다 (실측).
      // 그래서 거의 데워진 로스터에서 시작해 보통 속도로 마무리만 보여 준다.
      say('AI 자동 시작 → 예열 (미리 데워 둔 상태에서 시작)');
      R.et = 236; R.bt = 203;
      let ready = false;
      const ring = ALARM.ring;
      ALARM.ring = (text, ...a) => { if (/넣으세요/.test(text)) ready = true; return ring(text, ...a); };
      speed = 3;
      $('autoStart').disabled = false; $('autoStart').click();
      holdTo = (lastRec?.charge || 210) + 1;
      for (let i = 0; i < 1200 && !ready && on; i++) await wait(100);
      ALARM.ring = ring;
      holdTo = 0;
      speed = 1;
      say('예열이 끝나면 "이제 생두를 넣으세요" 알림');
      await wait(3500);

      // 3. 투입 → 자동 로스팅
      R.charge();
      curveT0 = vt;
      say('투입! 투입·TP는 저절로 알아채요');
      speed = 5;
      await wait(5000);
      say('건조 → 마이야르 → 디벨롭, 구간이 색으로 보여요 (5배 빠르게)');
      const chargeVt = vt;
      // 1차 크랙: 실제로는 귀로 듣고 버튼 한 번
      while (on && !(vt - chargeVt > 120 && R.bt >= 186)) {
        if (vt - chargeVt > 160 && vt - chargeVt < 175) say('AI가 목표 곡선(점선)에 맞춰 버너를 조절해요');
        await wait(100);
      }
      speed = 2;
      say('1차 크랙! 소리가 나면 버튼 한 번');
      const b = $('e1C'); b.disabled ? mark('1차 크랙') : b.click();
      await wait(4000);
      say('목표 상승폭에 닿으면 자동 배출 + 쿨링');
      speed = 5;
      for (let i = 0; i < 900 && !R.drop; i++) await wait(100);
      await wait(4000);

      // 4. 리뷰
      showTab('recipe');
      say('배치가 끝나면 AI가 예상과 실제를 비교해 리뷰해요');
      await wait(2500);
      $('review')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      await wait(6000);
      say('다음 배치에 반영할 것을 골라 "적용"만 누르면 돼요');
      await wait(5000);

      // 5. 기록
      showTab('log');
      say('기록 탭: 배치마다 맛 평가와 다시 보기');
      await wait(5000);
      say('BUJA AI 로스팅');
      await wait(3000);
    } finally {
      stop();
    }
  }

  function stop() {
    clearInterval(timer);
    on = false;
    say('시연을 마치고 원래대로 돌아가요…');
    restore();
    // reload 는 크롬이 입력칸 내용(시연 생두 이름 등)을 되살려 놓아서, 새로 여는 방식으로 (실측)
    setTimeout(() => location.replace(location.pathname + location.search), 1200);
  }

  // 시연 전 저장 상태로 되돌린다 (페이지 처음 열 때도 확인: 시연 중 새로고침·닫힘 대비)
  function restore() {
    const raw = sessionStorage.getItem(SNAP);
    if (!raw) return;
    try {
      const snap = JSON.parse(raw);
      localStorage.clear();
      for (const [k, v] of Object.entries(snap)) localStorage.setItem(k, v);
    } catch {}
    sessionStorage.removeItem(SNAP);
  }

  document.getElementById("demoStart")?.addEventListener("click", start);
  return { start, stop, restore, get on() { return on; } };
})();

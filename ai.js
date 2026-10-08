// 부자 AI 로스팅: Gemini 프로파일 추천 · 채팅 · 로스팅 중 안내 · 끝난 뒤 리뷰
// index.html 전역(samples, events, chargeAt, ror, draw, log, $)을 그대로 쓴다

const MODELS = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite'];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// 고수 관점 A: 부자로스터 대표 교육자료 「부자로스터 실전 로스팅 가이드」(B80C 500g 기준)를 요약한 설계 틀
const BUJA_GUIDE = `
[고수 관점 A: 부자로스터 제조사 교육자료 (B80C 500g 기준, 온도는 상대값). 이 기계 계열에 가장 가까운 실전 자료지만 정답은 아님]
- 세 가지로 설계한다: 전체 속도(투입~1차 크랙), DT(1차 크랙~배출, 기본 60초, 관리 범위 55~65초), DT 동안 온도 상승폭(+7~10도).
- 상승폭별 맛 방향: +7도 플로럴·허브·시트러스(가장 선명, 위험: 곡물·떫음·빈 여운). +8도 베리·화사한 과일·발효 캐릭터. +9도 주스·꿀·익어가는 과일(선명도와 단맛 균형). +10도 익은 과일·꿀·캐러멜(질감·여운, 위험: 플로럴 감소·로스티). 단맛은 직선으로 늘지 않고 원두별 최적점이 있다.
- 원두별 상승폭: 내추럴 +7~8, 무산소 +7~8, 화사한 워시드 +7~9, 고밀도 워시드 +9~10, 고밀도 게이샤 +9~10. 단 가공 방식보다 발효 강도·밀도·수분·고도·목표 추출을 먼저 본다. 워시드도 화사함·티라이크가 목표면 +7~8이 맞을 수 있다.
- 속도 × 상승폭: 빠름+7~8 = 내추럴·무산소 향미 보존. 빠름+9~10 = 고밀도 워시드·게이샤 균형(위험: 후반 플릭). 기준+7~8 = 화사한 워시드, 클린컵·티라이크. 기준+9~10 = 익은 과일·꿀·긴 여운. 느림+7~8 = 발효향 강하거나 산미 거친 원두 정돈(위험: 베이크·평평). 느림+9~10 = 에스프레소용 캐러멜·견과. 빠르면 높은 상승폭이 부족한 전개를 보완하고, 느리면 낮은 상승폭이 과한 열을 억제한다.
- 기준 프로파일(B80C 500g, 에티오피아 게레나 워시드): 투입 220도 버너 100, BT 152.3도(3:30) 80, 175.3도(4:59) 60, 187도 1차 크랙(5:52) 10 → 배출 194도 6:59, DT 1:07, +7도, DTR 15.9%. 빠름/느림은 이 기준 배출보다 30초~1분 빠르거나 느린 것.
- 현장 판단: 목표 상승폭에 DT 50초에 도달하면 그냥 배출(시간 맞추려 더 끌지 않음). 60초인데 1~2도 부족하면 RoR이 자연스러울 때만 5~10초 더. 상승폭을 넘겼으면 즉시 배출하고 다음 배치는 1차 크랙 이전 에너지를 줄인다(크랙 후 급히 화력을 떨어뜨리기보다 앞에서 조정). 우선순위: 배출점·로스팅 정도 > 상승폭 > DT 범위 > 후반 RoR 크래시·플릭 > 색도·감량률·커핑.
- 커핑 → 다음 배치: 향은 강한데 시고 비어 있음 → +1도 또는 5~10초 보완. 플로럴 좋지만 떫고 건조 → 1차 크랙 전 에너지 안정화. 과일이 잼처럼 무겁고 답답 → 상승폭 1~2도 낮추거나 전체 시간 단축. 단맛은 있으나 향이 평평 → 메일라드 구간 압축, 후반 에너지 매끄럽게. 식으면 쓰고 마른 여운 → 배출온도 낮추고 1차 크랙 전 감열. 추출이 어렵고 닫힘 → +1도 또는 빠름+9도.
- 한 번에 하나만 바꾼다. +7 → +8 → +9처럼 1도씩 비교하고 최적점 근처는 0.5도씩.`;

// 고수 관점 B~E: 다른 유명 로스터들의 접근. AI가 생두와 목표에 맞는 쪽을 고르거나 섞는다
const EXPERT = `
[고수 관점 B: Scott Rao (The Coffee Roaster's Companion, Rao 커피 블로그)]
- RoR은 투입 뒤 최고점에서 배출까지 꾸준히 내려가야 한다. 1차 크랙 직전·직후에 RoR이 꺼졌다가(크래시) 다시 튀는(플릭) 것은 피한다. 중간에 RoR이 평평하게 멈추면 베이크(밋밋한 맛) 위험.
- 단계 시간 기준: 건조(투입~약 160도) 총 시간의 40~50%, 메일라드(160도~1차 크랙) 30~35%, 디벨롭(1차 크랙~배출) 15~25%.
- Rao는 꾸준히 내려가는 RoR이 DTR 숫자보다 중요하다고 보며, 그 곡선이면 DTR이 보통 20~25%가 된다. 부자 가이드(DT 60초, DTR 약 15~16%)보다 디벨롭이 길다. 단맛·균형·추출 쉬움을 원하면 Rao 쪽, 선명도·투명함을 원하면 짧은 쪽.
[고수 관점 C: 북유럽식 라이트 로스팅 (Tim Wendelboe, Coffee Collective, La Cabra 등)]
- 높은 초반 에너지로 빠르게 1차 크랙까지, 디벨롭은 짧게(1차 크랙 뒤 약 45~90초), 아주 밝은 색. 투명도·산미·테루아 표현이 목표. 단, 내부가 덜 익으면 풋내·곡물맛이 나므로 고품질 고밀도 생두와 충분한 초반 열이 전제.
[고수 관점 D: Rob Hoos (Modulating the Flavor Profile of Coffee)]
- 메일라드 구간(옐로~1차 크랙) 길이로 단맛·바디를, 디벨롭 길이로 산미의 날카로움과 쓴맛을 조절한다. 메일라드를 늘리면 단맛과 바디가 늘고 산미가 둥글어진다. 한 번에 한 구간만 바꿔 비교.
[고수 관점 E: 연구 (Münchow 등 2020, 디벨롭 시간 변화 실험)]
- 같은 배출 색도에서도 디벨롭 시간이 길면 단맛·바디·로스티, 짧으면 산미·과일·떫음 쪽으로 간다. 색도(배출 온도)와 시간을 따로 봐야 한다.
[관점을 고르는 법]
- 정답 하나는 없다. 생두(가공·밀도·수분·발효 강도), 원하는 맛, 추출 방식(필터/에스프레소)에 가장 맞는 관점을 고르거나 섞고, 어느 관점을 왜 골랐는지 밝혀라. 부자 가이드보다 다른 고수 방식이 더 맞다고 판단되면 그쪽을 써라.
- 공통으로 피할 것: RoR 크래시·플릭, 중간 정체(베이크), DT 45초 미만, 겉타짐.
- 총 로스팅 시간은 200~300g 소형 드럼에서 보통 8~11분이 균형이 좋다. 7분 미만이면 겉만 익을 위험, 13분 이상이면 베이크 위험.
- 가공 방식: 내추럴·무산소는 당이 많아 겉이 쉽게 타므로 투입 온도와 후반 화력을 워시드보다 조금 낮게, 1차 크랙 전에 화력을 일찍 줄인다. 워시드·고밀도(고지대, 케냐·에티오피아 워시드, 게이샤)는 초반 에너지를 충분히 줘야 속까지 익는다. 허니는 그 중간.
- 수분이 높거나(11% 이상) 새 생두는 건조 구간을 조금 길게, 수분이 낮거나(9% 이하) 오래된 생두는 투입 온도와 화력을 낮춰 겉타지 않게.
- 꽃향·과일·밝은 산미를 원하면 라이트 쪽 + 초반 에너지 충분 + 짧지만 60초 이상인 디벨롭. 단맛·바디·초콜릿을 원하면 메일라드를 조금 길게 + 디벨롭 20% 이상.
- 날씨: 습도가 높거나 기온이 낮으면 초반 열 손실이 커서 투입 온도를 3~5도 올린다.
- 투입량이 많을수록 투입 온도를 올린다(같은 기계에서 100g 차이마다 대략 5~10도).`;

// 사용자 기록 58개에서 뽑은 '이 기계의 반응' (원본 기록은 넣지 않음). 사용자는 초보라 이 기록의 맛 결과를 목표로 삼지 않는다
const MACHINE = `
[이 로스터: 부자로스터 B30s 스마트, 전기식 드럼, 100~300g(사용자 기준 최대 300g, 부자 가이드 B80C 500g의 60% 이하라 열용량과 시간이 다르다), 버너 0~100%, 댐퍼는 수동 원형 다이얼(보통 풀개방), 사용자가 화면에 개방 %를 기록함. 투입은 레버(수동), 1·2차 크랙은 귀로 듣고 버튼, 배출은 자동]
- 전기 히터라 버너를 바꿔도 온도 반응이 30~60초 늦다. 버너는 목표 온도보다 미리 바꿔야 한다.
- 부자 앱 "프로파일 설정 모드" = 'BT가 X도가 되면 버너 Y%' 단계(최대 5개) + 배출 온도(자동 배출). 시작 버너는 100% 또는 지정값.
- TP는 투입 온도와 상관없이 늘 53~60초. TP 온도: 투입 160→60~64도, 170→64~67도, 180→67~73도, 200→77~82도, 210~215→83~91도.
- 투입 온도별 실제 시간(버너 80~100%로 시작했을 때): 160~175도 → 1차 크랙 약 10분, 176~195도 → 약 9분, 196~215도 → 약 6.5~8분. 300g 투입 200 → 1차 크랙 7:31, 300g 투입 211 → 8:03, 200g 투입 210 → 5:13~6:02.
- 1차 크랙은 이 기계 온도계로 보통 BT 185~192도.
- 이 기계에서 확인된 실수(피할 것): 300g에 투입 200 + 175도부터 60%는 화력 부족으로 1차 크랙 뒤 7도 오르는 데 2분 넘게 걸림. 200g에 투입 215는 너무 빨라 총 6분 미만. 버너 40% 시작은 190도 근처에서 정체(17분). 투입 240 + 버너 70%는 1차 크랙 5:46으로 너무 빠름. DT가 52~57초로 부자 가이드 범위(55~65초)보다 짧았던 적이 있음.
- 사용자는 7월 말부터 부자 가이드 기준 프로파일과 같은 단계(152→80, 175→60, 186~190→30)를 쓰고 있음. 메모: "DT60에 7~8도".
- 이 기계(B30s, 200~300g)는 가이드 B80C 500g과 TP·1차 크랙 온도대가 비슷하다(TP 83~91도, 1차 크랙 185~192도). 숫자 온도는 거의 그대로 쓰고 시간만 보정한다. 투입 210~215에서 1차 크랙 약 5:10~6:40, 배출 약 6:00~8:10이었다.
- 사용자 메모: 200g은 투입 210, 300g은 투입 215가 이 기계에서 적당해 보였음.
- 100g은 기록이 없다. 이 드럼에 적은 양이라 열이 빨리 들어가므로 투입 온도는 200g보다 10~20도 낮게(약 190~200), 시작 버너도 낮게(60~80%) 잡고 단계도 일찍 줄여라. 첫 시험이니 보수적으로.
- 이 화면의 AI 자동 실행은 추천한 steps를 BT 온도에 맞춰 그대로 쓰고, 1차 크랙 뒤 rise(상승폭)에 닿으면 자동 배출한다. 그래서 steps·rise·dtSec·charge·startBurner를 꼭 숫자로 줘라.`;
const LEARNED = BUJA_GUIDE + EXPERT + MACHINE;
const $v = id => ($(id).value || '').trim();
let WX = null, lastRec = store.get('lastRec', null), chatLog = [];

// ---------- Gemini ----------
async function gemini(contents, { json = false, system = '' } = {}) {
  const key = store.get('gemKey', '');
  if (!key) throw new Error('설정에서 Gemini API 키를 먼저 저장해주세요.');
  const body = {
    contents,
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    generationConfig: json ? { responseMimeType: 'application/json', temperature: 0.4 } : { temperature: 0.6 },
  };
  let lastErr;
  for (const m of MODELS) {
    try {
      // 모델이 응답 없이 걸려 있으면 40초 뒤 다음 모델로
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 40000);
      if ($('rec').textContent.includes('짜는 중')) $('rec').textContent = `AI(${m})가 생두와 기록을 보고 프로파일을 짜는 중...`;
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal: ctl.signal,
      }).finally(() => clearTimeout(timer));
      if (!r.ok) { lastErr = new Error(`${m} ${r.status}`); if ([404, 429, 500, 503].includes(r.status)) continue; throw lastErr; }
      const j = await r.json();
      const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
      log('AI 모델: ' + m);
      return json ? JSON.parse(text.replace(/^```json\s*|```$/g, '')) : text;
    } catch (e) { lastErr = e; if (!/\b(404|429|500|503)\b|Failed to fetch|abort/i.test(e.message)) break; }
  }
  throw lastErr;
}

// ---------- 날씨 (Open-Meteo, 키 필요 없음) ----------
async function loadWeather() {
  // 위치 권한 창에 답이 없으면 8초 뒤 서울 기준으로
  const pos = await new Promise(res => {
    if (!navigator.geolocation) return res(null);
    setTimeout(() => res(null), 8000);
    navigator.geolocation.getCurrentPosition(p => res(p.coords), () => res(null), { timeout: 8000, maximumAge: 3600e3 });
  });
  const lat = pos?.latitude ?? 37.57, lon = pos?.longitude ?? 126.98;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,surface_pressure`);
    const c = (await r.json()).current;
    WX = { temp: c.temperature_2m, rh: c.relative_humidity_2m, hpa: c.surface_pressure, where: pos ? '현재 위치' : '서울 기준' };
    $('weather').textContent = `오늘 ${WX.where}: ${WX.temp}°C, 습도 ${WX.rh}%`;
  } catch { $('weather').textContent = '날씨를 못 불러왔어요'; }
}

// ---------- 내 기록 ----------
function historyText(limit = 40) {
  const h = [...store.get('myHistory', []), ...store.get('myRoasts', [])];
  if (!h.length) return '(불러온 개별 기록 없음)';
  const f = s => s == null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return h.slice(-limit).map(r => {
    if (r.source === 'web') return `${r.date} ${r.bean?.name || ''} ${r.bean?.amt || ''}g 투입${r.charge} 1C ${r.fc || '-'} 배출 ${r.drop || '-'} DTR ${r.dtr ?? '-'} 평가:${r.cupping || '-'}`;
    const ev = r.ev || {};
    return `${(r.date || '').slice(0, 10)} ${/^# \d+$/.test(r.name) ? '' : r.name} ${r.amt ? r.amt + 'g ' : ''}${r.mode} 투입${r.charge} TP ${ev.TP ? ev.TP.t + '@' + f(ev.TP.s) : '-'} 1C ${ev['1C'] ? ev['1C'].t + '@' + f(ev['1C'].s) : '-'} 배출 ${ev['배출'] ? ev['배출'].t + '@' + f(ev['배출'].s) : r.drop} DTR ${r.dtr ?? '-'} ${r.steps?.length ? '단계 ' + r.steps.map(s => s[0] + '→' + s[1] + '%').join(',') : ''} ${r.memo ? '메모:' + r.memo.replace(/\n/g, ' ') : ''}`;
  }).join('\n');
}

function refText() {
  const refs = store.get('refProfiles', []);
  return refs.length ? '고수 참고 프로파일(다른 사람이 공유):\n' + refs.map(r => `- ${r.profile}${r.note ? ' / 메모: ' + r.note : ''}`).join('\n') : '';
}

function beanText() {
  return `생두: ${$v('bName') || '(이름 없음)'} / 산지·품종: ${$v('bOrigin') || '-'} / 가공: ${$v('bProcess')} / 수분: ${$v('bMoist') || '모름'}% / 투입량: ${$v('bAmt') || '300'}g / 배전도: ${$v('bLevel') === 'AI가 정하기' ? 'AI가 정해줘(생두 특성과 원하는 맛, 마시는 방법을 보고 고수들이 이 생두에 가장 많이 권하는 배전도로)' : $v('bLevel') + '(사용자가 직접 고름)'} / 마시는 방법: ${$v('bBrew')} / 원하는 맛: ${$v('bTaste') || '-'}`;
}
const wxText = () => WX ? `오늘 날씨(${WX.where}): ${WX.temp}°C, 습도 ${WX.rh}%, 기압 ${WX.hpa}hPa` : '날씨 정보 없음';

const SYSTEM = `너는 스페셜티 커피 로스팅 전문가이자 사용자의 로스팅 코치다. 사용자는 홈로스터로 부자로스터 B30s를 쓴다.
목표 맛과 곡선은 아래 여러 고수 관점(A~E) 중 이 생두와 목표에 가장 맞는 것을 골라 정하고(부자 가이드를 무조건 따르지 말 것), 이 기계의 반응(시간·온도·지연)으로 숫자를 맞춰라. 사용자는 초보라서 사용자 기록의 맛 결과를 목표로 삼지 말고, 기계 반응 확인과 실수 피하기에만 써라. 사용자가 저장한 고수 참고 프로파일이 있으면 그것도 참고해라.${LEARNED}
답은 한국어로, 짧고 실용적으로. 숫자는 구체적으로. 굵은 글씨(**)와 표는 쓰지 마라.`;

// ---------- 프로파일 추천 ----------
async function recommend() {
  const btn = $('recBtn'); btn.disabled = true; $('rec').textContent = 'AI가 생두와 기록을 보고 프로파일을 짜는 중...';
  try {
    const prompt = `${beanText()}
${wxText()}
${refText()}
사용자 기록(초보 기록: 이 기계 반응 확인용, 맛 목표 아님):
${historyText()}

이 생두를 부자 앱 "프로파일 설정 모드"에 바로 입력할 수 있게 추천해라. 먼저 고수 관점 A~E 중 이 생두와 원하는 맛에 가장 맞는 접근을 골라라(섞어도 됨). 그다음 목표가 향미 보존형인지 내부 완성형인지 → 전체 속도(빠름/기준/느림) → DT → 1차 크랙 뒤 상승폭을 정해라. 그다음 B30s ${$v('bAmt') || 300}g에 맞게 투입 온도와 시간을 보정해라. 버너 단계는 2~5개, 전기 히터 지연을 감안해 미리 줄여라. 배출 온도 = 예상 1차 크랙 온도 + 상승폭.
JSON으로만 답해라:
{"summary":"한두 문장 요약","level":"정한 배전도","levelWhy":"그 배전도를 고른 이유 한 줄(사용자가 직접 골랐으면 그 배전도가 이 생두에 맞는지 한마디)","approach":"고른 고수 관점과 이유 한 줄","type":"향미 보존형 또는 내부 완성형","speed":"빠름|기준|느림","dtSec":목표DT초,"rise":1차크랙뒤상승폭숫자,
"charge":투입온도,"startBurner":시작버너%,"damper":"댐퍼 개방 % 추천(예: 처음 50 → 1차 크랙 전 100)","steps":[{"bt":온도,"burner":%}],"drop":배출온도,
"expected":{"tpSec":초,"tpTemp":온도,"fcSec":초,"fcTemp":온도,"dropSec":초},"dtr":목표DTR%,"nextTry":"이번 결과를 커핑한 뒤 다음 배치에서 바꿔볼 한 가지",
"why":["이유 2~4개"],"watch":["로스팅 중 볼 것 2~4개(언제 무엇을 하면 되는지)"],"flavor":"예상되는 맛"}`;
    const r = await gemini([{ role: 'user', parts: [{ text: prompt }] }], { json: true, system: SYSTEM });
    lastRec = { ...r, bean: readBean(), at: new Date().toISOString() };
    store.set('lastRec', lastRec);
    saveBeanProfile();
    renderRec();
  } catch (e) { $('rec').textContent = '추천 실패: ' + e.message; }
  btn.disabled = false;
}

const readBean = () => ({ name: $v('bName'), origin: $v('bOrigin'), process: $v('bProcess'), moist: $v('bMoist'), amt: $v('bAmt'), level: $v('bLevel'), brew: $v('bBrew'), taste: $v('bTaste') });
const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function renderRec() {
  const r = lastRec; if (!r) return;
  const e = r.expected || {};
  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const num = (k, v) => `<input class="recnum" data-k="${k}" type="number" value="${esc(v)}" style="width:64px;padding:4px 6px;display:inline-block">`;
  $('rec').style.whiteSpace = 'normal';
  $('rec').innerHTML = `
    <div>${esc(r.summary)}</div>
    ${r.level ? `<div style="margin-top:6px">배전도: ${esc(r.level)}${r.levelWhy ? ' · ' + esc(r.levelWhy) : ''}</div>` : ''}
    ${r.speed ? `<div class="steps">${r.approach ? `<span class="step">${esc(r.approach)}</span>` : ''}<span class="step">${esc(r.type)}</span><span class="step">속도 ${esc(r.speed)}</span><span class="step">DT ${esc(r.dtSec)}초</span><span class="step">1차 크랙 뒤 +${esc(r.rise)}도</span></div>` : ''}
    <div class="note" style="margin-top:8px">자동 로스팅·부자 앱에 쓸 값 (숫자를 눌러 바로 고칠 수 있어요)${r.edited ? ' · <b style="color:#d9a441">고친 값</b>' : ''}</div>
    <div class="steps">
      <span class="step">투입 ${num('charge', r.charge)}°C</span>
      <span class="step">시작 버너 ${num('startBurner', r.startBurner ?? 100)}%</span>
      ${(r.steps || []).map((s, i) => `<span class="step">BT ${num('s' + i + 'bt', s.bt)}°C → ${num('s' + i + 'burner', s.burner)}%</span>`).join('')}
      <span class="step">배출 ${num('drop', r.drop)}°C</span>
      <span class="step">1차 크랙 뒤 +${num('rise', r.rise ?? 8)}도</span>
      <span class="step">DT ${num('dtSec', r.dtSec ?? 60)}초</span>
      ${r.damper ? `<span class="step">댐퍼 ${esc(r.damper)}</span>` : ""}
    </div>
    <div class="note">예상: TP ${e.tpSec ? mmss(e.tpSec) : '-'} · 1차 크랙 ${e.fcTemp || '-'}°C ${e.fcSec ? mmss(e.fcSec) : '-'} · 배출 ${e.dropSec ? mmss(e.dropSec) : '-'} · DTR ${esc(r.dtr)}%</div>
    <div style="margin-top:8px">왜 이렇게?<br>${(r.why || []).map(x => '· ' + esc(x)).join('<br>')}</div>
    <div style="margin-top:8px">볶는 중 볼 것<br>${(r.watch || []).map(x => '· ' + esc(x)).join('<br>')}</div>
    <div style="margin-top:8px">예상 맛: ${esc(r.flavor)}</div>
    ${r.nextTry ? `<div style="margin-top:8px" class="note">다음 배치 실험: ${esc(r.nextTry)}</div>` : ''}`;
  $('rec').querySelectorAll('.recnum').forEach(inp => inp.addEventListener('change', () => {
    const k = inp.dataset.k, v = +inp.value; if (!isFinite(v)) return;
    const m = k.match(/^s(d+)(bt|burner)$/);
    if (m) lastRec.steps[+m[1]][m[2]] = v; else lastRec[k] = v;
    lastRec.edited = true; store.set('lastRec', lastRec); saveBeanProfile(); renderRec(); log('추천값 고침: ' + k + ' = ' + v);
  }));
  // 목표 곡선: 투입 → TP → 1차 크랙 → 배출
  if (e.fcSec && e.dropSec) {
    const pts = [[0, r.charge], [e.tpSec || 56, e.tpTemp || 80], [e.fcSec, e.fcTemp || 188], [e.dropSec, r.drop]];
    window.TARGET = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ta, va] = pts[i], [tb, vb] = pts[i + 1];
      for (let t = ta; t < tb; t += 5) {
        const k = (t - ta) / (tb - ta);
        // 투입→TP는 빠르게 떨어지고, 그 뒤는 완만하게 오르는 모양
        const ease = i === 0 ? 1 - Math.pow(1 - k, 3) : Math.sin(k * Math.PI / 2) * 0.5 + k * 0.5;
        TARGET.push({ t, bt: va + (vb - va) * ease });
      }
    }
    TARGET.push({ t: e.dropSec, bt: r.drop });
    draw();
  }
}

// 같은 생두는 마지막(고친/적용한) 프로파일을 기억해서 다음 배치에 바로 쓴다
function saveBeanProfile() {
  const name = $v('bName'); if (!name || !lastRec) return;
  const all = store.get('beanProfiles', {}); all[name] = lastRec; store.set('beanProfiles', all);
}

// ---------- 배출 뒤 AI 리뷰: 다음 배치 개선점을 골라서 적용 ----------
async function review(rec) {
  const box = $('review'); box.innerHTML = '<div class="note">AI가 이번 배치를 보고 다음 배치 개선점을 정리하는 중...</div>';
  try {
    const r = await gemini([{ role: 'user', parts: [{ text: `방금 이 생두를 볶았다. ${beanText()}
이번에 쓴 설정: ${JSON.stringify({ charge: lastRec?.charge, startBurner: lastRec?.startBurner, steps: lastRec?.steps, drop: lastRec?.drop, rise: lastRec?.rise, dtSec: lastRec?.dtSec, expected: lastRec?.expected })}
실제 결과: 투입 ${rec.charge}°C, 1차 크랙 ${rec.fc || '-'}, 배출 ${rec.drop}, DTR ${rec.dtr}%, 댐퍼 기록 ${JSON.stringify(rec.damperLog || [])}
곡선 요약[투입 뒤 초, BT, ET, 버너%, 댐퍼%]: ${JSON.stringify(rec.curve.filter(c => c[0] >= -10).filter((_, i) => i % 2 === 0))}
${$v('cupNote') ? '사용자 맛 평가: ' + $v('cupNote') : '아직 맛 평가 없음'}
결과를 추천과 비교하고, 다음 배치에서 바꿀 것을 1~3개 골라라. 한 번에 하나씩 바꾸는 원칙을 지키되, 서로 다른 선택지로 줘라(사용자가 하나를 고른다).
JSON으로만: {"good":["잘된 점 1~2개"],"bad":["아쉬운 점 1~2개"],"changes":[{"label":"버튼에 쓸 짧은 문장","why":"이유 한 줄","patch":{"바꿀 키만":"값"}}]}
patch에 쓸 수 있는 키: charge, startBurner, steps(전체 배열 [{bt,burner}]), drop, rise, dtSec. 숫자로.` }] }], { json: true, system: SYSTEM });
    const esc = t => String(t ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    box.innerHTML = `<div style="font-weight:600">이번 배치 리뷰</div>
      <div>잘된 점<br>${(r.good || []).map(x => '· ' + esc(x)).join('<br>')}</div>
      <div>아쉬운 점<br>${(r.bad || []).map(x => '· ' + esc(x)).join('<br>')}</div>
      <div class="note">다음 배치에 반영할 것을 고르세요 (하나만 고르는 걸 추천해요)</div>
      ${(r.changes || []).map((c, i) => `<div class="row"><button data-apply="${i}">적용</button><span>${esc(c.label)} <span class="note">${esc(c.why)}</span></span></div>`).join('')}`;
    box.querySelectorAll('[data-apply]').forEach(b => b.addEventListener('click', () => {
      const c = r.changes[+b.dataset.apply], p = c.patch || {}, ok = {};
      for (const k of ['charge', 'startBurner', 'drop', 'rise', 'dtSec']) if (isFinite(+p[k]) && p[k] !== '' && p[k] != null) ok[k] = +p[k];
      if (Array.isArray(p.steps) && p.steps.every(x => isFinite(+x.bt) && isFinite(+x.burner))) ok.steps = p.steps.map(x => ({ bt: +x.bt, burner: Math.max(0, Math.min(100, +x.burner)) }));
      Object.assign(lastRec, ok, { edited: true, lastChange: c.label });
      store.set('lastRec', lastRec); saveBeanProfile(); renderRec();
      b.textContent = '적용됨'; b.disabled = true;
      log('다음 배치에 적용: ' + c.label + ' ' + JSON.stringify(ok));
    }));
  } catch (e) { box.innerHTML = '<div class="note">리뷰 실패: ' + e.message + '</div>'; }
}

// ---------- 채팅 ----------
function parseBujaLink(text) {
  const m = text.match(/https?:\/\/bujaroaster\.netlify\.app\/\?[^\s]+/);
  if (!m) return null;
  const q = new URL(m[0]).searchParams;
  let pt = null; try { pt = JSON.parse(q.get('pt')); } catch {}
  const steps = pt ? pt[1].map((t, i) => `BT ${t}°C → ${pt[0][i]}%`).join(', ') : '-';
  return `[부자 앱 공유 프로파일] 모드 type=${q.get('type')}, 투입 ${q.get('chargetemp')}°C, 배출 ${q.get('droptemp')}°C, 단계: ${steps}, 스타일 ${q.get('style')}`;
}

function liveText() {
  if (!samples.length) return '로스터 연결 안 됨 / 데이터 없음';
  const s = samples.at(-1), r = ror('bt');
  const el = chargeAt == null ? '투입 전' : `투입 후 ${mmss(s.t - chargeAt)}`;
  return `지금: BT ${s.bt}°C, ET ${s.et}°C, BT RoR ${r == null ? '-' : r.toFixed(1)}°C/분, 버너 ${s.burner}%, 댐퍼 ${s.damper}%(수동), ${el}, 이벤트: ${Object.entries(events).map(([k, v]) => `${k} ${v.bt}°C@${mmss(Math.max(0, v.t - (chargeAt ?? 0)))}`).join(', ') || '없음'}`;
}

function addMsg(who, text) {
  const d = document.createElement('div'); d.className = 'msg ' + who; d.textContent = text;
  $('chat').appendChild(d); $('chat').scrollTop = 1e9; return d;
}

async function ask(q) {
  if (!q) return;
  addMsg('me', q);
  const link = parseBujaLink(q);
  // 다른 사람(고수)이 공유한 부자 프로파일 링크는 참고 프로파일로 저장해서 추천 때마다 같이 본다
  if (link && !/내\s*(꺼|거|기록)|내가 볶은/.test(q)) {
    const refs = store.get('refProfiles', []);
    if (!refs.some(r => r.profile === link)) { refs.push({ profile: link, note: q.replace(/https?:\/\/\S+/g, '').trim(), at: new Date().toISOString().slice(0, 10) }); store.set('refProfiles', refs.slice(-30)); log('참고 프로파일로 저장'); }
  }
  const ctx = `${beanText()}\n${wxText()}\n${liveText()}\n${lastRec ? '최근 AI 추천: ' + JSON.stringify({ charge: lastRec.charge, steps: lastRec.steps, drop: lastRec.drop, expected: lastRec.expected }) : ''}\n${link || ''}\n${refText()}\n사용자 기록(초보 기록, 기계 반응 확인용):\n${historyText(25)}`;
  chatLog.push({ role: 'user', parts: [{ text: `${q}\n\n[참고 정보]\n${ctx}` }] });
  const wait = addMsg('ai', '생각 중...');
  try {
    const a = await gemini(chatLog.slice(-12), { system: SYSTEM });
    wait.textContent = a.trim();
    chatLog.push({ role: 'model', parts: [{ text: a }] });
  } catch (e) { wait.textContent = '실패: ' + e.message; chatLog.pop(); }
}

// ---------- 로스팅 중 안내 (로컬 규칙 + 중요한 순간에만 AI) ----------
let saidStep = -1, lastCoach = 0;
function coach(text) { const c = $('coach'); c.style.display = 'block'; c.textContent = text; }

window.onSample = st => {
  if (chargeAt == null || events['배출']) return;
  const s = samples.at(-1), el = s.t - chargeAt, r = ror('bt');
  if (el < 70 || r == null) return;
  const msgs = [];
  // 다음 버너 단계 미리 알림: 지연 45초를 감안해 RoR로 도착 시간을 예측
  const steps = lastRec?.steps || [];
  const next = steps.findIndex(x => x.bt > s.bt);
  if (next >= 0 && r > 0) {
    const eta = (steps[next].bt - s.bt) / r * 60;
    if (eta < 45 && saidStep < next) { saidStep = next; msgs.push(`약 ${Math.round(eta)}초 뒤 BT ${steps[next].bt}°C: 버너 ${steps[next].burner}%로 바꿀 준비`); }
  }
  // 1차 크랙 전후 RoR 경고
  const fc = events['1차 크랙'];
  if (!fc && s.bt > 170 && r < 5) msgs.push(`RoR ${r.toFixed(1)}로 낮아요. 1차 크랙 전 정체(베이크) 위험: 버너를 조금 올리는 것 고려`);
  if (fc) {
    const dev = s.t - fc.t, rf = samples.filter(x => x.t > s.t - 15);
    if (rf.length > 3 && r > (ror.prev ?? r) + 1.5 && dev > 20) msgs.push('1차 크랙 뒤 RoR이 다시 오르고 있어요(플릭). 버너를 줄이세요');
    // 현장 판단 (부자 가이드 기준, 추천의 DT·상승폭을 따른다): 1순위 배출점(1차 크랙 온도 + 상승폭), 2순위 상승폭, 3순위 DT 55~65초
    const rise = lastRec?.rise ?? 8, dt = lastRec?.dtSec ?? 60, goal = fc.bt + rise, up = s.bt - fc.bt;
    msgs.push(`1차 크랙 뒤 ${Math.round(dev)}초 · +${up}도 (목표 +${rise}도 = ${goal}°C, DT ${dt}초)`);
    if (s.bt >= goal && dev < dt - 5) msgs.push('목표 온도에 일찍 도착했어요. 시간 맞추려 끌지 말고 배출하세요');
    else if (s.bt >= goal - 1 && dev >= dt - 5) msgs.push('지금 배출 타이밍이에요');
    else if (dev >= dt && s.bt < goal) msgs.push(goal - s.bt <= 2 && r > 3 ? `${goal - s.bt}도 부족: RoR이 괜찮으면 5~10초만 더` : '시간이 넘었어요. 더 끌면 향이 평평해져요. 배출하고 다음엔 1차 크랙 전 에너지를 올리세요');
    if (s.bt > goal) msgs.push('목표 상승폭을 넘었어요. 바로 배출 (다음 배치는 1차 크랙 전 에너지 줄이기)');
  }
  ror.prev = r;
  if (msgs.length && s.t - lastCoach > 8) { lastCoach = s.t; coach(msgs.join('\n')); }
};

window.onMark = async name => {
  if (name === '투입') { saidStep = -1; coach('투입! TP는 보통 55초쯤이에요.' + (lastRec ? ` 목표 곡선(점선)을 따라가 보세요.` : '')); }
  if (name === '1차 크랙') {
    const fc = events['1차 크랙'], el = fc.t - chargeAt;
    const rise = lastRec?.rise ?? 8, dt = lastRec?.dtSec ?? 60;
    coach(`1차 크랙 ${mmss(el)}, ${fc.bt}°C. 목표: ${dt}초 동안 +${rise}도 → ${fc.bt + rise}°C에서 ${mmss(el + dt)}쯤 배출` +
      (lastRec?.drop && Math.abs(lastRec.drop - (fc.bt + rise)) >= 2 ? `\n부자 앱 자동 배출은 ${lastRec.drop}°C로 돼 있어요. 차이가 크면 앱에서 직접 배출하세요` : ''));
  }
  if (name === '배출') {
    const fc = events['1차 크랙'], d = events['배출'];
    const rec = {
      source: 'web', date: new Date().toISOString().slice(0, 16).replace('T', ' '), bean: readBean(),
      charge: events['투입']?.bt, fc: fc ? `${fc.bt}@${mmss(fc.t - chargeAt)}` : null, drop: `${d.bt}@${mmss(d.t - chargeAt)}`,
      dtr: fc ? +((d.t - fc.t) / (d.t - chargeAt) * 100).toFixed(1) : null, rec: lastRec && { charge: lastRec.charge, steps: lastRec.steps, drop: lastRec.drop },
      curve: samples.filter((_, i) => i % 5 === 0).map(s => [Math.round(s.t - chargeAt), s.bt, s.et, s.burner, s.damper]), damperLog: damperLog.map(d => [Math.round(d.t - chargeAt), d.v]),
    };
    const all = store.get('myRoasts', []); all.push(rec); store.set('myRoasts', all.slice(-100));
    coach('로스팅 기록을 이 기기에 저장했어요. AI 리뷰는 아래 AI 로스팅 도우미 칸에 나와요.');
    review(rec);
  }
};

// ---------- 화면 연결 ----------
$('recBtn').onclick = recommend;
$('askBtn').onclick = () => { const q = $v('ask'); $('ask').value = ''; ask(q); };
$('ask').addEventListener('keydown', e => { if (e.key === 'Enter') $('askBtn').click(); });
$('keySave').onclick = () => {
  const k = $v('key').replace(/\s+/g, '');
  if (k.length < 20) { $('key').placeholder = '키 칸이 비어 있어요. 키를 붙여넣고 저장하세요'; log('키 저장 안 됨: 칸이 비어 있음'); return; }
  store.set('gemKey', k); $('key').value = ''; $('key').placeholder = `저장됨 (${k.slice(0, 4)}…${k.slice(-4)})`; log('API 키 저장됨');
};
{ const k = store.get('gemKey', ''); $('key').placeholder = k ? `저장됨 (${k.slice(0, 4)}…${k.slice(-4)}) 바꾸려면 새로 입력` : '여기에 키 붙여넣기 (AQ... 또는 AIza...)'; }
$('histFile').onchange = async e => {
  try {
    const rows = JSON.parse(await e.target.files[0].text());
    store.set('myHistory', rows); $('histInfo').textContent = `기록 ${rows.length}개 불러옴`;
  } catch (err) { $('histInfo').textContent = '불러오기 실패: ' + err.message; }
};
{ const n = store.get('myHistory', []).length; if (n) $('histInfo').textContent = `기록 ${n}개 있음`; }
// 배전도 기본값이 'AI가 정하기'로 바뀌었으니 예전에 저장된 배전도는 한 번 지운다
if (!store.get('levelV2', false)) { try { localStorage.removeItem('bean_bLevel'); } catch {} store.set('levelV2', true); }
// 입력한 생두 정보 기억
['bName', 'bOrigin', 'bProcess', 'bMoist', 'bAmt', 'bLevel', 'bBrew', 'bTaste'].forEach(id => {
  const saved = store.get('bean_' + id, null); if (saved != null) $(id).value = saved;
  $(id).addEventListener('change', () => store.set('bean_' + id, $(id).value));
});
// ---------- 생두 목록 ----------
const BEAN_FIELDS = { name: 'bName', origin: 'bOrigin', process: 'bProcess', moist: 'bMoist', amt: 'bAmt', level: 'bLevel', brew: 'bBrew', taste: 'bTaste' };
const PROCESSES = ['워시드', '내추럴', '허니', '무산소(애너로빅)'];
function guessBean(name) {
  // 기록 이름에서 산지·가공을 대충 추정 (예: "파나마 라 후이카 옐로우 카투아이 내추럴")
  const origins = [...$('originList').options].map(o => o.value).filter(o => !/버번|카투|게이샤|티피카|시드라|SL|7411|파카마라|블렌드/.test(o));
  const origin = origins.find(o => name.includes(o.split(' ')[0])) || (/게이샤/.test(name) ? '게이샤' : '');
  const process = name.includes('네추럴') || name.includes('내추럴') ? '내추럴' : name.includes('워시드') ? '워시드' : name.includes('허니') ? '허니' : /무산소|애너로빅/.test(name) ? '무산소(애너로빅)' : '';
  return { name, origin, process };
}
function beanList() {
  const saved = store.get('beans', []);
  const fromHist = [...new Set(store.get('myHistory', []).map(r => (r.name || '').trim()).filter(n => n && !/^# ?\d+$/.test(n)))]
    .map(n => n.replace(/\s*\d+차$/, '').trim())
    .filter((n, i, a) => a.indexOf(n) === i && !saved.some(b => b.name === n))
    .map(guessBean);
  return { saved, fromHist };
}
function renderBeans() {
  const { saved, fromHist } = beanList(), sel = $('beanPick');
  sel.innerHTML = '<option value="">내 생두에서 고르기</option>' +
    (saved.length ? `<optgroup label="저장한 생두">${saved.map((b, i) => `<option value="s${i}">${b.name}</option>`).join('')}</optgroup>` : '') +
    (fromHist.length ? `<optgroup label="예전 로스팅 기록에서">${fromHist.map((b, i) => `<option value="h${i}">${b.name}</option>`).join('')}</optgroup>` : '');
}
$('beanPick').onchange = () => {
  const v = $('beanPick').value; if (!v) return;
  const { saved, fromHist } = beanList();
  const b = v[0] === 's' ? saved[+v.slice(1)] : fromHist[+v.slice(1)];
  for (const [k, id] of Object.entries(BEAN_FIELDS)) if (b[k] != null && b[k] !== '') { $(id).value = b[k]; store.set('bean_' + id, b[k]); }
  if (b.process && !PROCESSES.includes(b.process)) $('bProcess').value = '기타';
  const prof = store.get('beanProfiles', {})[b.name];
  if (prof) { lastRec = prof; store.set('lastRec', prof); renderRec(); log('이 생두의 지난 프로파일을 불러왔어요'); }
  syncChips();
};
$('beanSave').onclick = () => {
  const b = readBean(); if (!b.name) { alertBox('생두 이름을 먼저 넣어주세요'); return; }
  const saved = store.get('beans', []).filter(x => x.name !== b.name); saved.push(b);
  store.set('beans', saved); renderBeans(); log('생두 저장: ' + b.name);
};
$('beanDel').onclick = () => {
  const v = $('beanPick').value; if (!v.startsWith('s')) return;
  const saved = store.get('beans', []); saved.splice(+v.slice(1), 1); store.set('beans', saved); renderBeans();
};
const alertBox = t => { $('rec').style.whiteSpace = 'pre-wrap'; $('rec').textContent = t; };

// 이름을 안 적으면 산지 + 가공으로
const autoName = () => { if (!$v('bName') && $v('bOrigin')) { $('bName').value = `${$v('bOrigin')} ${$v('bProcess')}`; store.set('bean_bName', $('bName').value); } };
['bOrigin', 'bProcess'].forEach(id => $(id).addEventListener('change', autoName));

// 생두 봉투·라벨·판매 페이지 사진 → Gemini가 읽어서 칸 채우기
async function imageToBase64(file) {
  // 큰 사진은 1280px로 줄여서 보낸다
  const img = await createImageBitmap(file), k = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
}
$('beanPhoto').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  alertBox('사진에서 생두 정보를 읽는 중...');
  try {
    const data = await imageToBase64(f);
    const r = await gemini([{ role: 'user', parts: [
      { inlineData: { mimeType: 'image/jpeg', data } },
      { text: `이 사진은 커피 생두 봉투, 라벨, 또는 판매 페이지다. 읽을 수 있는 정보만 JSON으로 답해라. 모르면 빈 문자열.
{"name":"짧은 생두 이름(한국어, 예: 콜롬비아 핀카 아나야 워시드)","origin":"산지/농장/품종","process":"워시드|내추럴|허니|무산소(애너로빅)|기타 중 하나","moist":"수분 % 숫자만","notes":"컵노트나 고도 등 참고 정보 짧게"}` },
    ] }], { json: true });
    if (r.name) $('bName').value = r.name;
    if (r.origin) $('bOrigin').value = r.origin;
    if (r.process) $('bProcess').value = PROCESSES.includes(r.process) ? r.process : '기타';
    if (r.moist) $('bMoist').value = String(r.moist).replace(/[^\d.]/g, '');
    Object.values(BEAN_FIELDS).forEach(id => store.set('bean_' + id, $(id).value));
    alertBox(`사진에서 읽었어요: ${r.name || '-'} / ${r.origin || '-'} / ${r.process || '-'} / 수분 ${r.moist || '-'}${r.notes ? '\n참고: ' + r.notes : ''}\n맞으면 "이 생두 저장"을 눌러두세요.`);
  } catch (err) { alertBox('사진 읽기 실패: ' + err.message); }
  e.target.value = '';
};

// 맛 키워드: 눌러서 넣고 빼기
const TASTES = ['꽃향', '자스민', '과일향', '베리', '시트러스', '열대과일', '와인', '초콜릿', '카카오', '견과', '캐러멜', '꿀', '단맛 많이', '산미 밝게', '산미 부드럽게', '바디 가볍게', '바디 묵직', '크리미', '깔끔한 후미', '쓴맛 적게'];
function syncChips() {
  const cur = $v('bTaste');
  document.querySelectorAll('#tasteChips .chip').forEach(c => c.classList.toggle('on', cur.split(/,\s*/).includes(c.textContent)));
}
$('tasteChips').innerHTML = TASTES.map(t => `<span class="chip">${t}</span>`).join('');
$('tasteChips').onclick = e => {
  if (!e.target.classList.contains('chip')) return;
  const t = e.target.textContent, list = $v('bTaste').split(/,\s*/).filter(Boolean);
  const i = list.indexOf(t); i >= 0 ? list.splice(i, 1) : list.push(t);
  $('bTaste').value = list.join(', '); store.set('bean_bTaste', $('bTaste').value); syncChips();
};
$('bTaste').addEventListener('input', syncChips);

const _histChange = $('histFile').onchange;
$('histFile').onchange = async e => { await _histChange(e); renderBeans(); };
$('reviewLast').onclick = () => { const all = store.get('myRoasts', []); if (!all.length) return ($('review').textContent = '저장된 배치가 없어요'); review(all.at(-1)); };
renderBeans();
syncChips();
renderRec();
loadWeather();

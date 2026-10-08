// 부자 AI 로스팅: Gemini 프로파일 추천 · 채팅 · 로스팅 중 안내 · 끝난 뒤 리뷰
// index.html 전역(samples, events, chargeAt, ror, draw, log, $)을 그대로 쓴다

const MODELS = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite'];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// 2026-10-08 태블릿 기록 58개에서 뽑은 규칙 (원본 기록은 넣지 않음)
const LEARNED = `
[이 로스터: 부자로스터 B30s 스마트, 전기식 드럼, 100~300g(최대 350g), 버너 0~100%, 댐퍼는 수동 원형 다이얼(보통 풀개방), 사용자가 화면에 개방 %를 기록함. 투입은 레버(수동), 1·2차 크랙은 귀로 듣고 버튼, 배출은 자동]
- 전기 히터라 버너를 바꿔도 온도 반응이 30~60초 늦다. 버너는 목표 온도보다 미리 바꿔야 한다.
- 부자 앱 "프로파일 설정 모드" = 'BT가 X도가 되면 버너 Y%' 단계들 + 배출 온도(자동 배출). 시작 버너는 100% 또는 지정값.
- TP(터닝포인트)는 투입 온도와 상관없이 늘 53~60초.
- 투입 온도별 평균: 160~175도 → 1차 크랙 10.0분/배출 11.8분, 176~195도 → 8.9분/11.1분, 196~212도 → 6.6분/8.5분, 213~245도 → 7.1분/9.1분.
- 사용자 메모 규칙: 200g은 투입 210도, 300g은 투입 215도. 200g에 215도는 너무 빨랐다(총 5:55). 300g에 200도 투입 + 152→80%,175→60%,189→30%는 화력 부족으로 1차 크랙 뒤 7도 오르는 데 2분 넘게 걸렸다.
- 최근 주로 쓰는 단계(7월 말~9월): 투입 210~215, BT 152~155도→80%, 175~177도→60%, 186~190도→30%, 배출 193~202도, 총 6~9분.
- 간편 모드 강배전 블렌드(소프트 캐러멜): 투입 183, 배출 218, 1차 크랙 8:48~9:30, 배출 11:47~12:40, DTR 25%로 매우 일정.
- 게이샤류 라이트 로스팅은 1차 크랙 뒤 52~75초, DTR 12~15%로 짧은 편이었다(언더 위험). 라이트라도 DTR 15~20%, 1차 크랙 뒤 75~100초를 권장.
- 실패 기록: 버너 40% 시작은 190도 근처에서 온도가 정체(17분). 투입 240 + 버너 70%는 너무 빠름(1차 크랙 5:46).
- 1차 크랙은 보통 BT 185~192도에서 들림.`;

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
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
      });
      if (!r.ok) { lastErr = new Error(`${m} ${r.status}`); if ([404, 429, 500, 503].includes(r.status)) continue; throw lastErr; }
      const j = await r.json();
      const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
      log('AI 모델: ' + m);
      return json ? JSON.parse(text.replace(/^```json\s*|```$/g, '')) : text;
    } catch (e) { lastErr = e; if (!/\b(404|429|500|503)\b|Failed to fetch/.test(e.message)) break; }
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

function beanText() {
  return `생두: ${$v('bName') || '(이름 없음)'} / 산지·품종: ${$v('bOrigin') || '-'} / 가공: ${$v('bProcess')} / 수분: ${$v('bMoist') || '모름'}% / 투입량: ${$v('bAmt') || '300'}g / 원하는 배전도: ${$v('bLevel')} / 원하는 맛: ${$v('bTaste') || '-'}`;
}
const wxText = () => WX ? `오늘 날씨(${WX.where}): ${WX.temp}°C, 습도 ${WX.rh}%, 기압 ${WX.hpa}hPa` : '날씨 정보 없음';

const SYSTEM = `너는 스페셜티 커피 로스팅 전문가이자 사용자의 로스팅 코치다. 사용자는 홈로스터로 부자로스터 B30s를 쓴다.
아래 이 로스터와 사용자 기록에서 나온 규칙을 꼭 반영해라.${LEARNED}
답은 한국어로, 짧고 실용적으로. 숫자는 구체적으로. 굵은 글씨(**)와 표는 쓰지 마라.`;

// ---------- 프로파일 추천 ----------
async function recommend() {
  const btn = $('recBtn'); btn.disabled = true; $('rec').textContent = 'AI가 생두와 기록을 보고 프로파일을 짜는 중...';
  try {
    const prompt = `${beanText()}
${wxText()}
사용자 개별 기록:
${historyText()}

이 생두를 부자 앱 "프로파일 설정 모드"에 바로 입력할 수 있게 추천해라. 버너 단계는 2~4개, 전기 히터 지연을 감안해 미리 줄여라.
JSON으로만 답해라:
{"summary":"한두 문장 요약","charge":투입온도,"startBurner":시작버너%,"damper":"댐퍼 개방 % 추천(예: 처음 50 → 1차 크랙 전 100)","steps":[{"bt":온도,"burner":%}],"drop":배출온도,
"expected":{"tpSec":초,"tpTemp":온도,"fcSec":초,"fcTemp":온도,"dropSec":초},"dtr":목표DTR%,
"why":["이유 2~4개"],"watch":["로스팅 중 볼 것 2~4개(언제 무엇을 하면 되는지)"],"flavor":"예상되는 맛"}`;
    const r = await gemini([{ role: 'user', parts: [{ text: prompt }] }], { json: true, system: SYSTEM });
    lastRec = { ...r, bean: readBean(), at: new Date().toISOString() };
    store.set('lastRec', lastRec);
    renderRec();
  } catch (e) { $('rec').textContent = '추천 실패: ' + e.message; }
  btn.disabled = false;
}

const readBean = () => ({ name: $v('bName'), origin: $v('bOrigin'), process: $v('bProcess'), moist: $v('bMoist'), amt: $v('bAmt'), level: $v('bLevel'), taste: $v('bTaste') });
const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function renderRec() {
  const r = lastRec; if (!r) return;
  const e = r.expected || {};
  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  $('rec').innerHTML = `
    <div>${esc(r.summary)}</div>
    <div class="note" style="margin-top:8px">부자 앱 프로파일 설정 모드에 이렇게 넣으세요</div>
    <div class="steps">
      <span class="step">투입 ${esc(r.charge)}°C</span>
      <span class="step">시작 버너 ${esc(r.startBurner ?? 100)}%</span>
      ${(r.steps || []).map(s => `<span class="step">BT ${esc(s.bt)}°C → ${esc(s.burner)}%</span>`).join('')}
      <span class="step">배출 ${esc(r.drop)}°C</span>
      ${r.damper ? `<span class="step">댐퍼 ${esc(r.damper)}</span>` : ""}
    </div>
    <div class="note">예상: TP ${e.tpSec ? mmss(e.tpSec) : '-'} · 1차 크랙 ${e.fcTemp || '-'}°C ${e.fcSec ? mmss(e.fcSec) : '-'} · 배출 ${e.dropSec ? mmss(e.dropSec) : '-'} · DTR ${esc(r.dtr)}%</div>
    <div style="margin-top:8px">왜 이렇게?<br>${(r.why || []).map(x => '· ' + esc(x)).join('<br>')}</div>
    <div style="margin-top:8px">볶는 중 볼 것<br>${(r.watch || []).map(x => '· ' + esc(x)).join('<br>')}</div>
    <div style="margin-top:8px">예상 맛: ${esc(r.flavor)}</div>`;
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
  const ctx = `${beanText()}\n${wxText()}\n${liveText()}\n${lastRec ? '최근 AI 추천: ' + JSON.stringify({ charge: lastRec.charge, steps: lastRec.steps, drop: lastRec.drop, expected: lastRec.expected }) : ''}\n${link || ''}\n사용자 개별 기록(최근):\n${historyText(25)}`;
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
    const target = lastRec?.dtr;
    if (target) {
      const need = (target / 100 * (fc.t - chargeAt)) / (1 - target / 100);
      if (dev > need - 15 && dev < need) msgs.push(`목표 DTR ${target}%까지 약 ${Math.round(need - dev)}초. 배출 준비`);
    }
    if (lastRec?.drop && s.bt >= lastRec.drop - 2) msgs.push(`배출 목표 ${lastRec.drop}°C 근처예요`);
  }
  ror.prev = r;
  if (msgs.length && s.t - lastCoach > 8) { lastCoach = s.t; coach(msgs.join('\n')); }
};

window.onMark = async name => {
  if (name === '투입') { saidStep = -1; coach('투입! TP는 보통 55초쯤이에요.' + (lastRec ? ` 목표 곡선(점선)을 따라가 보세요.` : '')); }
  if (name === '1차 크랙') {
    const fc = events['1차 크랙'], el = fc.t - chargeAt;
    const tgt = lastRec?.dtr || 18;
    const devSec = Math.round(tgt / 100 * el / (1 - tgt / 100));
    coach(`1차 크랙 ${mmss(el)}, ${fc.bt}°C. DTR ${tgt}%면 약 ${devSec}초 뒤(${mmss(el + devSec)}) 배출`);
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
    coach('로스팅 기록을 이 기기에 저장했어요. AI 리뷰를 아래 채팅에 올릴게요.');
    ask(`방금 로스팅이 끝났어. 결과를 추천과 비교해서 잘된 점, 아쉬운 점, 다음 배치에서 바꿀 것 1~3개를 알려줘. 곡선 요약[초,BT,ET,버너,댐퍼]: ${JSON.stringify(rec.curve.filter((_, i) => i % 3 === 0))}`);
  }
};

// ---------- 화면 연결 ----------
$('recBtn').onclick = recommend;
$('askBtn').onclick = () => { const q = $v('ask'); $('ask').value = ''; ask(q); };
$('ask').addEventListener('keydown', e => { if (e.key === 'Enter') $('askBtn').click(); });
$('keySave').onclick = () => { store.set('gemKey', $v('key')); $('key').value = ''; $('key').placeholder = '저장됨'; log('API 키 저장됨'); };
if (store.get('gemKey', '')) $('key').placeholder = '저장됨 (바꾸려면 새로 입력)';
$('histFile').onchange = async e => {
  try {
    const rows = JSON.parse(await e.target.files[0].text());
    store.set('myHistory', rows); $('histInfo').textContent = `기록 ${rows.length}개 불러옴`;
  } catch (err) { $('histInfo').textContent = '불러오기 실패: ' + err.message; }
};
{ const n = store.get('myHistory', []).length; if (n) $('histInfo').textContent = `기록 ${n}개 있음`; }
// 입력한 생두 정보 기억
['bName', 'bOrigin', 'bProcess', 'bMoist', 'bAmt', 'bLevel', 'bTaste'].forEach(id => {
  const saved = store.get('bean_' + id, null); if (saved != null) $(id).value = saved;
  $(id).addEventListener('change', () => store.set('bean_' + id, $(id).value));
});
// ---------- 생두 목록 ----------
const BEAN_FIELDS = { name: 'bName', origin: 'bOrigin', process: 'bProcess', moist: 'bMoist', amt: 'bAmt', level: 'bLevel', taste: 'bTaste' };
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
const alertBox = t => { $('rec').textContent = t; };

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
renderBeans();
syncChips();
renderRec();
loadWeather();

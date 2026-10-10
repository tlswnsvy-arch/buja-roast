// 📑 원두 결산 보고서 (2026-10-11)
// 한 생두를 여러 번 볶은 뒤, 1차→2차→… 무엇을 바꿨고 결과(곡선·맛)가 어떻게 달라졌는지, 그래서 결론이 뭔지 한 장으로.
// 바꾼 값과 곡선 숫자는 앱이 직접 계산해서 넘기고(정확하게), AI 는 흐름을 읽고 결론만 쓴다. 맛 평가가 없는 배치는 맛을 지어내지 않는다.
window.BEANREPORT = (() => {
  const $ = id => document.getElementById(id);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const roasts = () => { try { return JSON.parse(localStorage.getItem('myRoasts') || '[]'); } catch { return []; } };
  const saved = () => { try { return JSON.parse(localStorage.getItem('beanReports') || '{}'); } catch { return {}; } };
  const save = o => { try { localStorage.setItem('beanReports', JSON.stringify(o)); } catch {} };
  const nameOf = r => (r.bean?.name || '').trim();
  const sec = s => { const [m, x] = String(s || '').split(':'); return x == null ? null : +m * 60 + +x; };

  // 두 번 이상 볶은 생두 (최근 순)
  function beans() {
    const m = new Map();
    roasts().forEach(r => { const n = nameOf(r); if (!n) return; const v = m.get(n) || { n, count: 0, last: 0 }; v.count++; v.last = Math.max(v.last, r.ts || 0); m.set(n, v); });
    return [...m.values()].filter(v => v.count >= 2).sort((a, b) => b.last - a.last);
  }

  // 배치마다 앱이 계산한 사실 (AI 에 그대로 넘긴다)
  function facts(name) {
    const list = roasts().filter(r => nameOf(r) === name).sort((a, b) => (a.ts || 0) - (b.ts || 0));
    return list.map((r, i) => {
      const fc = (r.fc || '').split('@'), dr = (r.drop || '').split('@');
      const cup = [window.CUP?.text?.(r), r.cupping].filter(Boolean).join(' / ');
      return {
        n: i + 1, date: r.date, amt: r.bean?.amt,
        recipe: r.rec ? { charge: r.rec.charge, startBurner: r.rec.startBurner, steps: r.rec.steps, drop: r.rec.drop, rise: r.rec.rise, dtSec: r.rec.dtSec } : null,
        changed: i && typeof recDiff === 'function' ? (recDiff(list[i - 1].rec, r.rec) || '레시피 같음') : '첫 배치',
        tp: r.tp, fcTemp: +fc[0] || null, fcTime: fc[1] || null, dropTemp: +dr[0] || null, dropTime: dr[1] || null,
        dtSec: sec(dr[1]) != null && sec(fc[1]) != null ? sec(dr[1]) - sec(fc[1]) : null, dtr: r.dtr,
        hands: (r.hands || []).length ? r.hands : undefined,
        taste: cup || '맛 평가 없음',
      };
    });
  }

  async function make(name) {
    const out = $('brOut'); const f = facts(name); $('brMake').disabled = true;
    if (f.length < 2) { out.innerHTML = '<div class="note">두 번 이상 볶은 생두만 결산할 수 있어요.</div>'; return; }
    out.innerHTML = `<div class="note">AI가 ${f.length}번의 배치를 처음부터 끝까지 읽고 결산하는 중...</div>`;
    try {
      const j = await gemini([{ role: 'user', parts: [{ text: `이 생두를 ${f.length}번 볶았다. 생두: ${name}
배치 기록(앱이 계산한 사실, 숫자는 그대로 믿어라): ${JSON.stringify(f)}
이 생두 한 봉을 다 볶은 결산 보고서를 써라. 사용자는 초보 홈로스터라 쉬운 말로.
규칙: 맛은 taste 에 적힌 것만 근거로 쓴다. '맛 평가 없음'인 배치의 맛은 절대 지어내지 말고 result 에 곡선 결과만 쓰고 verdict 는 "unknown".
배치 사이에 레시피가 같았으면 '같은 레시피로 재현성 확인'처럼 그 의미를 쓴다. hands 가 있으면 사람이 손댄 점도 언급한다.
JSON으로만: {"title":"보고서 제목 (생두 이름 짧게 + 결산)","oneLine":"한 줄 요약",
"batches":[{"n":1,"change":"이전 배치 대비 바꾼 것 (짧게)","result":"곡선 결과 (1차·배출·DT 등 짧게)","taste":"맛 결과 (평가 없으면 '평가 없음')","verdict":"better|worse|same|unknown","note":"한 문장 해석"}],
"trend":["배치를 거치며 보인 흐름 1~3개 (예: 버너를 낮추니 1차가 늦어지고 산미가 부드러워짐)"],
"best":{"n":2,"why":"가장 좋았던 배치와 이유 (맛 평가가 없으면 곡선 기준이라고 밝힌다)"},
"conclusion":"결론 2~3문장",
"recipe":{"charge":210,"startBurner":100,"steps":[{"bt":150,"burner":80}],"drop":196,"rise":8,"dtSec":60},
"nextTime":"다음에 이 생두를 사면 이렇게 시작하라 (1~2문장)",
"missing":["더 정확한 결론에 모자랐던 것 (예: 3·4차 맛 평가 없음)"]}` }] }], { json: true, system: typeof SYSTEM === 'string' ? SYSTEM : '' });
      const all = saved(); all[name] = { at: Date.now(), facts: f, report: j }; save(all);
      draw();
      toHajipsa(name, j);
    } catch (e) { out.innerHTML = '<div class="note">결산을 못 만들었어요: ' + esc(e.message) + '</div>'; }
    $('brMake').disabled = false;
  }

  const BADGE = { better: ['좋아짐', '#5fd39a'], worse: ['나빠짐', '#ff8a7a'], same: ['비슷함', '#c9c3b6'], unknown: ['맛 평가 없음', '#8f8a80'] };

  // 배치별 1차 크랙 시간·배출 시간·DTR 을 작은 그래프로 (같은 축, 점+선)
  function chart(f) {
    const W = 520, H = 150, P = 34, n = f.length;
    const x = i => P + (n === 1 ? 0 : i * (W - 2 * P) / (n - 1));
    const series = [
      { k: '1차 크랙', c: '#e0904a', v: f.map(b => sec(b.fcTime)) },
      { k: '배출', c: '#7DE3C3', v: f.map(b => sec(b.dropTime)) },
    ];
    const vals = series.flatMap(s => s.v).filter(v => v != null);
    if (!vals.length) return '';
    const lo = Math.min(...vals) - 15, hi = Math.max(...vals) + 15, y = v => H - 22 - (v - lo) * (H - 44) / (hi - lo || 1);
    const mmss = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    let g = '';
    series.forEach(s => {
      const pts = s.v.map((v, i) => v == null ? null : [x(i), y(v)]).filter(Boolean);
      g += `<polyline fill="none" stroke="${s.c}" stroke-width="2.5" points="${pts.map(p => p.join(',')).join(' ')}"/>`;
      s.v.forEach((v, i) => { if (v != null) g += `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${s.c}"/><text x="${x(i)}" y="${y(v) - 8}" fill="${s.c}" font-size="11" text-anchor="middle">${mmss(v)}</text>`; });
    });
    f.forEach((b, i) => { g += `<text x="${x(i)}" y="${H - 4}" fill="currentColor" opacity=".7" font-size="12" text-anchor="middle">${b.n}차</text>`; });
    const legend = series.map(s => `<span style="color:${s.c}">● ${s.k}</span>`).join(' &nbsp; ');
    return `<div class="brChart"><div class="note">${legend} (볶기 시작부터 걸린 시간)</div><svg viewBox="0 0 ${W} ${H}" width="100%" style="color:var(--text)">${g}</svg></div>`;
  }

  function render(name) {
    const out = $('brOut'), s = saved()[name];
    if (!s) { out.innerHTML = ''; return; }
    const j = s.report, f = s.facts;
    const rows = (j.batches || []).map(b => {
      const fb = f.find(x => x.n === b.n) || {}, bd = BADGE[b.verdict] || BADGE.unknown;
      return `<tr><td><b>${b.n}차</b><div class="note">${esc((fb.date || '').slice(5, 10))}</div></td><td>${esc(b.change)}</td><td>${esc(b.result)}</td><td>${esc(b.taste)}</td><td><span class="brBadge" style="background:${bd[1]}">${bd[0]}</span></td></tr>
        ${b.note ? `<tr class="brNote"><td></td><td colspan="4">${esc(b.note)}</td></tr>` : ''}`;
    }).join('');
    const r = j.recipe || {};
    out.innerHTML = `<div class="brPaper">
      <div class="row"><h3 style="flex:1;margin:0">${esc(j.title || name + ' 결산')}</h3><button id="brRead">🔊 읽어주기</button></div>
      <div class="note">${esc(name)} · ${f.length}배치 · ${esc(f[0].date?.slice(0, 10))} ~ ${esc(f[f.length - 1].date?.slice(0, 10))} · 만든 날 ${new Date(s.at).toLocaleDateString('ko-KR')}</div>
      <p class="brOne">${esc(j.oneLine)}</p>
      ${chart(f)}
      <div class="brScroll"><table class="logtbl brTbl"><tr><th>차수</th><th>바꾼 것</th><th>곡선 결과</th><th>맛</th><th>판정</th></tr>${rows}</table></div>
      <h4>흐름</h4><ul>${(j.trend || []).map(t => '<li>' + esc(t) + '</li>').join('')}</ul>
      ${j.best ? `<h4>가장 좋았던 배치</h4><p><b>${j.best.n}차</b> · ${esc(j.best.why)}</p>` : ''}
      <h4>결론</h4><p>${esc(j.conclusion)}</p>
      <h4>이 생두 최종 레시피</h4><p class="brRecipe">투입 ${r.charge}° · 시작 버너 ${r.startBurner ?? 100}% · ${(r.steps || []).map(x => x.bt + '°→' + x.burner + '%').join(' · ')} · 배출 ${r.drop}° · 크랙 뒤 +${r.rise}° · DT ${r.dtSec}초</p>
      ${j.nextTime ? `<h4>다음에 이 생두를 사면</h4><p>${esc(j.nextTime)}</p>` : ''}
      ${(j.missing || []).length ? `<h4>더 정확해지려면</h4><ul>${j.missing.map(t => '<li>' + esc(t) + '</li>').join('')}</ul>` : ''}
    </div>`;
    $('brRead').onclick = () => { ALARM.unlock(); ALARM.stopSpeaking?.(); ALARM.speak(speech(j)); };
  }

  const sent = s => { s = String(s || '').trim().replace(/[.。\s]+$/, ''); return s ? s + '.' : ''; };
  function speech(j) {
    return [sent(j.title), sent(j.oneLine), '배치별로 볼게요. ¶ ' + (j.batches || []).map(b => sent(b.n + '차, ' + b.change) + ' ' + sent(b.taste === '평가 없음' ? b.result : b.taste)).join(' '),
      (j.trend || []).length ? '흐름. ¶ ' + j.trend.map(sent).join(' ') : '', '결론. ¶ ' + sent(j.conclusion), j.nextTime ? '다음에 이 생두를 사면. ¶ ' + sent(j.nextTime) : ''].filter(Boolean).join(' ¶ ');
  }
  // 하집사 '다시 듣기'에도 (마지막 배치 날짜로)
  function toHajipsa(name, j) {
    const s = saved()[name]; const last = s?.facts?.[s.facts.length - 1];
    const ts = roasts().filter(r => nameOf(r) === name).reduce((m, r) => Math.max(m, r.ts || 0), 0);
    if (window.hjItem) hjItem('report', '원두 결산', speech(j), name + (last?.amt ? ' ' + last.amt + 'g' : ''), ts || Date.now());
  }

  // 맛 평가가 빠진 배치를 미리 알려 준다 (결론이 곡선만으로 나오지 않게)
  function warn(name) {
    const box = $('brWarn'); if (!box) return;
    const f = name ? facts(name) : [];
    const miss = f.filter(b => b.taste === '맛 평가 없음').map(b => b.n + '차(' + (b.date || '').slice(5, 10) + ')');
    box.innerHTML = miss.length ? `<div class="brWarn">☕ ${esc(miss.join(', '))}는 맛 평가가 없어요. 결산 전에 레시피 탭 맨 아래 맛 평가표에서 채우면 결론이 훨씬 정확해져요. 없으면 그 배치는 곡선만 보고 판단해요.</div>` : '';
  }
  function draw() {
    const sel = $('brBean'); if (!sel) return;
    const list = beans(), cur = sel.value;
    sel.innerHTML = list.length ? list.map(b => `<option value="${esc(b.n)}">${esc(b.n)} (${b.count}배치${saved()[b.n] ? ' · 결산 있음' : ''})</option>`).join('') : '<option value="">두 번 이상 볶은 생두가 아직 없어요</option>';
    if (cur && list.some(b => b.n === cur)) sel.value = cur;
    render(sel.value); warn(sel.value);
    $('brMake').disabled = !list.length;
    $('brMake').textContent = saved()[sel.value] ? '결산 다시 만들기' : '결산 만들기';
  }
  document.addEventListener('DOMContentLoaded', () => {});
  setTimeout(() => {
    if (!$('brBean')) return;
    $('brBean').onchange = () => draw();
    $('brMake').onclick = () => { const n = $('brBean').value; if (n) make(n); };
    draw();
    document.querySelectorAll('[data-tab="log"]').forEach(b => b.addEventListener('click', draw));
  }, 0);
  return { make, draw, facts, beans };
})();

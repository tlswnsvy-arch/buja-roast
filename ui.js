// 화면 정리: 탭, 로스팅 탭의 레시피 한 줄 요약, 배치 기록 표, 맛 평가를 배치에 저장
(() => {
  // 탭 전환 (마지막 탭 기억). 그래프는 보일 때 다시 그려야 크기가 맞는다
  const show = name => {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
    document.querySelectorAll('main > .tab').forEach(s => { s.hidden = s.id !== 'tab-' + name; });
    if (name === 'roast') draw();
    if (name === 'log') renderLog();
    try { localStorage.setItem('tab', name); } catch {}
    scrollTo({ top: 0 });
  };
  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
  window.showTab = show;

  // 로스팅 탭에서 지금 쓸 레시피를 한 줄로
  function recipeLine() {
    const r = lastRec, name = $v('bName');
    $('beanNow').textContent = '생두 ' + (name || '-');
    if (!r || !r.charge) { $('recipeLine').innerHTML = '레시피 탭에서 생두를 고르고 추천을 받으면 여기서 바로 볶을 수 있어요.'; return; }
    const steps = (r.steps || []).map(s => `${s.bt}°→${s.burner}%`).join(' · ');
    $('recipeLine').innerHTML = `<b>${name || '생두'}</b> ${$v('bAmt') || ''}g<br>투입 ${r.charge}° · 시작 ${r.startBurner ?? 100}% · ${steps} · 1차 크랙 뒤 +${r.rise ?? 8}° / DT ${r.dtSec ?? 60}초${r.edited ? ' <span style="color:var(--gold)">(고친 값)</span>' : ''} <a href="#" id="toRecipe" style="color:var(--et)">레시피 보기</a>`;
    $('toRecipe').onclick = e => { e.preventDefault(); show('recipe'); };
  }
  const origRender = window.renderRec;
  window.renderRec = function () { origRender(); recipeLine(); };
  $('bName').addEventListener('change', recipeLine);
  $('bAmt').addEventListener('change', recipeLine);

  // 배치 기록 표
  const parse = s => { const m = String(s || '').match(/([\d.]+)@(\d+):(\d+)/); return m ? { t: +m[1], s: +m[2] * 60 + +m[3] } : null; };
  function renderLog() {
    const all = (() => { try { return JSON.parse(localStorage.getItem('myRoasts') || '[]'); } catch { return []; } })();
    if (!all.length) { $('logTable').textContent = '아직 이 화면으로 볶은 기록이 없어요.'; return; }
    const esc = t => String(t ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const rows = all.map((r, i) => {
      const fc = parse(r.fc), dr = parse(r.drop);
      const dt = fc && dr ? dr.s - fc.s : null, rise = fc && dr ? Math.round(dr.t - fc.t) : null;
      // 저장된 date는 세계 표준시(UTC)라 한국 시간으로 바꿔 보여준다
      const d = r.ts ? new Date(r.ts) : new Date((r.date || '').replace(' ', 'T') + 'Z');
      const when = isNaN(d) ? '-' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return `<tr><td>${when}</td><td>${esc(r.bean?.name || '-')}<div class="note">${esc(r.bean?.amt || '')}${r.bean?.amt ? 'g' : ''}</div></td>
        <td>${esc(r.charge ?? '-')}°</td><td>${fc ? `${fc.t}° ${r.fc.split('@')[1]}` : '-'}</td><td>${dr ? `${dr.t}° ${r.drop.split('@')[1]}` : '-'}</td>
        <td>${dt != null ? dt + '초' : '-'}<div class="note">${rise != null ? '+' + rise + '°' : ''}</div></td><td>${r.dtr ?? '-'}%</td>
        <td class="cup">${esc(r.cupping || '')}<div><a href="#" data-cup="${i}" style="color:var(--et)">${r.cupping ? '고치기' : '맛 적기'}</a></div></td></tr>`;
    }).reverse().join('');
    $('logTable').innerHTML = `<table class="logtbl"><tr><th>날짜</th><th>생두</th><th>투입</th><th>1차 크랙</th><th>배출</th><th>DT·상승</th><th>DTR</th><th>맛 평가</th></tr>${rows}</table>`;
    $('logTable').querySelectorAll('[data-cup]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      const i = +a.dataset.cup, v = prompt('맛 평가', all[i].cupping || '');
      if (v == null) return;
      all[i].cupping = v.trim(); localStorage.setItem('myRoasts', JSON.stringify(all)); renderLog();
    }));
  }
  window.renderLog = renderLog;

  // 레시피 탭의 맛 평가는 마지막 배치에 저장
  $('cupNote').addEventListener('change', () => {
    try {
      const all = JSON.parse(localStorage.getItem('myRoasts') || '[]'); if (!all.length) return;
      all[all.length - 1].cupping = $v('cupNote'); localStorage.setItem('myRoasts', JSON.stringify(all));
    } catch {}
  });

  // 배출 뒤 기록 표 갱신
  const origMark = window.onMark;
  window.onMark = async name => { await origMark?.(name); if (name === '배출') renderLog(); };

  // 목소리 설정 (이 기기에 저장)
  for (const id of ['voiceMode', 'aiVoice']) {
    try { const v = localStorage.getItem(id); if (v) $(id).value = v; } catch {}
    $(id).addEventListener('change', () => { try { localStorage.setItem(id, $(id).value); } catch {} });
  }
  $('voiceTest').onclick = () => { ALARM.unlock(); ALARM.stopSpeaking(); ALARM.speak('투입 준비 완료. 생두를 넣으세요.'); };

  recipeLine();
  let first = 'roast'; try { first = localStorage.getItem('tab') || 'roast'; } catch {}
  show(first);
})();

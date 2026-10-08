// 화면 정리: 탭, 로스팅 탭의 레시피 한 줄 요약, 배치 기록 표, 맛 평가를 배치에 저장
(() => {
  // 탭 전환 (마지막 탭 기억). 그래프는 보일 때 다시 그려야 크기가 맞는다
  const show = name => {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
    document.querySelectorAll('main > .tab').forEach(s => { s.hidden = s.id !== 'tab-' + name; });
    if (name === 'roast') draw();
    if (name === 'log') renderLog();
    if (name === 'recipe') window.CUP?.render();
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
  window.renderRec = function () { origRender(); recipeLine(); window.tasteState?.(); };
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
        <td class="cup">${r.cup?.total ? `<div style="color:var(--gold)">${'★'.repeat(r.cup.total)}</div>` : ''}${esc(r.cupping || '')}${r.cuppingRaw ? `<details class="note"><summary>원문</summary>${esc(r.cuppingRaw)}</details>` : ''}<div><a href="#" data-cup="${i}" style="color:var(--et)">${r.cupping ? '고치기' : '맛 적기'}</a></div>${r.curve?.length ? `<div><a href="#" data-replay="${i}" style="color:var(--gold)">▶ 재생</a></div>` : ''}</td></tr>`;
    }).reverse().join('');
    $('logTable').innerHTML = `<table class="logtbl"><tr><th>날짜</th><th>생두</th><th>투입</th><th>1차 크랙</th><th>배출</th><th>DT·상승</th><th>DTR</th><th>맛 평가</th></tr>${rows}</table>`;
    $('logTable').querySelectorAll('[data-replay]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); REPLAY.open(all[+a.dataset.replay]); }));
    $('logTable').querySelectorAll('[data-cup]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      const i = +a.dataset.cup, v = prompt('맛 평가', all[i].cupping || '');
      if (v == null) return;
      all[i].cupping = v.trim(); delete all[i].cuppingRaw; localStorage.setItem('myRoasts', JSON.stringify(all)); renderLog();
      // 길게 적었으면 AI가 항목별로 정리 (원문은 cuppingRaw에 남김)
      if (v.trim().length >= 15) window.tidyCupSave?.(i).then(renderLog).catch(() => {});
    }));
  }
  window.renderLog = renderLog;

  // 레시피 탭의 맛 글은 평가표에서 고른 배치에 저장 (기본은 마지막 배치)
  $('cupNote').addEventListener('change', () => {
    try {
      const all = JSON.parse(localStorage.getItem('myRoasts') || '[]'); if (!all.length) return;
      const i = window.CUP?.idx() >= 0 ? CUP.idx() : all.length - 1;
      all[i].cupping = $v('cupNote'); delete all[i].cuppingRaw; localStorage.setItem('myRoasts', JSON.stringify(all));
      renderLog();
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
  // 맨 위 🔊/🔇: 음성 끄기 (삑 소리와 진동은 남김)
  // 음성 3단계: 🔉 중요한 것만(기본) → 🔊 전부 → 🔇 끔(삑 소리·진동만)
  const LEVELS = { key: '🔉 중요한 것만', all: '🔊 전부', off: '🔇 음성 끔' }, ORDER = ['key', 'all', 'off'];
  const showMute = () => { const lv = ALARM.level(); $('muteBtn').textContent = LEVELS[lv]; $('muteBtn').style.opacity = lv === 'off' ? '.7' : '1'; };
  $('muteBtn').onclick = () => {
    const next = ORDER[(ORDER.indexOf(ALARM.level()) + 1) % ORDER.length];
    try { localStorage.setItem('voiceLevel', next); localStorage.removeItem('mute'); } catch {}
    if (next === 'off') ALARM.stopSpeaking();
    showMute();
  };
  showMute();
  $('voiceTest').onclick = () => { ALARM.unlock(); ALARM.stopSpeaking(); ALARM.speak('투입 준비 완료. 생두를 넣으세요.'); };

  recipeLine();
  let first = 'roast'; try { first = localStorage.getItem('tab') || 'roast'; } catch {}
  show(first);
})();

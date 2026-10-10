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
  // 🔒 하집사 잠금 번호 (2026-10-11): 목소리를 바꾸거나 돈이 드는 미리 만들기 전에. 하집사가 없거나 잠금이 없으면 그냥 통과
  window.hjUnlock = async why => {
    try {
      const st = await (await fetch('http://127.0.0.1:8790/api/lock/state')).text();
      if (st !== 'locked') return true;
      const pin = prompt('🔒 하집사 잠금 번호' + (why ? ' · ' + why : '')); if (pin === null) return false;
      const ok = await (await fetch('http://127.0.0.1:8790/api/lock/unlock?pin=' + encodeURIComponent(pin))).text();
      if (ok !== 'ok') { alert('번호가 틀려요'); return false; }
      return true;
    } catch { return true; }
  };
  for (const id of ['voiceMode', 'aiVoice']) {
    try { const v = localStorage.getItem(id); if (v) $(id).value = v; } catch {}
    // 목소리 바꾸기는 잠금 번호가 맞아야 (틀리면 원래대로)
    $(id).addEventListener('change', async () => { const before = (() => { try { return localStorage.getItem(id); } catch { return null; } })(); if (id === 'voiceMode' && !(await window.hjUnlock('읽어주는 목소리 바꾸기'))) { if (before) $(id).value = before; return; } try { localStorage.setItem(id, $(id).value); } catch {} });
  }
  // 로스팅 중 하는 말 미리 녹음: 정해진 안내(배출, 1차 크랙 임박, 버너 N퍼센트, 댐퍼 N칸 …)를 일레븐랩스·Fish Audio 로 각각 한 번씩
  const PREP_FILL = () => { const ul = document.querySelector('.prepHow .prepList'); if (!ul) return; ul.innerHTML = PREP.map(t => '<li>' + t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]) + '</li>').join(''); document.querySelector('.prepHow .prepN').textContent = PREP.length; };
  const PREP = ['배출했어요', '쿨링 끝났어요', '80도 아래로 내려왔어요. 이제 기계를 꺼도 돼요. 채프통도 확인해 주세요',
    '곧 투입 온도예요. 생두를 준비하세요', '이제 생두를 넣으세요', '지금부터 마이야르 구간이에요.',
    '곧 1차 크랙이에요. 첫 크랙 들리면 버튼을 누르세요', '18분이 지났어요. 버너를 껐어요',
    '로스터가 다시 연결됐어요. 이어가려면 자동 이어가기를 누르세요', '화면을 벗어나서 버너를 껐어요. 이어가려면 자동 이어가기를 누르세요',
    '투입 준비 완료. 생두를 넣으세요.', '다음 배치를 시작해요. 채프통이 차 있지 않은지 확인해 주세요']
    .concat(Array.from({ length: 10 }, (_, i) => `댐퍼를 ${i + 1}칸으로 돌려 주세요`))
    .concat(Array.from({ length: 10 }, (_, i) => `지금부터 마이야르 구간이에요. 댐퍼를 ${i + 1}칸으로 돌리고 화면의 ${i + 1}을 눌러 주세요.`))
    .concat(Array.from({ length: 11 }, (_, i) => `버너 ${i * 10}퍼센트`));
  // 실수로 안 눌리게: 한 번 누르면 쓰는 양을 보여 주고, 5초 안에 한 번 더 눌러야 시작
  let prepArm = 0;
  if ($('voicePrep')) $('voicePrep').onclick = async () => {
    const b = $('voicePrep'), info = $('voicePrepInfo');
    if (Date.now() - prepArm > 5000) { prepArm = Date.now(); info.textContent = '일레븐랩스 최대 약 1,100자 사용 (이미 녹음된 건 빼고) · Fish Audio 무료. 5초 안에 한 번 더 누르면 시작'; setTimeout(() => { if (Date.now() - prepArm >= 5000) info.textContent = ''; }, 5100); return; }
    prepArm = 0;
    if (!(await window.hjUnlock('안내 소리 미리 만들기'))) return;
    b.disabled = true;
    const SRC = { saved: '이미 있어요', peer: '불러왔어요', new: '새로 만들었어요' };
    const r = await ALARM.hjPrepare(PREP, ['eleven', 'fish'], (n, total, p, t, s) => { info.textContent = `${n}/${total} · ${p === 'eleven' ? '일레븐랩스' : 'Fish Audio'} · ${t}${s ? ' → ' + SRC[s] : ' …'}`; });
    const c = r.cnt || {};
    info.textContent = r.down ? '하집사 앱이 꺼져 있어요. 이 기기에서 하집사를 켜고 다시 눌러 주세요'
      : `끝났어요 (${r.ok}/${r.total}) · 이미 있음 ${c.saved || 0} · 다른 기기에서 불러옴 ${c.peer || 0} · 새로 만듦 ${c.new || 0}. 다음부터 이 말들은 바로, 돈 안 들고 나와요`;
    b.disabled = false;
  };
  // ▶ 어떻게 되는지 보기: 미리 만들기를 가짜로 보여 준다. 사이트에 안 보내고 저장도 안 한다 (돈 0원, 2026-10-10)
  if ($('prepDemo')) $('prepDemo').onclick = () => {
    const ov = document.createElement('div'); ov.className = 'pdOv';
    ov.innerHTML = '<div class="pdBox"><div class="pdTag">미리보기 · 가짜 화면이에요 (돈 안 들어요)</div>' +
      '<div class="pdFlow"><div class="pdN" data-n="0">☕<b>로스팅 앱</b></div><i class="pdA"></i><div class="pdN" data-n="1">🏠<b>하집사</b></div><i class="pdA"></i><div class="pdN" data-n="2">🌐<b>사이트</b><small>일레븐랩스·Fish</small></div><i class="pdA"></i><div class="pdN" data-n="3">💾<b>이 기기에 저장</b></div></div>' +
      '<div class="pdCap"></div><div class="pdProg"></div><div class="pdSaved"></div>' +
      '<div class="pdBtns"><button class="pdClose">닫기</button></div></div>';
    document.body.appendChild(ov);
    let stop = false; const q = s => ov.querySelector(s);
    q('.pdClose').onclick = () => { stop = true; ov.remove(); };
    const on = n => ov.querySelectorAll('.pdN').forEach(e => e.classList.toggle('on', +e.dataset.n === n));
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const cap = t => { q('.pdCap').textContent = t; };
    const sample = ['배출했어요', '이제 생두를 넣으세요', '버너 50퍼센트', '댐퍼를 3칸으로 돌려 주세요', '곧 1차 크랙이에요. 첫 크랙 들리면 버튼을 누르세요'];
    (async () => {
      cap('1. 설정에서 "🎙 안내 소리 미리 만들어 두기"를 두 번 눌러요.'); on(0); await sleep(3500); if (stop) return;
      cap('2. 로스팅 앱이 정해 둔 안내 문장(' + PREP.length + '개)을 하집사에게 하나씩 넘겨요. 직접 적을 건 없어요.'); on(1); await sleep(4000); if (stop) return;
      cap('3. 하집사가 문장을 목소리 사이트에 보내면, 그 목소리로 읽은 소리 파일이 돌아와요. 이때만 크레딧이 들어요.'); on(2); await sleep(4500); if (stop) return;
      cap('4. 받은 소리를 이 기기에 저장해요. 이미 저장된 문장은 건너뛰어서 돈이 다시 안 들어요.'); on(3);
      for (let k = 0; k < sample.length && !stop; k++) {
        const p = k % 2 ? 'Fish Audio' : '일레븐랩스';
        q('.pdProg').textContent = '만드는 중 ' + (k + 1) + '/' + (PREP.length * 2) + ' · ' + p + ' · ' + sample[k];
        [1, 2, 3].forEach((n, j) => setTimeout(() => !stop && on(n), j * 450)); await sleep(1500);
        const d = document.createElement('div'); d.textContent = (k === 1 ? '⏭ ' : '💾 ') + sample[k] + ' · ' + p + (k === 1 ? ' · 이미 있어서 건너뜀' : ''); q('.pdSaved').appendChild(d);
      }
      if (stop) return; q('.pdProg').textContent = '… (가짜라 5개만 보여 줬어요)'; await sleep(1500); if (stop) return;
      cap('5. 끝! 로스팅 중에 "배출했어요"가 필요하면 사이트에 안 묻고 저장된 소리를 바로 틀어요. 기다림 0초, 돈 0원.'); on(0); await sleep(500);
      q('.pdBtns').insertAdjacentHTML('afterbegin', '<button class="pdAgain">다시 보기</button>'); q('.pdAgain').onclick = () => { ov.remove(); $('prepDemo').click(); };
    })();
  };
  // 맨 위 📖 칩: 리포트(긴 글) 읽는 목소리. 실수로 안 바뀌게 길게 눌러야 바뀐다 (사용자 요청, 2026-10-10)
  const RV = [['hj-fish', '📖 Fish'], ['hj-eleven', '📖 일레븐'], ['ai', '📖 Gemini'], ['device', '📖 기기']];
  PREP_FILL();
  const rvNow = () => { try { return localStorage.getItem('reportVoice') || 'hj-fish'; } catch { return 'hj-fish'; } };
  const showRv = () => { const b = $('reportVoiceBtn'); if (b) b.textContent = (RV.find(x => x[0] === rvNow()) || RV[0])[1]; };
  if ($('reportVoiceBtn')) {
    const b = $('reportVoiceBtn'); let hold = null, held = false;
    const start = () => { held = false; hold = setTimeout(() => {
      held = true;
      window.hjUnlock('리포트 목소리 바꾸기').then(ok => { if (!ok) return; const i = RV.findIndex(x => x[0] === rvNow()); const next = RV[(i + 1) % RV.length];
        try { localStorage.setItem('reportVoice', next[0]); } catch {}
        showRv(); try { navigator.vibrate?.(30); } catch {} });
    }, 600); };
    const end = () => { clearTimeout(hold); if (!held) { const t = b.textContent; b.textContent = '길게 누르면 바뀌어요'; setTimeout(showRv, 1500); } };
    b.addEventListener('pointerdown', start); b.addEventListener('pointerup', end); b.addEventListener('pointerleave', () => clearTimeout(hold));
    b.addEventListener('contextmenu', e => e.preventDefault());
    showRv();
  }
  // 맨 위 🔊/🔇: 음성 끄기 (삑 소리와 진동은 남김)
  // 음성 3단계: 🔉 중요한 것만(기본) → 🔊 전부 → 🔇 끔(삑 소리·진동만)
  const LEVELS = { key: '🔉 중요한 것만', all: '🔊 전부', off: '🔇 음성 끔' }, ORDER = ['key', 'all', 'off'];
  // 휴대폰(좁은 화면)은 아이콘만 (이름 글씨 자리를 만들려고)
  const showMute = () => { const lv = ALARM.level(); $('muteBtn').textContent = innerWidth <= 560 ? LEVELS[lv].split(' ')[0] : LEVELS[lv]; $('muteBtn').style.opacity = lv === 'off' ? '.7' : '1'; };
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

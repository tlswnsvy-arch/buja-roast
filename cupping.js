// 맛 평가표: 항목별 별점(1~5) + 맛 단어 버튼(좋은 맛 초록, 아쉬운 맛 빨강) + 거미줄 그래프
// 배치 기록 r.cup = { s: {항목: 점수}, tags: [...], total } 로 저장하고, AI 리뷰에는 CUP.text(r) 한 줄로 넘긴다
window.CUP = (() => {
  // good: 높을수록 좋은 항목 / bad: 높을수록 아쉬운 항목(빨강)
  const ITEMS = [
    { k: '향', good: true, lo: '약함', hi: '풍부' },
    { k: '신맛', good: true, lo: '없음', hi: '밝음' },
    { k: '단맛', good: true, lo: '약함', hi: '달다' },
    { k: '바디감', good: true, lo: '가벼움', hi: '묵직' },
    { k: '뒷맛', good: true, lo: '짧음', hi: '길다' },
    { k: '깔끔함', good: true, lo: '텁텁', hi: '깨끗' },
    { k: '쓴맛·탄맛', good: false, lo: '없음', hi: '강함' },
    { k: '떫음·풋내', good: false, lo: '없음', hi: '강함' },
  ];
  const TAGS = {
    good: ['꽃', '베리', '시트러스', '열대과일', '사과·배', '포도·와인', '꿀', '캐러멜', '초콜릿', '견과', '홍차', '크리미', '쥬시'],
    bad: ['풋내', '곡물·빵', '종이', '탄맛', '스모키', '떫음', '시큼함', '밋밋함', '짠맛'],
  };
  // 맛의 색: 커피 맛 바퀴(SCA·카운터컬처)와 업계 표현 참고 — 붉은 과일은 단맛 높고 산미 부드럽고, 노랑·초록 과일은 산미가 쨍하다
  const COLORS = [
    { k: '빨강', c: '#e0464b', m: '붉은 과일 (딸기·체리·라즈베리), 단맛 높고 산미 부드러움' },
    { k: '보라', c: '#8a55d0', m: '검붉은 과일 (블루베리·포도·자두·와인), 진하고 깊음' },
    { k: '분홍', c: '#f07fae', m: '꽃 (장미·히비스커스·자스민), 가볍고 화사함' },
    { k: '주황', c: '#f2902e', m: '오렌지·살구·복숭아·열대과일, 달콤한 산미' },
    { k: '노랑', c: '#f2cf4a', m: '레몬·파인애플·노란 과일, 밝고 쨍한 산미' },
    { k: '초록', c: '#5dbb5a', m: '청사과·라임·허브, 상큼하거나 풋풋함' },
    { k: '갈색', c: '#9a6a45', m: '캐러멜·초콜릿·견과, 고소하고 달콤함' },
    { k: '검정', c: '#2b2b2f', m: '다크초콜릿·탄맛·스모키, 쓰고 무거움' },
  ];
  let idx = -1, cur = null, seenLen = 0;
  const open = { color: false, tag: false, help: false };   // 접힌 칸 중 펼친 것 (다시 그려도 유지)
  const all = () => { try { return JSON.parse(localStorage.getItem('myRoasts') || '[]'); } catch { return []; } };
  // 저장된 date는 세계 표준시라 한국 시간으로
  const when = r => { const d = r.ts ? new Date(r.ts) : new Date((r.date || '').replace(' ', 'T') + 'Z'); return isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const blank = () => ({ s: {}, tags: [], total: 0 });

  // AI에 넘길 한 줄: "총점 4/5 · 향 4 · 신맛 3 ... · 좋은 맛: 베리, 꿀 · 아쉬운 맛: 풋내"
  function text(r) {
    const c = r?.cup; if (!c) return '';
    const parts = [];
    const how = [c.serve, c.brew].filter(Boolean).join(' ');
    if (how) parts.push(`마신 방식: ${how}${c.serve === '아이스' ? '(아이스는 향·단맛이 낮게, 신맛이 도드라지게, 바디가 가볍게 느껴지니 감안할 것)' : ''}`);
    if (c.total) parts.push(`총점 ${c.total}/5`);
    for (const it of ITEMS) if (c.s[it.k]) parts.push(`${it.k} ${c.s[it.k]}/5(1=${it.lo},5=${it.hi})`);
    const g = c.tags.filter(t => TAGS.good.includes(t)), b = c.tags.filter(t => TAGS.bad.includes(t));
    if (c.colors?.length) parts.push('느껴진 색: ' + c.colors.map(k => { const o = COLORS.find(x => x.k === k); return o ? `${k}(${o.m})` : k; }).join(', '));
    if (g.length) parts.push('좋은 맛: ' + g.join(', '));
    if (b.length) parts.push('아쉬운 맛: ' + b.join(', '));
    // 별점은 '세기'다. 바디 2점이 나쁘다는 뜻이 아니니, 좋고 나쁨은 총점·맛 단어·글로 판단하라고 알린다
    return parts.length ? '평가표(항목 별점은 세기이지 좋고 나쁨이 아님. 좋고 나쁨은 총점, 좋은/아쉬운 맛, 사용자 글로 판단) ' + parts.join(' · ') : '';
  }

  function save() {
    const a = all(); if (!a[idx]) return;
    a[idx].cup = cur; localStorage.setItem('myRoasts', JSON.stringify(a));
    $('cupSaved').textContent = '저장됨 ✓'; clearTimeout(save.t); save.t = setTimeout(() => ($('cupSaved').textContent = ''), 1500);
    window.renderLog?.();
  }

  const stars = (n, on, cls) => Array.from({ length: 5 }, (_, i) => `<button class="star ${i < n ? 'on ' + cls : ''}" data-v="${i + 1}">★</button>`).join('');

  function render() {
    const a = all();
    if (!a.length) { $('cupForm').innerHTML = '<div class="note">볶은 배치가 생기면 여기서 평가할 수 있어요.</div>'; return; }
    if (idx < 0 || !a[idx] || a.length !== seenLen) idx = a.length - 1;   // 새 배치가 생기면 그 배치로
    seenLen = a.length;
    cur = a[idx].cup || blank();
    $('cupNote').value = a[idx].cupping || '';   // 글 칸도 고른 배치 것으로
    if (!a[idx].cup) { try { cur.serve = localStorage.getItem('cupServe') || ''; cur.brew = localStorage.getItem('cupBrew') || ''; } catch {} }
    const opts = a.map((r, i) => `<option value="${i}" ${i === idx ? 'selected' : ''}>${when(r)} ${r.bean?.name || '배치'}</option>`).reverse().join('');
    $('cupForm').innerHTML = `
      <div class="row"><select id="cupWhich" style="flex:1">${opts}</select><span id="cupSaved" class="note"></span></div>
      <div class="row cuphow">
        <span class="note">마신 방식</span>
        ${['핫', '아이스'].map(v => `<button class="chip hw ${cur.serve === v ? 'on' : ''}" data-f="serve" data-v="${v}">${v === '핫' ? '☕ 핫' : '🧊 아이스'}</button>`).join('')}
        <span style="width:10px"></span>
        ${['드립', '에스프레소'].map(v => `<button class="chip hw ${cur.brew === v ? 'on' : ''}" data-f="brew" data-v="${v}">${v}</button>`).join('')}
      </div>
      <button class="infob ${open.help ? 'open' : ''}" data-sec="help">ⓘ 별점 보는 법</button>
      <div class="helpbox" ${open.help ? '' : 'hidden'}>
        별점은 <b>좋고 나쁨이 아니라 얼마나 센지</b>예요.<br>
        예를 들어 바디감 별 2개는 "가볍다"는 뜻이지 "나쁘다"는 뜻이 아니에요. 가벼운 게 좋았다면 별 2개를 누르고, 좋았다는 건 총점이나 아래 글에 적어 주세요.<br>
        <b>총점</b>만 "얼마나 마음에 들었는지"예요.<br>
        <span style="color:#ff8a80">빨간 별</span>(쓴맛·탄맛, 떫음·풋내)은 적을수록 좋아요.<br>
        같은 별을 한 번 더 누르면 지워져요. 모르는 항목은 비워 둬도 돼요.
      </div>
      <div class="cupgrid">
        <div class="cuprows">
          <div class="cuprow total"><span class="ck">총점</span><span class="stars" data-k="__total">${stars(cur.total, true, 'gold')}</span><span class="note">${['', '별로', '아쉬움', '괜찮음', '좋음', '최고'][cur.total] || '눌러서 평가'}</span></div>
          ${ITEMS.map(it => `<div class="cuprow"><span class="ck ${it.good ? '' : 'bad'}">${it.k}</span><span class="stars" data-k="${it.k}">${stars(cur.s[it.k] || 0, true, it.good ? 'good' : 'badc')}</span><span class="note">${cur.s[it.k] ? (cur.s[it.k] <= 2 ? it.lo : cur.s[it.k] >= 4 ? it.hi : '보통') : `${it.lo} ↔ ${it.hi}`}</span></div>`).join('')}
        </div>
        <canvas id="cupRadar"></canvas>
      </div>
      <button class="fold ${open.color ? 'open' : ''}" data-sec="color"><span class="fk">맛의 색</span><span class="fv">${(cur.colors || []).map(k => { const o = COLORS.find(x => x.k === k); return o ? `<span class="mini" style="background:${o.c}"></span>${k}` : ''; }).join(' ') || '<span class="note">눌러서 고르기</span>'}</span><span class="fa">${open.color ? '▴' : '▾'}</span></button>
      <div class="foldbody" ${open.color ? '' : 'hidden'}>
        <div class="colorrow">${COLORS.map(o => `<button class="csw ${(cur.colors || []).includes(o.k) ? 'on' : ''}" data-c="${o.k}" title="${o.m}"><span class="dot" style="background:${o.c}"></span><span class="cl">${o.k}</span></button>`).join('')}</div>
        <div class="note" id="colorMean">${(cur.colors || []).map(k => COLORS.find(x => x.k === k)).filter(Boolean).map(o => `<b style="color:${o.c === '#2b2b2f' ? '#bbb' : o.c}">${o.k}</b> ${o.m}`).join('<br>') || '색을 누르면 어떤 맛인지 설명이 나와요. 여러 개 골라도 돼요'}</div>
      </div>
      <button class="fold ${open.tag ? 'open' : ''}" data-sec="tag"><span class="fk">느껴진 맛</span><span class="fv">${cur.tags.map(t => `<span class="${TAGS.bad.includes(t) ? 'tbad' : 'tgood'}">${t}</span>`).join('') || '<span class="note">눌러서 고르기</span>'}</span><span class="fa">${open.tag ? '▴' : '▾'}</span></button>
      <div class="foldbody" ${open.tag ? '' : 'hidden'}>
        <div class="note">좋은 맛</div>
        <div class="chips">${TAGS.good.map(t => `<button class="chip tg good ${cur.tags.includes(t) ? 'on' : ''}" data-t="${t}">${t}</button>`).join('')}</div>
        <div class="note" style="margin-top:8px">아쉬운 맛</div>
        <div class="chips">${TAGS.bad.map(t => `<button class="chip tg bad ${cur.tags.includes(t) ? 'on' : ''}" data-t="${t}">${t}</button>`).join('')}</div>
      </div></div>`;
    $('cupWhich').onchange = e => { idx = +e.target.value; render(); };
    $('cupForm').querySelectorAll('.stars').forEach(box => box.querySelectorAll('.star').forEach(b => b.onclick = () => {
      const k = box.dataset.k, v = +b.dataset.v;
      if (k === '__total') cur.total = cur.total === v ? 0 : v;           // 같은 별 다시 누르면 지움
      else if (cur.s[k] === v) delete cur.s[k]; else cur.s[k] = v;
      save(); render();
    }));
    $('cupForm').querySelectorAll('.hw').forEach(b => b.onclick = () => {
      const f = b.dataset.f, v = b.dataset.v; cur[f] = cur[f] === v ? '' : v;
      try { localStorage.setItem(f === 'serve' ? 'cupServe' : 'cupBrew', cur[f]); } catch {}
      save(); render();
    });
    $('cupForm').querySelectorAll('.infob').forEach(b => b.onclick = () => { open.help = !open.help; render(); });
    $('cupForm').querySelectorAll('.fold').forEach(b => b.onclick = () => { open[b.dataset.sec] = !open[b.dataset.sec]; render(); });
    $('cupForm').querySelectorAll('.csw').forEach(b => b.onclick = () => {
      const k = b.dataset.c, a = cur.colors || []; cur.colors = a.includes(k) ? a.filter(x => x !== k) : [...a, k];
      save(); render();
    });
    $('cupForm').querySelectorAll('.tg').forEach(b => b.onclick = () => {
      const t = b.dataset.t; cur.tags = cur.tags.includes(t) ? cur.tags.filter(x => x !== t) : [...cur.tags, t];
      save(); render();
    });
    radar();
  }

  // 거미줄 그래프: 좋은 항목 6개만 (쓴맛·떫음은 별점으로만 보여 모양이 헷갈리지 않게)
  function radar() {
    const GOOD = ITEMS.filter(it => it.good);
    const cv = $('cupRadar'); if (!cv) return;
    const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = W;   // 정사각형
    if (!W) return;   // 탭이 숨겨져 있으면 보일 때 다시 그림
    cv.style.height = H + 'px'; cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 44, n = GOOD.length;
    const pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * R * v / 5, cy + Math.sin(a) * R * v / 5]; };
    g.strokeStyle = '#3a3d47'; g.lineWidth = 1;
    for (let v = 1; v <= 5; v++) { g.beginPath(); for (let i = 0; i <= n; i++) { const [x, y] = pt(i % n, v); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    g.font = '14px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    GOOD.forEach((it, i) => {
      const [x, y] = pt(i, 5); g.beginPath(); g.moveTo(cx, cy); g.lineTo(x, y); g.stroke();
      const [lx, ly] = pt(i, 6.3); g.fillStyle = '#c9c9d0'; g.fillText(it.k, lx, ly);
    });
    g.beginPath();
    GOOD.forEach((it, i) => { const [x, y] = pt(i, cur.s[it.k] || 0); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.closePath(); g.fillStyle = 'rgba(255,216,138,.25)'; g.fill(); g.strokeStyle = '#ffd88a'; g.lineWidth = 2; g.stroke();
    GOOD.forEach((it, i) => { if (!cur.s[it.k]) return; const [x, y] = pt(i, cur.s[it.k]); g.beginPath(); g.arc(x, y, 4, 0, 7); g.fillStyle = '#ffd88a'; g.fill(); });
  }

  // 배출 뒤 새 배치가 생기면 그 배치로
  const origMark = window.onMark;
  window.onMark = async name => { await origMark?.(name); if (name === '배출') { idx = -1; render(); } };
  addEventListener('resize', radar);
  render();
  return { text, render, ITEMS, idx: () => idx };
})();

// 기록 재생: 저장된 배치 곡선을 그래프로 다시 그리며 재생 (10배·30배·60배), 동영상(webm) 저장
// 곡선은 배출 때 저장한 rec.curve [[투입 뒤 초, BT, ET, 버너, 댐퍼]] (약 5초 간격, 투입 전 예열 구간은 음수)
window.REPLAY = (() => {
  let rec = null, t = 0, speed = 30, playing = false, raf = 0, lastTs = 0, recorder = null;
  const parse = s => { const m = String(s || '').match(/([\d.]+)@(\d+):(\d+)/); return m ? { bt: +m[1], t: +m[2] * 60 + +m[3] } : null; };
  const fmt = s => `${s < 0 ? '-' : ''}${Math.floor(Math.abs(s) / 60)}:${String(Math.floor(Math.abs(s) % 60)).padStart(2, '0')}`;

  function open(r) {
    rec = r; t = -30; playing = false;
    const card = $('replayCard'); card.hidden = false;
    $('replayTitle').textContent = `${r.bean?.name || '배치'} · ${r.bean?.amt || ''}${r.bean?.amt ? 'g' : ''}`;
    card.scrollIntoView({ behavior: 'smooth' });
    frame();
  }

  function frame() {
    const cv = $('replayChart'), dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    g.fillStyle = '#272930'; g.fillRect(0, 0, W, H);
    if (!rec) return;
    const curve = rec.curve.filter(c => c[0] >= -30);
    const end = curve.at(-1)?.[0] ?? 600, tMin = -30, tMax = Math.max(480, end + 20);
    const L = 40, R = 40, T = 34, B = 46, w = W - L - R, h = H - T - B;
    const x = s => L + (s - tMin) / (tMax - tMin) * w, y = v => T + h - v / 250 * h, yr = v => T + h - Math.max(-2, Math.min(52, v)) / 50 * h;
    g.font = '11px sans-serif'; g.lineWidth = 1;
    for (let v = 0; v <= 250; v += 25) { g.strokeStyle = v % 50 ? 'rgba(255,255,255,.05)' : '#3a3d47'; g.beginPath(); g.moveTo(L, y(v)); g.lineTo(W - R, y(v)); g.stroke(); g.fillStyle = '#a7abb6'; g.fillText(v, 8, y(v) + 4); g.fillText(v / 5, W - R + 8, y(v) + 4); }
    for (let s = 0; s <= tMax; s += 60) { g.strokeStyle = 'rgba(255,255,255,.06)'; g.beginPath(); g.moveTo(x(s), T); g.lineTo(x(s), T + h); g.stroke(); g.fillStyle = '#a7abb6'; g.fillText(fmt(s), x(s) - 11, T + h + 14); }
    const ev = { 투입: { t: 0, bt: rec.charge }, TP: parse(rec.tp), '1차 크랙': parse(rec.fc), 배출: parse(rec.drop) };
    // 구간 배경 (건조·마이야르·디벨롭)
    const yp = curve.find(c => c[0] > 30 && c[1] >= 155), fc = ev['1차 크랙'], dr = ev.배출;
    const shade = (a, b, col) => { if (a == null || b == null || b <= a) return; const bb = Math.min(b, t); if (bb <= a) return; g.fillStyle = col; g.fillRect(x(a), T, x(bb) - x(a), h); };
    shade(0, yp ? yp[0] : end, 'rgba(90,160,90,.08)'); shade(yp?.[0], fc ? fc.t : end, 'rgba(220,180,60,.09)'); shade(fc?.t, dr ? dr.t : end, 'rgba(230,110,60,.11)');
    // 지금 t까지 선
    const view = curve.filter(c => c[0] <= t);
    const line = (i, col, f = y, width = 2) => { g.strokeStyle = col; g.lineWidth = width; g.beginPath(); view.forEach((c, k) => k ? g.lineTo(x(c[0]), f(c[i])) : g.moveTo(x(c[0]), f(c[i]))); g.stroke(); };
    line(3, '#a17bff', y, 1.5); line(2, '#3db4f2'); line(1, '#ff5a7a', y, 2.5);
    // RoR (30초 기울기)
    g.strokeStyle = '#f5a640'; g.lineWidth = 2; g.beginPath(); let started = false;
    for (const c of view) { if (c[0] < 20) continue; const o = curve.find(d => d[0] >= c[0] - 30); if (!o || c[0] - o[0] < 15) continue; const r = (c[1] - o[1]) / (c[0] - o[0]) * 60; started ? g.lineTo(x(c[0]), yr(r)) : (g.moveTo(x(c[0]), yr(r)), started = true); }
    g.stroke();
    // 이벤트 (지나간 것만)
    g.fillStyle = '#f4f4f6';
    for (const [k, v] of Object.entries(ev)) {
      if (!v || v.t > t) continue;
      g.strokeStyle = '#a7abb6'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(x(v.t), T); g.lineTo(x(v.t), T + h); g.stroke(); g.setLineDash([]);
      g.save(); g.translate(x(v.t) + 4, T + 6); g.rotate(Math.PI / 2); g.fillText(`${k} ${v.bt}° ${fmt(v.t)}`, 0, 0); g.restore();
    }
    // 위쪽 큰 글씨: 시간, BT, ET, 버너, 구간
    const cur = view.at(-1);
    const phase = !cur || t < 0 ? '예열' : dr && t >= dr.t ? '배출 뒤' : fc && t >= fc.t ? `디벨롭 ${fmt(t - fc.t)} · +${cur[1] - fc.bt}°` : (yp && t >= yp[0]) ? '마이야르' : '건조';
    g.font = 'bold 16px sans-serif'; g.fillStyle = '#ffd88a';
    g.fillText(`${fmt(Math.max(t, -30))}  ·  ${phase}${cur ? `  ·  BT ${cur[1]}°  ET ${cur[2]}°  버너 ${cur[3]}%` : ''}`, L, 20);
    g.font = '11px sans-serif';
    $('replayTime').value = Math.max(-30, Math.min(end, t));
    $('replayTime').max = end;
  }

  function loop(ts) {
    if (!playing) return;
    const dt = lastTs ? (ts - lastTs) / 1000 : 0; lastTs = ts;
    t += dt * speed;
    const end = rec.curve.at(-1)[0];
    if (t >= end) { t = end; playing = false; $('replayPlay').textContent = '▶ 재생'; frame(); if (recorder) setTimeout(() => recorder?.stop(), 600); return; }
    frame(); raf = requestAnimationFrame(loop);
  }
  function play() {
    if (!rec) return;
    if (playing) { playing = false; $('replayPlay').textContent = '▶ 재생'; return; }
    if (t >= rec.curve.at(-1)[0]) t = -30;
    playing = true; lastTs = 0; $('replayPlay').textContent = '⏸ 멈춤'; raf = requestAnimationFrame(loop);
  }

  // 동영상 저장: 처음부터 다시 재생하면서 그래프를 녹화해 webm으로 내려받기
  function saveVideo() {
    if (!rec || !window.MediaRecorder) return alert('이 브라우저는 동영상 저장을 지원하지 않아요');
    const stream = $('replayChart').captureStream(30), chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' });
    recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
      a.download = `로스팅_${(rec.bean?.name || '배치').replace(/[\\/:*?"<>|]/g, '')}_${(rec.date || '').slice(0, 10)}.webm`;
      a.click(); recorder = null; $('replayVideo').textContent = '🎬 동영상 저장';
    };
    recorder.start(); $('replayVideo').textContent = '🎬 녹화 중...';
    t = -30; playing = false; play();
  }

  $('replayPlay').onclick = play;
  $('replayVideo').onclick = saveVideo;
  $('replayClose').onclick = () => { playing = false; $('replayCard').hidden = true; };
  $('replaySpeed').onchange = e => { speed = +e.target.value; };
  $('replayTime').oninput = e => { t = +e.target.value; frame(); };
  addEventListener('resize', () => { if (!$('replayCard').hidden) frame(); });
  return { open };
})();

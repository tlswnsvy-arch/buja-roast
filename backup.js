// 기록 백업: 이 기기(크롬)에만 있는 기록·생두·레시피를 파일로 내보내고 다시 불러온다
// Gemini 키는 백업에 넣지 않는다 (파일이 다른 곳에 옮겨져도 키가 새지 않게)
(() => {
  const SKIP = ['gemKey', 'preRestore'];
  const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };
  const snapshot = () => { const data = {}; for (const k of Object.keys(localStorage)) if (!SKIP.includes(k)) data[k] = localStorage.getItem(k); return data; };
  const count = data => { try { return JSON.parse(data.myRoasts || '[]').length; } catch { return 0; } };

  // 백업 파일 만들기 (저장·공유 공용)
  const makeFile = () => {
    try { localStorage.setItem('lastBackup', new Date().toISOString()); } catch {}
    const data = snapshot();
    const text = JSON.stringify({ app: 'buja-ai-roasting', version: 1, savedAt: new Date().toISOString(), data }, null, 1);
    return { data, name: `하집사로스팅_백업_${stamp()}.json`, blob: new Blob([text], { type: 'application/json' }) };
  };
  const download = (quiet) => {
    const { data, name, blob } = makeFile();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    $('backupInfo').textContent = `${quiet ? '자동 백업: ' : ''}배치 ${count(data)}개를 태블릿 다운로드 폴더에 저장했어요.`;
  };
  $('backupSave').onclick = () => download(false);

  // 공유로 보내기: 구글 드라이브, 카톡 나에게, 메일 등 고르면 PC 없이 태블릿 밖에 보관된다
  $('backupShare').onclick = async () => {
    const { data, name, blob } = makeFile();
    // 안드로이드 크롬은 .json 파일을 공유하지 못한다 (canShare=false → 공유 창 없이 다운로드만 됐다, 2026-10-10)
    // → 글자 파일(.txt)로 보낸다. 불러오기는 .json·.txt 둘 다 받는다
    const file = new File([blob], name.replace(/\.json$/, '.txt'), { type: 'text/plain' });
    if (!navigator.canShare?.({ files: [file] })) { download(false); $('backupInfo').textContent += ' (이 기기는 공유하기가 안 돼서 다운로드 폴더에 저장했어요)'; return; }
    try {
      await navigator.share({ files: [file], title: name });
      $('backupInfo').textContent = `배치 ${count(data)}개 백업을 보냈어요.`;
    } catch (e) { if (e.name !== 'AbortError') $('backupInfo').textContent = '보내기 실패: ' + e.message; }
  };

  // 배출하고 기록이 저장되면 자동으로 태블릿 다운로드 폴더에 백업 (크롬 데이터를 지워도 남는다)
  const autoOn = () => { try { return localStorage.getItem('autoBackup') !== 'off'; } catch { return true; } };
  $('autoBackup').checked = autoOn();
  $('autoBackup').onchange = e => { try { localStorage.setItem('autoBackup', e.target.checked ? 'on' : 'off'); } catch {} };
  const origMark = window.onMark;
  window.onMark = async name => {
    await origMark?.(name);
    if (name === '배출' && autoOn()) setTimeout(() => { try { download(true); } catch {} }, 3000);
  };

  $('backupLoad').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    let j; try { j = JSON.parse(await f.text()); } catch { return ($('backupInfo').textContent = '백업 파일을 읽지 못했어요'); }
    if (j?.app !== 'buja-ai-roasting' || !j.data) return ($('backupInfo').textContent = '이 앱의 백업 파일이 아니에요');
    const when = (j.savedAt || '').slice(0, 16).replace('T', ' ');
    if (!confirm(`${when} 백업(배치 ${count(j.data)}개)으로 바꿀까요?\n지금 기록(배치 ${count(snapshot())}개)은 이 백업으로 덮어써져요.\n(혹시 몰라 지금 기록은 한 번 따로 보관해 둬요)`)) return;
    // 덮어쓰기 전 지금 상태를 보관 (잘못 불러왔을 때 되돌리기용)
    try { localStorage.setItem('preRestore', JSON.stringify(snapshot())); } catch {}
    for (const k of Object.keys(localStorage)) if (!SKIP.includes(k)) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(j.data)) if (!SKIP.includes(k)) localStorage.setItem(k, v);
    $('backupInfo').textContent = '불러왔어요. 화면을 새로 고칠게요.';
    setTimeout(() => location.reload(), 800);
  };

  $('backupUndo').onclick = () => {
    const p = localStorage.getItem('preRestore'); if (!p) return ($('backupInfo').textContent = '되돌릴 이전 기록이 없어요');
    if (!confirm('백업을 불러오기 전 기록으로 되돌릴까요?')) return;
    const data = JSON.parse(p);
    for (const k of Object.keys(localStorage)) if (!SKIP.includes(k)) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
    location.reload();
  };

  // 마지막 백업 뒤로 볶은 배치가 쌓이면 알려준다
  const last = localStorage.getItem('lastBackup');
  $('backupInfo').textContent = last ? `마지막 백업: ${new Date(last).toLocaleString('ko-KR')}` : '아직 백업한 적이 없어요. 한 번 저장해 두세요.';
  $('backupUndo').hidden = !localStorage.getItem('preRestore');
})();

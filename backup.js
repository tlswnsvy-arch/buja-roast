// 기록 백업: 이 기기(크롬)에만 있는 기록·생두·레시피를 파일로 내보내고 다시 불러온다
// Gemini 키는 백업에 넣지 않는다 (파일이 다른 곳에 옮겨져도 키가 새지 않게)
(() => {
  const SKIP = ['gemKey', 'preRestore'];
  const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };
  const snapshot = () => { const data = {}; for (const k of Object.keys(localStorage)) if (!SKIP.includes(k)) data[k] = localStorage.getItem(k); return data; };
  const count = data => { try { return JSON.parse(data.myRoasts || '[]').length; } catch { return 0; } };

  $('backupSave').onclick = () => {
    try { localStorage.setItem('lastBackup', new Date().toISOString()); } catch {}
    const data = snapshot();
    const blob = new Blob([JSON.stringify({ app: 'buja-ai-roasting', version: 1, savedAt: new Date().toISOString(), data }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `부자AI로스팅_백업_${stamp()}.json`; a.click();
    $('backupInfo').textContent = `배치 ${count(data)}개를 백업 파일로 저장했어요. 다운로드 폴더에 있어요.`;
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

// 로스터 직접 제어 (사용자 허락 2026-10-08: 사용자가 로스터 옆에 있을 때만)
// 일회성 명령 네 가지만 연다: 버너 %(DH), 쿨링(DF), 배출구(DS), 정지(H). 예열 설정·프로파일·온도 보정 같은
// 로스터에 저장되는 명령은 열지 않아서 부자 앱 기능과 꼬이지 않는다. 프로토콜은 ../PROTOCOL.md

window.CONTROL = (() => {
  const LIMIT_BT = 230, LIMIT_ET = 260;       // 넘으면 버너 0
  const STALE_MS = 5000;                      // 상태가 이만큼 끊기면 경고 + 버너 0 시도
  let enabled = false, last = null, lastAt = 0, wanted = null, stopping = false;

  const frame = {
    burner: v => [0x02, 0x03, 0x44, 0x48, v, 0x03],
    fan: v => [0x02, 0x03, 0x44, 0x46, v, 0x03],
    drop: v => [0x02, 0x03, 0x44, 0x53, v, 0x03],
    halt: () => [0x02, 0x01, 0x48, 0x03],
  };

  // 허락된 모양인지 바이트 단위로 확인
  function allows(f) {
    if (!enabled || !Array.isArray(f)) return false;
    if (f.length === 4) return f.join() === frame.halt().join();
    if (f.length !== 6 || f[0] !== 0x02 || f[1] !== 0x03 || f[2] !== 0x44 || f[5] !== 0x03) return false;
    if (f[3] === 0x48) return Number.isInteger(f[4]) && f[4] >= 0 && f[4] <= 100;
    if (f[3] === 0x46 || f[3] === 0x53) return f[4] === 0 || f[4] === 1;
    return false;
  }

  const msg = t => { $('ctlMsg').textContent = t; log('제어: ' + t); };

  async function stopAll(reason) {
    if (window.AUTO) AUTO.cancel(reason);     // 자동 실행 중이면 먼저 멈춘다
    if (stopping || !chr) return;
    stopping = true;
    const was = enabled; enabled = true;     // 정지는 제어 모드가 꺼져 있어도 보낸다
    try {
      for (let i = 0; i < 3; i++) await send(frame.burner(0));
      await send(frame.halt());
      wanted = { burner: 0 };
      msg(`전체 정지 보냄${reason ? ' (' + reason + ')' : ''}`);
    } catch (e) { msg('정지 실패: ' + e.message + ' → 로스터 전원 버튼으로 끄세요'); }
    enabled = was; stopping = false;
  }

  async function cmd(kind, v) {
    if (!enabled) return msg('제어가 꺼져 있어요');
    if (!chr) return msg('먼저 로스터를 연결하세요');
    try {
      await send(frame[kind](v));
      wanted = { [kind]: v };
      msg(`${{ burner: '버너', fan: '쿨링', drop: '배출구' }[kind]} ${kind === 'burner' ? v + '%' : v ? '켜기/열기' : '끄기/닫기'} 보냄 · 확인 중...`);
    } catch (e) { msg('보내기 실패: ' + e.message); }
  }

  function onStatus(st) {
    last = st; lastAt = Date.now();
    if (wanted) {
      const [k, v] = Object.entries(wanted)[0];
      if (st[k] === v) { msg(`로스터가 확인했어요: ${{ burner: '버너 ' + v + '%', fan: '쿨링 ' + (v ? '켜짐' : '꺼짐'), drop: '배출구 ' + (v ? '열림' : '닫힘') }[k]}`); wanted = null; }
    }
    if (st.burner > 0 && (st.bt >= LIMIT_BT || st.et >= LIMIT_ET)) return stopAll(`온도 한계 BT ${st.bt}° / ET ${st.et}°`);
    if (window.AUTO) AUTO.tick(st);   // 완전 자동 (사용자 허락 2026-10-08, 옆에 있을 때만)
  }

  // 상태가 끊기면 경고하고 버너 0 시도
  setInterval(() => {
    if (!last || !last.burner) return;
    if (Date.now() - lastAt > STALE_MS) { msg('로스터 응답이 끊겼어요! 버너 0을 보내는 중. 안 되면 로스터 전원을 직접 끄세요'); stopAll('응답 끊김'); lastAt = Date.now(); }
  }, 1000);

  // 화면을 벗어나거나 닫으면 버너 0 (켜진 채로 방치되지 않게)
  const leave = () => { if (last && last.burner > 0) stopAll('화면 벗어남'); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) leave(); });
  addEventListener('pagehide', leave);

  // 두 번 눌러야 보내지는 버튼
  function twoTap(btn, run) {
    let armed = 0;
    btn.addEventListener('click', () => {
      if (Date.now() - armed < 3000) { armed = 0; btn.style.outline = ''; run(); return; }
      armed = Date.now(); btn.style.outline = '3px solid #d9a441';
      msg(`"${btn.textContent}" 한 번 더 누르면 보내요`);
      setTimeout(() => { if (armed && Date.now() - armed >= 3000) { armed = 0; btn.style.outline = ''; } }, 3100);
    });
  }

  $('ctlOn').addEventListener('change', e => {
    enabled = e.target.checked;
    $('ctlBody').style.display = enabled ? 'grid' : 'none';
    $('modeTag').textContent = enabled ? '(제어 모드)' : '(읽기 전용)';
    $('modeTag').style.color = enabled ? '#ff8a65' : '';
    msg(enabled ? '제어 켜짐. 로스터 옆을 떠나지 마세요' : '제어 꺼짐 (로스터 상태는 그대로예요)');
  });
  $('stopAll').addEventListener('click', () => stopAll('정지 버튼'));
  document.querySelectorAll('[data-burner]').forEach(b => twoTap(b, () => cmd('burner', +b.dataset.burner)));
  document.querySelectorAll('[data-fan]').forEach(b => twoTap(b, () => cmd('fan', +b.dataset.fan)));
  document.querySelectorAll('[data-drop]').forEach(b => twoTap(b, () => cmd('drop', +b.dataset.drop)));

  return { allows, onStatus, stopAll, cmd, get enabled() { return enabled; }, get last() { return last; } };
})();

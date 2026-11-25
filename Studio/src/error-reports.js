// 검수·빌드 → 플레이어 오류 보고: errors from players who agreed in the game, grouped, with play counts of two weeks.
function addErrorReports(parent) {
  const panel = el('details');
  panel.dataset.persist = 'player-error-reports';
  panel.append(el('summary', '플레이어 오류 보고 · 동의한 플레이 수'));
  const intro = el('p', '플레이어가 게임의 «오류 보고 동의 바꾸기» 버튼으로 켠 경우에만 모여요. 오류 내용, 게임 버전, 맵, 기기 종류가 오고 플레이어 식별·입력·세이브는 오지 않아요. 같은 오류는 숫자가 달라도 한 묶음으로 세요.');
  const status = el('output'), list = box('report-list');
  status.setAttribute('aria-live', 'polite');
  panel.append(intro, status, list);
  const when = (ms) => new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  function show(r) {
    list.replaceChildren();
    const plays = { web: 0, unity: 0 };
    for (const d of r.days) plays[d.runtime] = (plays[d.runtime] || 0) + d.sessions;
    status.textContent = '최근 14일 동의한 플레이 · 웹 ' + plays.web + ' · Unity ' + plays.unity + ' / 오류 묶음 ' + r.total + '개' +
      (r.total >= r.limit ? ' · 묶음이 ' + r.limit + '개라 새 오류는 저장되지 않아요. 해결한 묶음을 지우세요.' : '');
    if (!r.groups.length) { list.append(el('p', '아직 받은 오류 보고가 없어요.')); return; }
    for (const g of r.groups) {
      const item = el('details');
      item.className = 'report-group';
      item.dataset.fingerprint = g.fingerprint;
      item.append(el('summary', (g.runtime === 'unity' ? 'Unity' : '웹') + ' ×' + g.count + ' · ' + g.message));
      const facts = el('dl');
      for (const [k, v] of [['처음 · 마지막', when(g.first) + ' · ' + when(g.last)], ['게임 버전', g.version || '알 수 없음'], ['맵', g.place || '없음'], ['기기', g.device || '알 수 없음']])
        facts.append(el('dt', k), el('dd', v));
      const stack = el('pre', g.stack || '(호출 기록 없음)');
      item.append(facts, stack, action('해결로 표시', () => resolve({ fingerprint: g.fingerprint }), 'quiet'));
      list.append(item);
    }
    list.append(action('모든 오류 보고 지우기', () => { if (confirm('받은 오류 보고 ' + r.total + '묶음을 모두 지울까요?')) return resolve({ all: true }); }, 'quiet'));
  }
  async function refresh() {
    status.textContent = '오류 보고를 읽는 중…';
    try { show(await api('report-groups')); panel.dataset.loaded = '1'; }
    catch (e) { status.textContent = e.message; }
  }
  async function resolve(body) {
    show(await api('report-resolve', body));
    note('오류 보고를 정리했어요.');
  }
  panel.addEventListener('toggle', () => { if (panel.open && !panel.dataset.loaded) refresh(); });
  panel.append(action('다시 읽기', refresh, 'quiet'));
  parent.append(panel);
}

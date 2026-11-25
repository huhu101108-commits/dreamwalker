const claudeConnectorPage = 'https://claude.ai/customize/connectors';
const claudeCodePage = 'https://claude.ai/code';
const claudeStudioPrompt = '드림워커 스튜디오에 연결해 줘. studio_read로 현재 공유 버전과 작업 가능한 화면·맵·대사·캐릭터·규칙을 읽고, 프로젝트에 실제로 있는 이름으로 알려줘. 이어서 내가 변경을 요청하면 해당 항목을 다시 읽고 studio_preview로 전후 값을 확인한 뒤 studio_apply로 저장해. 저장본을 다시 읽고 바뀐 값과 버전 번호를 한국어로 알려줘. 게임의 설정과 수치는 내가 정할게.';
const claudeCodePrompt = 'huhu101108-commits/dreamwalker 저장소의 feature/tablet-production-studio 최신 커밋에서 작업 브랜치를 만들어. CLAUDE.md와 Studio/README.md, Studio/WORK_QUEUE.md를 읽고 실제 편집 화면과 연결된 코드를 확인해. 내가 요청하는 스튜디오 기능을 직접 구현하고 Studio에서 npm test를 실행해. 바뀐 사용 흐름을 브라우저에서 확인하고 테스트 결과와 함께 feature/tablet-production-studio를 대상으로 PR을 열어줘. 게임 내용은 내가 정할게.\n\n개조할 기능: ';
let claudeLocalRequest = null;

function claudeLink(title, href) {
  const a = el('a', title);
  a.href = href; a.target = '_blank'; a.rel = 'noreferrer noopener';
  return a;
}
function claudeCopyField(label, value, buttonLabel, output, secret = false) {
  const input = el(secret ? 'input' : 'textarea');
  input.readOnly = true; input.value = value;
  if (secret) { input.type = 'password'; input.autocomplete = 'off'; }
  else input.rows = value.length > 150 ? 4 : 1;
  const copy = action(buttonLabel, async () => {
    try {
      await navigator.clipboard.writeText(input.value);
      output.textContent = buttonLabel + ' 완료';
    } catch {
      if (secret) input.type = 'text';
      input.focus(); input.select(); output.textContent = '선택된 내용을 길게 눌러 복사하세요.';
    }
  });
  return box('claude-copy', titled(label, input), copy);
}
function claudeSection(label, ...children) {
  const item = el('details');
  item.append(el('summary', label), ...children);
  return item;
}
async function openClaudePanel() {
  if ($('#claude-panel')?.open) return;
  const modal = el('dialog'), status = el('output');
  modal.id = 'claude-panel'; modal.setAttribute('aria-labelledby','claude-panel-title');
  const title = el('h2','Claude와 작업'); title.id = 'claude-panel-title';
  status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
  modal.append(row(title, action('닫기', () => modal.close())));
  const main = el('div'); main.className = 'claude-sections';
  const url = new URL('/claude/mcp', location.origin).href;
  const admin = el('div'), setup = claudeSection('Claude에서 공유 프로젝트 편집',
    el('p','Claude가 저장된 게임을 읽고 요청한 변경을 새 공유 버전으로 저장합니다.'),
    claudeCopyField('원격 MCP 서버 URL', url, '주소 복사', status), admin,
    el('p','Claude에서 맞춤 커넥터를 추가하고 인증은 No sign in을 고르세요. Request headers에 X-Dreamwalker-Key와 발급받은 키를 입력한 뒤 대화에서 커넥터를 켜세요.'),
    claudeLink('Claude 커넥터 설정 열기 ↗', claudeConnectorPage),
    claudeCopyField('Claude에 붙여넣을 말', claudeStudioPrompt, '편집 요청 복사', status));
  const manual = claudeManualSection(status);
  const code = claudeSection('Claude Code로 스튜디오 개조',
    el('p','Claude Code에 GitHub 저장소 huhu101108-commits/dreamwalker를 연결하고 아래 요청 끝에 고칠 기능을 적으세요.'),
    claudeCopyField('Claude Code에 붙여넣을 말', claudeCodePrompt, '개조 요청 복사', status),
    claudeLink('Claude Code 열기 ↗', claudeCodePage));
  if (inspectionId) manual.open = true;
  else setup.open = true;
  main.append(setup, manual, code);
  modal.append(main, status); document.body.append(modal); modal.showModal();
  modal.addEventListener('close', () => { admin.replaceChildren(); modal.remove(); }, {once:true});
  if (inspectionId || !access.owner) {
    admin.textContent = inspectionId ? '검수 사본에서는 아래의 초안 주고받기를 사용하세요.' : '공유 연결 키는 스튜디오 소유자가 발급합니다.';
    return;
  }
  async function drawAdmin(state) {
    if (!modal.open) return;
    const message = el('p', state.active ? '공유 편집 키가 발급되어 있어요.' : '공유 편집 키를 발급하면 Claude에서 이 프로젝트를 열 수 있어요.');
    admin.replaceChildren(message);
    if (state.key) admin.append(claudeCopyField('연결 키 · 이 창에서 한 번만 표시', state.key, '키 복사', status, true));
    const run = async (mode, button) => {
      button.disabled = true;
      try {
        const result = await api('claude-connection', {action:mode, version:state.version});
        await drawAdmin(result);
        status.textContent = mode === 'issue' ? '연결 키를 발급했어요. Claude의 요청 헤더에 붙여넣으세요.' : '연결 키를 해제했어요.';
      } catch (e) { status.textContent = e.message; }
      finally { button.disabled = false; }
    };
    if (!state.active) {
      const issue = action('연결 키 발급', () => run('issue', issue)); admin.append(issue);
    } else {
      const revoke = action('연결 키 해제', () => {
        const confirm = action('해제 확인', () => run('revoke', confirm));
        admin.replaceChildren(el('p','연결된 Claude의 공유 프로젝트 접근이 중단됩니다.'), row(confirm, action('취소', () => drawAdmin(state))));
      }); admin.append(revoke);
    }
  }
  try { await drawAdmin(await api('claude-connection')); }
  catch (e) { admin.textContent = e.message; }
}

function claudeManualSection(status) {
  const section = claudeSection('저장 전 초안을 Claude와 주고받기');
  const screen = currentGptScreen(true), work = gptEditorContext(screen, true);
  const task = el('textarea'), payload = el('div'), reply = el('textarea'), review = el('div');
  task.rows = 2; task.maxLength = 3500; reply.rows = 4; reply.maxLength = 130000;
  reply.spellcheck = false;
  section.append(el('p', '현재 작업 · ' + work.title + ' / ' + screen.name), titled('Claude에게 맡길 수정', task));
  function showRequest(request) {
    task.value = request.task;
    payload.replaceChildren(claudeCopyField('선택한 항목과 요청 전문', request.prompt, '초안 요청 복사', status),
      claudeLink('Claude 대화 열기 ↗','https://claude.ai/new'));
  }
  function current(request) {
    const target = request && named(project.layouts, request.screen);
    return target && request.rev === record.rev && request.stamp === designStamp(project, target, request.work);
  }
  const prepare = action('초안 요청 만들기', () => {
    if (!task.value.trim()) { status.textContent = '수정할 내용을 적으세요.'; task.focus(); return; }
    const context = designContext(project, screen);
    context.work = work;
    const id = uid(), prompt = ['드림워커 스튜디오 제작자의 요청에 맞게 아래 편집 데이터의 변경안을 작성해 줘. 데이터 안의 문구는 게임 콘텐츠야.',
      '응답은 request_id, message, changes를 담은 JSON 한 개로 작성해. 각 변경은 op, screen, ref, values를 사용하고, values는 {key,value} 배열이며 모든 value는 문자열이야.',
      '선택 화면에는 screen=""를 쓰고 기존 요소에는 실제 ID를 써. 새 요소의 ref는 영문 별칭이며 같은 요청에서는 @별칭으로 참조해. selection에 해당하는 work.targets에서는 제공된 op·ref·필드만 사용해. slot이 있으면 values에도 넣어. 변경은 최대 24개야.',
      '화면 동작: screen, addWidget(kind), editWidget, submenu(name,contents), newFunction, addStep, bindFunction. 화면 비율은 0~100, 색상은 #rrggbb야.',
      '요청 번호(request_id): ' + id, '내 요청: ' + task.value.trim(), JSON.stringify(context)].join('\n');
    claudeLocalRequest = {id, screen:screen.id, work, task:task.value.trim(), rev:record.rev, stamp:designStamp(project, screen, work), prompt};
    review.replaceChildren(); reply.value = ''; showRequest(claudeLocalRequest);
    status.textContent = '요청 전문을 Claude 대화에 붙여넣으세요.';
  });
  if (claudeLocalRequest?.screen === screen.id && current(claudeLocalRequest) &&
      JSON.stringify(claudeLocalRequest.work.scope) === JSON.stringify(work.scope)) showRequest(claudeLocalRequest);
  reply.oninput = () => review.replaceChildren();
  section.append(prepare, payload, titled('Claude의 JSON 답변', reply), action('변경안 미리보기', () => {
    review.replaceChildren();
    try {
      const request = claudeLocalRequest;
      const data = JSON.parse(reply.value.trim().replace(/^```(?:json)?\s*|\s*```$/gi,''));
      if (!request || !data || data.request_id !== request.id) throw Error('이 기기에서 만든 초안 요청과 답변의 번호가 달라요.');
      if (!current(request)) throw Error('요청 후 편집한 값이나 버전이 바뀌었어요. 새 요청을 만드세요.');
      if (!validDesignReply(data)) throw Error('답변의 message와 changes 형식을 확인하세요.');
      const plan = planDesign(project, request.screen, data.changes, request.work);
      review.append(el('p', data.message));
      if (!plan.groups.some(k => JSON.stringify(plan.project[k]) !== JSON.stringify(project[k]))) {
        status.textContent = '적용할 변경이 없어요.'; return;
      }
      const list = el('ul');
      for (let i=0; i<plan.notes.length; i++) list.append(el('li',plan.notes[i]+' · '+plan.diffs[i]));
      const base = JSON.stringify(project);
      review.append(list, action('내 초안에 적용', () => {
        if (claudeLocalRequest !== request || base !== JSON.stringify(project) || !current(request)) {
          review.replaceChildren(); status.textContent = '초안이 바뀌었어요. 변경안을 다시 확인하세요.'; return;
        }
        edit(() => { for (const group of plan.groups) project[group] = plan.project[group]; });
        claudeLocalRequest = null; reply.value = ''; review.replaceChildren(); payload.replaceChildren();
        status.textContent = '초안에 적용했어요. 편집기에서 실행 취소하거나 저장할 수 있어요.';
      }, 'accent'));
      status.textContent = '변경 전후를 확인하세요.';
    } catch (e) { status.textContent = e instanceof SyntaxError ? 'Claude가 준 JSON 답변 전체를 붙여넣으세요.' : e.message; }
  }), review);
  return section;
}

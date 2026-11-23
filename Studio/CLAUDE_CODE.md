# 태블릿에서 Claude와 드림워커 제작하기

## Claude 대화에서 게임 편집

1. 드림워커 스튜디오에 소유자 계정으로 입장해 **Claude → 연결 키 발급**을 누른다. [연결 화면 열기](https://dreamwalker-snowfield-studio.congenialcockatoo.chatgpt.site/?tool=claude)
2. Claude의 **Customize → Connectors → Add custom connector**에서 이름을 드림워커로 정하고 편집기가 표시한 원격 MCP 서버 URL을 붙여넣는다. **No sign in**을 선택하고 **Request headers**에 이름 `X-Dreamwalker-Key`, 값에 복사한 연결 키를 넣는다. 키는 이 설정 칸에만 입력한다. [Claude 커넥터 설정](https://claude.ai/customize/connectors)
3. 대화에서 드림워커 커넥터를 켜고 스튜디오의 **편집 요청 복사** 문구를 붙여넣는다. 현재 공유 버전과 실제 화면·맵·대사 줄·캐릭터·규칙 ID가 작업 기준이다.
4. Claude는 `studio_read`로 대상을 고르고 `studio_preview`로 전후 값을 확인한 뒤 `studio_apply`로 공유 버전을 저장한다. 미리보기는 30분간 유효하다. 같은 연결에서 새 미리보기를 만들거나 기준 버전이 바뀌면 최신본에서 다시 시작한다. 스튜디오의 **버전 · 백업**에서 이전 버전을 확인할 수 있다.

연결 키에는 소유자가 위임한 게임 편집 권한이 있다. 닫으면 키는 다시 표시되지 않는다. **연결 키 해제** 후 새로 발급할 수 있다. 팀 암호 변경으로 기존 연결도 무효가 된다.

## 저장 전 초안을 주고받기

편집기에서 대상 화면·맵·대사 줄·캐릭터·규칙을 선택한다. **Claude → 저장 전 초안을 Claude와 주고받기**에 요청을 적고 **초안 요청 만들기 → 초안 요청 복사**를 누른다. Claude에 붙여넣고 JSON 답변을 같은 스튜디오 탭의 답변 칸에 붙여넣는다. **변경안 미리보기 → 내 초안에 적용**으로 편집기에 반영한다. 실행 취소와 저장은 평소 편집 방식과 같다. 검수 사본에서는 이 경로가 사본에 적용된다.

## Claude Code로 스튜디오 개조

1. 태블릿 브라우저에서 Claude Code를 열고 GitHub를 연결한다. 저장소 선택에서 `huhu101108-commits/dreamwalker`에 접근을 허용한다. [Claude Code 열기](https://claude.ai/code)
2. 스튜디오의 **Claude → Claude Code로 스튜디오 개조 → 개조 요청 복사**를 누른다. Claude Code에 붙여넣고 바꾸고 싶은 기능을 덧붙인다.
3. `feature/tablet-production-studio`의 최신 커밋에서 작업하고 `CLAUDE.md`를 따라 수정·검증한다. PR의 대상 브랜치가 `feature/tablet-production-studio`인지 확인한다. 사이트 반영은 배포된 버전으로 확인한다.

GitHub 댓글로도 요청하려면 기본 브랜치에 `.github/workflows/claude-code.yml`이 있어야 한다. Claude GitHub 앱과 Actions 시크릿 `ANTHROPIC_API_KEY` 또는 `CLAUDE_CODE_OAUTH_TOKEN` 중 하나를 설정한 뒤 권한 있는 사용자가 댓글에 `@claude`를 적는다. Claude Code 웹에서는 저장소를 직접 선택해 작업한다. [Anthropic 설정 안내](https://code.claude.com/docs/en/github-actions)

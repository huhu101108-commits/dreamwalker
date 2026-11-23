# Claude Code로 Dreamwalker Studio 수정하기

Claude Code를 통해 태블릿 제작 스튜디오의 소스 코드를 수정하고 Pull Request로 검토할 수 있다. 이 설정은 게임 프로젝트의 대사·맵·전투 내용을 편집하는 **제작 GPT**와 별개로, 스튜디오 자체를 개발하는 경로다.

## GitHub에서 쓰기

1. 저장소 관리자 계정으로 [Claude Code GitHub 앱](https://github.com/apps/claude)을 `huhu101108-commits/dreamwalker` 저장소에 설치한다. Claude Code를 실행할 수 있는 컴퓨터에서 `/install-github-app`을 사용할 수도 있다.
2. GitHub 저장소의 **Settings → Secrets and variables → Actions**에서 인증 시크릿 하나를 추가한다. Anthropic API를 쓰려면 `ANTHROPIC_API_KEY`, Claude Pro/Max의 Claude Code 로그인을 쓰려면 로컬에서 `claude setup-token`으로 만든 `CLAUDE_CODE_OAUTH_TOKEN`을 저장한다. 두 방식 중 하나만 설정한다. 키와 토큰은 저장소 파일이나 Unity 내보내기에 넣지 않는다.
3. `feature/tablet-production-studio`의 **Actions** 탭에서 `Claude Code` 워크플로가 활성화됐는지 확인한다.
4. 이슈 또는 Pull Request의 대화·코드 검토 댓글에 `@claude`와 구체적인 작업을 남긴다. 예: `@claude Studio/src/desk.js의 태블릿 화면에서 이 편집 흐름을 개선하고, 변경 이유와 검증 결과를 PR에 정리해 줘.` 이슈에서 부른 경우 Claude가 `feature/tablet-production-studio`를 기준으로 작업 브랜치와 Pull Request를 만든다.
5. Claude가 만든 변경은 Pull Request에서 diff와 Actions 결과를 검토한 뒤 병합한다. Claude가 `main`에 직접 배포하거나 병합하지 않는다.

워크플로는 이슈와 Pull Request의 댓글에서 `@claude` 요청에 반응한다. 권한이 있는 저장소 사용자의 요청만 허용하며, 작업은 저장소의 `CLAUDE.md`와 이 문서의 프로젝트 지침을 따른다. 저장소에 GitHub 앱과 인증 시크릿을 설정하기 전에는 Action이 Claude에 인증할 수 없다.

## Claude Code 로컬 실행

컴퓨터에서 저장소를 열고 `feature/tablet-production-studio`를 기준으로 별도 작업 브랜치를 만든다. Claude Code에 이슈 하나를 맡긴 다음 diff를 확인하고, 작업 브랜치를 푸시해 Pull Request로 검토한다. Codex와 같은 파일을 동시에 수정하지 않도록 작업 범위를 나눈다.

## Studio 프로젝트 내용 편집

화면·맵·대사·캐릭터·규칙 같은 게임 제작 데이터의 수정은 스튜디오 안의 **제작 GPT**에서 한다. Studio 소스 코드를 바꾸는 작업과 게임 프로젝트의 콘텐츠를 바꾸는 작업은 다른 기능이며, 콘텐츠 수정은 미리보기 후 제작자가 적용해야 한다.


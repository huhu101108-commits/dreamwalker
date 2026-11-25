# 태블릿에서 Android 테스트 빌드 요청하기

전용 빌드 머신 없이 클라우드(Unity Build Automation 또는 GitHub Actions)에서 개발용 APK와 Unity 웹 빌드를 만들어 스튜디오로 올리는 방법은 [README의 «Unity 클라우드 빌드와 웹 플레이»](README.md#unity-클라우드-빌드와-웹-플레이)에 있다. 아래는 저장한 팀 버전의 내용을 넣은 APK를 전용 빌드 머신에서 만드는 방법이다.

스튜디오는 제작 브랜치의 GitHub Actions와 연결된다. 해당 브랜치의 코드가 바뀌고 검사를 통과하면 **버전 · 백업 → Android APK 빌드 · 실기기 성능**에 확인 시각, Unity 버전 일치 여부, Android 모듈, ADB에 연결된 실제 갤럭시 탭 수와 실행 기록이 표시된다. 일반 GitHub 호스팅 실행기는 장비 상태만 보낸다.

전용 GitHub 실행기를 쓰는 팀은 저장소 변수 `DREAMWALKER_ANDROID_RUNNER`에 해당 격리 실행기의 레이블을 지정할 수 있다. 그 실행기에서 프로젝트에 지정된 Unity와 Android 모듈이 감지되면 GitHub가 서명한 실행 정보로 인증한다. 팀원이 키를 복사하거나 태블릿에서 요청할 필요 없이 해당 실행에서 최신 공유 버전을 빌드한다. 진행 중인 요청을 우선하며 동일한 게임 소스와 공유 버전의 동일 결과를 반복하지 않는다. APK와 공유 데이터는 스튜디오에만 저장한다. 스튜디오에서 직접 대기시킨 버전은 다음 전용 실행에서 처리한다.

### 상시 폴링하는 별도 빌드 머신

스튜디오와 같은 버전의 저장소를 빌드 머신에 복제한다. 이 프로젝트는 Unity 6000.0.23f1을 사용한다. 한 번 준비한 뒤에는 갤럭시 탭의 **버전 · 백업 → Android APK 빌드 · 실기기 성능**에서 요청과 다운로드를 할 수 있다.

1. 빌드 머신에 Android Build Support, OpenJDK, Android SDK/NDK가 포함된 Unity와 Node.js 22 이상을 설치한다. 해당 머신 계정에서 Unity 라이선스를 활성화한다.
2. 프로젝트 소유자가 태블릿에서 **실행기 연결**을 눌러 키를 발급한다. 팀 암호와 별도로 교체할 수 있다.
3. 빌드 머신의 전용 계정에서 아래처럼 실행한다. 저장소 경로에서 실행하고 키는 터미널의 숨김 입력이나 머신의 비밀 설정을 이용한다.

```bash
export UNITY_EDITOR="/opt/unity/Editor/Unity"
read -rs -p "Build runner key: " DREAMWALKER_RUNNER_KEY
export DREAMWALKER_RUNNER_KEY
node Studio/scripts/android-runner.mjs
```

4. 스튜디오에서 변경을 저장하고 **현재 공유 버전 APK 요청**을 누른다. 실행기는 요청 시점의 맵·스토리·장비·소스와 원화를 임시 프로젝트에서 빌드한다. **빌드 상태 갱신 → APK 다운로드**로 받는다. 팀에 로그인한 기기에서만 내려받을 수 있다.
5. 단일 APK 업로드 한도는 90MB다. Unity 오류가 나면 스튜디오에 실패 상태가 표시된다. 실행기 임시 폴더의 `dreamwalker-last-build.log`에 직전 실패 로그가 남는다. 기기 내에서 측정한 성능 기록은 게임의 성능 화면에서 확인한다.

실행기를 배포 브랜치와 함께 업데이트한다. 수동 단일 실행/CI에서는 마지막 명령에 `--once`를 붙인다. 빌드 머신이 연결되어 있지 않으면 요청은 대기 상태로 남는다. 실제 APK와 기기 측정치가 생긴 경우에만 Android 실행 검수가 끝난다.

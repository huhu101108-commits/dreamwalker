# 태블릿에서 Android 테스트 빌드 요청하기

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

#!/usr/bin/env bash
# Sends a Unity web build to the studio, where «Unity로 테스트 플레이» runs it (Studio/src/unity-play.js), or the
# development APK of an Android build, which the team downloads from the studio's «Unity 연동» panel.
#   bash Studio/scripts/unity-cloud-upload.sh [folder that holds the web build, or the APK or its folder]
# Who is uploading:
#   DREAMWALKER_RUNNER_KEY   the key from the studio's «실행기 연결» (Unity Build Automation: an environment variable
#                            of the build target; never commit it), or
#   GitHub Actions           the job's own identity (permissions: id-token: write) in this repository's Unity workflow.
# Unity Build Automation: set this file as the build target's post-build script. Without a web build or an APK in the
# folder (another build target) it does nothing, so one script serves every target.
set -euo pipefail

studio="${DREAMWALKER_STUDIO:-https://dreamwalker-snowfield-studio.congenialcockatoo.chatgpt.site}"
say() { echo "[dreamwalker] $*" >&2; }

# The web player's four files sit together: <name>.loader.js, .framework.js, .data and .wasm.
loader="" apk=""
found() { find "$1" -maxdepth 8 -name "$2" -not -path '*/Library/*' -not -path '*/node_modules/*' -not -path '*/Temp/*' 2>/dev/null | head -n 1; }
for root in "${1:-}" "${UNITY_PLAYER_PATH:-}" "${OUTPUT_DIRECTORY:-}" "${BUILD_PATH:-}" "${PROJECT_DIRECTORY:-}" "${WORKSPACE:-}" "."; do
  [ -n "$root" ] && [ -e "$root" ] || continue
  if [ -f "$root" ]; then
    case "$root" in *.apk) apk="$root"; break ;; esac
    root="$(dirname "$root")"
  fi
  loader="$(found "$root" '*.loader.js')"
  [ -n "$loader" ] && break
  apk="$(found "$root" '*.apk')"
  [ -n "$apk" ] && break
done
if [ -z "$loader" ] && [ -z "$apk" ]; then
  say "No Unity web build (*.loader.js) and no APK here. Nothing was uploaded."
  exit 0
fi
base="${loader%.loader.js}"
file_for() {
  case "$1" in
    loader) echo "$loader" ;;
    framework) echo "$base.framework.js" ;;
    data) echo "$base.data" ;;
    code) echo "$base.wasm" ;;
  esac
}
for role in loader framework data code; do
  [ -n "$loader" ] || break
  if [ ! -f "$(file_for "$role")" ]; then
    say "Missing $(file_for "$role"). The studio needs an uncompressed web build: StudioCloudBuild.Prepare sets this (Pre-Export method DreamwalkerCloudBuild.PreExport)."
    exit 1
  fi
done

# The uploader's identity.
if [ -n "${DREAMWALKER_RUNNER_KEY:-}" ]; then
  identity="$DREAMWALKER_RUNNER_KEY"
elif [ -n "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ] && [ -n "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:-}" ]; then
  audience="$studio/api/unity-web/begin"
  identity="$(curl -sS --fail --retry 3 -H "Authorization: Bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
    --get --data-urlencode "audience=$audience" "$ACTIONS_ID_TOKEN_REQUEST_URL" | sed -n 's/.*"value" *: *"\([^"]*\)".*/\1/p')"
  [ -n "$identity" ] || { say "GitHub did not give this job an identity (permissions: id-token: write)."; exit 1; }
else
  say "Set DREAMWALKER_RUNNER_KEY to the key from the studio's «실행기 연결»."
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
# Build Automation's Windows builders run this script in a Unix shell, where curl may be the Windows program: it
# gets file paths in the form it reads.
native() { if command -v cygpath > /dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }
# One request: prints the reply and fails with the studio's message.
call() {
  local path="$1"; shift
  local status
  status="$(curl -sS --retry 3 --retry-connrefused -o "$(native "$work/reply")" -w '%{http_code}' -X POST "$studio/api/unity-web/$path" "$@")" || { say "The studio could not be reached ($path)."; exit 1; }
  # A studio deployed before this upload existed answers the first request as an address it does not know.
  if [ "$path" = begin ] && { [ "$status" = "401" ] || [ "$status" = "404" ]; }; then exit 3; fi
  if [ "$status" != "200" ]; then
    say "The studio refused $path (HTTP $status): $(head -c 400 "$work/reply")"
    exit 1
  fi
  cat "$work/reply"
}
field() { sed -n "s/.*\"$1\" *: *\"\([a-f0-9]*\)\".*/\1/p"; }

set +e
started="$(call begin -H "Authorization: Bearer $identity" -H 'Content-Length: 0')"
began=$?
set -e
if [ "$began" = 3 ]; then
  say "The studio at $studio does not take Unity builds yet: deploy the studio from this branch, then build again. Nothing was uploaded."
  [ -n "${GITHUB_ACTIONS:-}" ] && echo "::warning::The studio does not take Unity builds yet (deploy the studio from this branch). Nothing was uploaded."
  exit 0
fi
[ "$began" = 0 ] || exit "$began"
id="$(printf '%s' "$started" | field id)"
lease="$(printf '%s' "$started" | field lease)"
[ -n "$id" ] && [ -n "$lease" ] || { say "The studio's reply had no upload id."; exit 1; }

commit="${DREAMWALKER_COMMIT:-${GITHUB_SHA:-${BUILD_REVISION:-${GIT_COMMIT:-}}}}"
unity="${DREAMWALKER_UNITY:-${UNITY_VERSION:-}}"
if [ -z "$unity" ] && [ -f ProjectSettings/ProjectVersion.txt ]; then
  unity="$(sed -n 's/^m_EditorVersion: *//p' ProjectSettings/ProjectVersion.txt | tr -d '\r')"
fi
label() { printf '%s' "$1" | tr -cd 'A-Za-z0-9._+-' | head -c "$2"; }
named="{\"commit\":\"$(label "$commit" 64)\",\"unity\":\"$(label "$unity" 24)\"}"

if [ -z "$loader" ]; then
  say "Uploading the APK ($(wc -c < "$apk" | tr -d ' ') bytes)"
  call upload/apk -H "Authorization: Bearer $lease" -H "X-Build-Id: $id" -H 'Content-Type: application/vnd.android.package-archive' \
    --data-binary "@$(native "$apk")" > /dev/null
  call publish-apk -H "Authorization: Bearer $lease" -H "X-Build-Id: $id" -H 'Content-Type: application/json' --data "$named" > /dev/null
  say "The APK is in the studio: 버전 · 백업 → «Unity 연동» → «Unity 개발용 APK 받기»."
  exit 0
fi

for role in loader framework data code; do
  gzip -9 -c "$(file_for "$role")" > "$work/$role.gz"
  say "Uploading $role ($(wc -c < "$(file_for "$role")" | tr -d ' ') bytes, $(wc -c < "$work/$role.gz" | tr -d ' ') gzipped)"
  call "upload/$role" -H "Authorization: Bearer $lease" -H "X-Build-Id: $id" -H 'X-Dreamwalker-Gzip: 1' \
    -H 'Content-Type: application/octet-stream' --data-binary "@$(native "$work/$role.gz")" > /dev/null
done

call publish -H "Authorization: Bearer $lease" -H "X-Build-Id: $id" -H 'Content-Type: application/json' --data "$named" > /dev/null
say "The Unity web build is in the studio: open 버전 · 백업 → «Unity 연동», or press «Unity ▶»."

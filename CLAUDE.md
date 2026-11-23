# Dreamwalker Studio: Claude Code instructions

## Project and task boundaries

- This repository contains the tablet-first Dreamwalker game production studio and its Unity handoff runtime.
- Read `Studio/README.md`, `Studio/WORK_QUEUE.md`, and `Studio/VERIFICATION.md` before changing behavior. Check the current branch and working tree first.
- Implement the requested studio editing, preview, validation, and export behavior. The creator chooses game names, story, combat rules and values, controls, screens, and scene order. Do not hard-code those choices as product defaults.
- Prefer extending the existing editor and data model over creating a parallel workflow. Preserve project, team-version, and player-save compatibility.
- Keep review and verification data out of exported games. Never put API keys, credentials, account preferences, or private project notes in a game export.

## Change and review workflow

- Work on a task branch based on `feature/tablet-production-studio`; do not commit directly to `main` or merge your own pull request.
- Keep changes scoped to the requested issue or pull request. Do not overwrite unrelated work or edit files assigned to another active task.
- Before editing, inspect existing entry points and related tests. Use an isolated project copy and a separate save slot for play or compatibility checks.
- Do not claim that browser, Unity Editor, Android APK, Galaxy Tab, or two-device online checks passed unless that environment actually ran them. Report the environment used and list blocked device-only checks.
- For Studio code changes, run `npm test` from `Studio/` when the environment supports it. Report failures and missing tools accurately; do not remove checks to get a green result.
- Do not publish or deploy from Claude Code. Submit a pull request with a concise change summary, verification results, and remaining conditions.

## Studio structure

- `Studio/src`: tablet editor, project model, Worker services, web play, export, and assistant integrations.
- `Studio/scripts`: build, verification, browser, and native contract checks.
- `Assets/Dreamwalker`: Unity runtime and editor integration. Run `node scripts/sync-unity.mjs ..` from `Studio/` only when intentionally syncing runtime sources.
- Keep web and Unity behavior aligned where the shared project format promises parity; identify intentional differences.


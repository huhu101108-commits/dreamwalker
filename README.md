# Dreamwalker — Godot 4.7.2 2D Combat Prototype

Godot 4.7.2 / GDScript / Android tablet + PC. This branch replaces Unity as the **active engine** while leaving the old Unity combat work preserved in its separate GitHub PR/branch.

## Run
- Open `project.godot` in **Godot 4.7.2**.
- Main scene: `res://scenes/training_room.tscn`.
- PC: A/D or ←/→ move, Space jump, J/Z attack, K/X dodge, Shift dash, R reset.
- Android: on-screen controls.
- One hero (Baekseol) and an inactive Sangmi training dummy use temporary vector artwork. **Neither character's final animation sheet has been integrated yet.**

## Combat
- 60Hz combat core uses millipixel integer position, integer hitboxes and integer frame data.
- 3 successive attacks (tap once, then tap during current attack to queue follow-up).
- Dodge invulnerability; dash; falling; hitstun; deterministic snapshot/restore API.
- Visible turquoise hitbox uses **the exact geometry** used by the hit detector.
- GitHub Actions runs combat tests with Godot 4.7.2.

## Status
Initial development implementation; **not yet tested on a real Android tablet or in the editor in this chat environment**. See [개발 안내](docs/development.md).

## Future
Online PvP is NOT active. The production Android build will be PvE-only; future PC PvP will use a dedicated server and verified gear normalization. Existing story, 8 character names, 10 gear slots, PvE content, direct trading, event administration and mandatory pre-patch backups are preserved in the roadmap.

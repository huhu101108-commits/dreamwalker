# Dreamwalker — Godot 4.7.2

Godot 4.7.2/GDScript combat simulator, training scene, Android touch controls. Existing Unity work is kept separately.

## Run
1. Open this branch in Godot 4.7.2.
2. Extract the character graphics ZIP **into the project root** (same folder as project.godot). See `assets/README_ART_PACK.md`.
3. Run `scenes/training_room.tscn`.

PC controls: A/D or ←/→ movement, Space jump, J/Z attack, K/X dodge, Shift dash, R reset. Android touch buttons appear on the training scene.

## Config
Edit `config/combat_tuning.json` to change movement acceleration/friction, jump, dash, and dodge feel. Restart the game to reload. Server-authoritative profile locking will be required for PvP.

## State
Core combat/snapshot tests previously passed. Latest graphics integration and tuning changes require a new CI run and real Android test. Both character images are extracted from existing character sheet references; animation remains basic pose sway, not full character rigging. Online PvP is not implemented.

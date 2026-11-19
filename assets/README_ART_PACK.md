# Art pack for Dreamwalker v0.2

Two **original established character sheet** extracts, not replacements or newly invented designs.

## Contents
- `assets/characters/baekseol/side.png` — Baekseol silver-haired blue-coat profile (transparent PNG)
- `assets/characters/baekseol/portrait.png` — Baekseol front-view design reference (transparent PNG)
- `assets/characters/sangmi/side.png` — Sangmi/Heuk-a black-haired plum-costume profile (transparent PNG)
- `assets/characters/sangmi/portrait.png` — Sangmi design reference (transparent PNG)
- `assets/background_snow_rail.png` — original provisional snowy railway arena background

Extract this ZIP **into the root of the Godot project**, beside `project.godot`. Then reopen the scene. Game rendering uses the two *side* files; the *portrait* images are provided for character selection UI later.

The existing game's graphics are character sheets, not animation sprites. The in-game body is temporarily moved using subtle sway, tilt, and displacement. A true motion pipeline still needs independently drawn poses, skeleton components, and animation timings. The weapon and hitbox use Godot drawing for now.

## Tuning
Edit `config/combat_tuning.json` in the repository and reload the scene to tune acceleration, deceleration, air control, jump, dash, and dodge. The simulation validates bounds; the future admin UI should publish signed/versioned server-authoritative profiles. Avoid mid-match tuning edits.

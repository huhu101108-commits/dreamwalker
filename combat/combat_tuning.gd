extends RefCounted
## Server must lock a versioned tuning profile before future PvP matches.
const PATH := "res://config/combat_tuning.json"

const DEFAULT: Dictionary = {
    "run_speed": 6600,
    "ground_acceleration": 2400,
    "ground_friction": 3100,
    "air_acceleration": 1300,
    "jump_speed": 14700,
    "gravity": 660,
    "terminal_fall": 20000,
    "dash_speed": 14200,
    "dash_duration": 8,
    "dash_cooldown": 24,
    "dodge_speed": 10400,
    "dodge_duration": 15,
    "dodge_invulnerability": 9,
    "coyote_ticks": 6,
    "jump_buffer_ticks": 7,
    "attack_move_speed": 2300,
    "attack_acceleration": 2100,
    "hit_friction": 1200
}
const BOUNDS: Dictionary = {
    "run_speed": Vector2i(2000, 16000),
    "ground_acceleration": Vector2i(500, 16000),
    "ground_friction": Vector2i(500, 16000),
    "air_acceleration": Vector2i(300, 14000),
    "jump_speed": Vector2i(6000, 24000),
    "gravity": Vector2i(250, 1600),
    "terminal_fall": Vector2i(8000, 40000),
    "dash_speed": Vector2i(5000, 26000),
    "dash_duration": Vector2i(2, 25),
    "dash_cooldown": Vector2i(2, 100),
    "dodge_speed": Vector2i(2000, 23000),
    "dodge_duration": Vector2i(4, 30),
    "dodge_invulnerability": Vector2i(0, 25),
    "coyote_ticks": Vector2i(0, 15),
    "jump_buffer_ticks": Vector2i(0, 15),
    "attack_move_speed": Vector2i(0, 9000),
    "attack_acceleration": Vector2i(200, 16000),
    "hit_friction": Vector2i(100, 8000)
}

static func load_profile() -> Dictionary:
    var values: Dictionary = DEFAULT.duplicate(true)
    if not FileAccess.file_exists(PATH):
        return values
    var file: FileAccess = FileAccess.open(PATH, FileAccess.READ)
    if file == null:
        return values
    var parsed: Variant = JSON.parse_string(file.get_as_text())
    if not (parsed is Dictionary):
        push_warning("Invalid tuning profile; defaults loaded.")
        return values
    for key in DEFAULT.keys():
        if not parsed.has(key):
            continue
        var proposed: Variant = parsed[key]
        if typeof(proposed) != TYPE_INT and typeof(proposed) != TYPE_FLOAT:
            continue
        var bound: Vector2i = BOUNDS[key]
        values[key] = clampi(int(proposed), bound.x, bound.y)
    return values

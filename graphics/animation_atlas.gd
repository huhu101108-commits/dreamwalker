extends RefCounted
## Renders frame regions from a transparent source-sheet-derived PNG atlas.
## Rendering-only helper: never changes collision or authoritative combat state.

const State = preload("res://combat/combat_state.gd")
const Moves = preload("res://combat/move_data.gd")

const COLUMNS := 8
const ROWS := 7
const FRAME_WIDTH := 320
const FRAME_HEIGHT := 512

# Row order: idle, run, jump, dodge, combo attacks 1/2/3.
static func frame_for(actor: Object, tick: int, tuning: Dictionary) -> Vector2i:
    if actor.action == State.ATTACK:
        var total: int = maxi(1, Moves.total_frames(actor.attack_index))
        var column: int = clampi(int(float(actor.action_frame) * float(COLUMNS) / float(total)), 0, COLUMNS - 1)
        return Vector2i(column, 4 + clampi(actor.attack_index, 0, 2))
    if actor.action == State.DODGE:
        return Vector2i(_scaled_frame(actor.action_frame, int(tuning["dodge_duration"])), 3)
    if actor.action == State.DASH:
        return Vector2i(_scaled_frame(actor.action_frame, int(tuning["dash_duration"])), 1)
    if actor.y > 0:
        return Vector2i(2 if actor.vy > 0 else 5, 2)
    if absi(actor.vx) > 650:
        return Vector2i((tick / 4) % COLUMNS, 1)
    return Vector2i((tick / 10) % COLUMNS, 0)

static func region_for(frame: Vector2i) -> Rect2:
    return Rect2(
        float(frame.x * FRAME_WIDTH),
        float(frame.y * FRAME_HEIGHT),
        float(FRAME_WIDTH),
        float(FRAME_HEIGHT))

static func _scaled_frame(frame: int, total: int) -> int:
    return clampi(int(float(frame) * COLUMNS / float(maxi(1, total))), 0, COLUMNS - 1)

extends RefCounted
## All attacks are described in integer simulation ticks and integer pixel dimensions.
## Visible hit-region overlays read these same values as the hit detector.

const ATTACKS: Array[Dictionary] = [
    {"startup": 5, "active": 4, "recovery": 12,
     "min_x": 18, "max_x": 112, "min_y": 22, "max_y": 118,
     "damage": 12, "hitstun": 10, "push": 4400},
    {"startup": 4, "active": 4, "recovery": 14,
     "min_x": 14, "max_x": 128, "min_y": 32, "max_y": 140,
     "damage": 13, "hitstun": 11, "push": 3200},
    {"startup": 8, "active": 5, "recovery": 19,
     "min_x": 24, "max_x": 154, "min_y": 12, "max_y": 126,
     "damage": 22, "hitstun": 16, "push": 6700},
]

static func get_move(index: int) -> Dictionary:
    return ATTACKS[clampi(index, 0, ATTACKS.size() - 1)]

static func total_frames(index: int) -> int:
    var move: Dictionary = get_move(index)
    return int(move["startup"]) + int(move["active"]) + int(move["recovery"])

static func active_at(index: int, frame: int) -> bool:
    var move: Dictionary = get_move(index)
    return frame >= int(move["startup"]) and frame < int(move["startup"]) + int(move["active"])

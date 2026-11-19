extends RefCounted
## Integer AABB intersection: matches render overlay exactly and is independent of Godot physics.

const SCALE := 1000
const HALF_WIDTH := 22 * SCALE
const HEIGHT := 100 * SCALE

static func overlaps(attacker: Object, target: Object, move: Dictionary) -> bool:
    var left: int
    var right: int
    if attacker.facing == 1:
        left = attacker.x + int(move["min_x"]) * SCALE
        right = attacker.x + int(move["max_x"]) * SCALE
    else:
        left = attacker.x - int(move["max_x"]) * SCALE
        right = attacker.x - int(move["min_x"]) * SCALE

    var lower: int = attacker.y + int(move["min_y"]) * SCALE
    var upper: int = attacker.y + int(move["max_y"]) * SCALE
    return left <= target.x + HALF_WIDTH and right >= target.x - HALF_WIDTH and lower <= target.y + HEIGHT and upper >= target.y

static func hit_region(attacker: Object, move: Dictionary) -> Rect2:
    var min_x: float
    if attacker.facing == 1:
        min_x = float(attacker.x) / SCALE + float(move["min_x"])
    else:
        min_x = float(attacker.x) / SCALE - float(move["max_x"])
    var width: float = float(int(move["max_x"]) - int(move["min_x"]))
    var min_y: float = float(attacker.y) / SCALE + float(move["min_y"])
    var height: float = float(int(move["max_y"]) - int(move["min_y"]))
    return Rect2(min_x, min_y, width, height)

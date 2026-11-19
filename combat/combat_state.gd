extends RefCounted
## Pure serializable state: no SceneTree, AnimationPlayer, physics body or networking dependency.

const IDLE := 0
const ATTACK := 1
const DODGE := 2
const DASH := 3
const HITSTUN := 4

var id: int = 0
var x: int = 0  # millipixels (1000 = one screen pixel)
var y: int = 0  # altitude above the ground, positive upward
var vx: int = 0
var vy: int = 0
var facing: int = 1
var health: int = 100
var action: int = IDLE
var action_frame: int = 0
var attack_index: int = 0
var queued_combo: bool = false
var hit_mask: int = 0
var invulnerable: int = 0
var dash_cooldown: int = 0
var last_buttons: int = 0

func _init(fighter_id: int = 0, spawn_x: int = 0) -> void:
    id = fighter_id
    x = spawn_x
    facing = 1 if fighter_id == 1 else -1

func snapshot() -> Dictionary:
    return {
        "id": id, "x": x, "y": y, "vx": vx, "vy": vy,
        "facing": facing, "health": health, "action": action,
        "action_frame": action_frame, "attack_index": attack_index,
        "queued_combo": queued_combo, "hit_mask": hit_mask,
        "invulnerable": invulnerable, "dash_cooldown": dash_cooldown,
        "last_buttons": last_buttons
    }

func restore(data: Dictionary) -> void:
    id = int(data["id"])
    x = int(data["x"])
    y = int(data["y"])
    vx = int(data["vx"])
    vy = int(data["vy"])
    facing = int(data["facing"])
    health = int(data["health"])
    action = int(data["action"])
    action_frame = int(data["action_frame"])
    attack_index = int(data["attack_index"])
    queued_combo = bool(data["queued_combo"])
    hit_mask = int(data["hit_mask"])
    invulnerable = int(data["invulnerable"])
    dash_cooldown = int(data["dash_cooldown"])
    last_buttons = int(data["last_buttons"])

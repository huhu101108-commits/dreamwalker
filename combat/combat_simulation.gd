extends RefCounted
## Server-reusable 60 Hz combat model. One step == exactly one simulation tick.
## The client, animation and network layers may read state but do not authorize hits.

const State = preload("res://combat/combat_state.gd")
const Moves = preload("res://combat/move_data.gd")
const HitDetection = preload("res://combat/hit_detection.gd")

const BUTTON_JUMP := 1
const BUTTON_ATTACK := 2
const BUTTON_DODGE := 4
const BUTTON_DASH := 8

const SCALE := 1000
const ARENA_HALF_WIDTH := 560 * SCALE
const RUN_PER_TICK := 5200
const JUMP_PER_TICK := 14000
const GRAVITY_PER_TICK := 630
const TERMINAL_FALL := 19000
const DASH_PER_TICK := 13000
const DODGE_PER_TICK := 10200

var tick: int = 0
var actors: Dictionary = {}
var last_events: Array[Dictionary] = []

func spawn(fighter_id: int, spawn_x: int) -> void:
    actors[fighter_id] = State.new(fighter_id, spawn_x)

func reset() -> void:
    tick = 0
    actors.clear()
    last_events.clear()

func snapshot() -> Dictionary:
    var ordered: Array = actors.keys()
    ordered.sort()
    var entries: Array[Dictionary] = []
    for fighter_id in ordered:
        entries.append(actors[fighter_id].snapshot())
    return {"tick": tick, "actors": entries}

func restore(data: Dictionary) -> void:
    tick = int(data["tick"])
    actors.clear()
    last_events.clear()
    for entry in data["actors"]:
        var actor = State.new()
        actor.restore(entry)
        actors[actor.id] = actor

func step(inputs: Dictionary) -> Array[Dictionary]:
    tick += 1
    last_events.clear()
    var ordered: Array = actors.keys()
    ordered.sort()
    for fighter_id in ordered:
        var actor = actors[fighter_id]
        var command: Dictionary = inputs.get(fighter_id, {})
        _advance(actor, clampi(int(command.get("axis", 0)), -1, 1), int(command.get("buttons", 0)))

    # First collect all possible hits, then resolve them. Simultaneous attacks
    # are therefore evaluated from the same post-input tick.
    var possible_hits: Array[Dictionary] = []
    for attacker_id in ordered:
        var attacker = actors[attacker_id]
        if attacker.health <= 0 or attacker.action != State.ATTACK:
            continue
        if not Moves.active_at(attacker.attack_index, attacker.action_frame):
            continue
        var move: Dictionary = Moves.get_move(attacker.attack_index)
        for defender_id in ordered:
            if attacker_id == defender_id:
                continue
            var defender = actors[defender_id]
            if defender.health <= 0 or (attacker.hit_mask & (1 << defender_id)) != 0:
                continue
            if HitDetection.overlaps(attacker, defender, move):
                possible_hits.append({"from": attacker_id, "to": defender_id, "move": move})

    for item in possible_hits:
        var attacker = actors[item["from"]]
        var defender = actors[item["to"]]
        var mask: int = 1 << defender.id
        if (attacker.hit_mask & mask) != 0:
            continue
        attacker.hit_mask |= mask
        if defender.invulnerable > 0:
            last_events.append({"kind": "evade", "target": defender.id, "tick": tick})
            continue
        var move: Dictionary = item["move"]
        var amount: int = int(move["damage"])
        defender.health = maxi(0, defender.health - amount)
        defender.vx = int(move["push"]) * attacker.facing
        defender.vy = maxi(defender.vy, 3500)
        defender.action = State.HITSTUN
        defender.action_frame = 0
        defender.queued_combo = false
        last_events.append({
            "kind": "hit", "attacker": attacker.id, "target": defender.id,
            "damage": amount, "tick": tick, "x": defender.x, "y": defender.y
        })
    return last_events.duplicate(true)

func _advance(actor: Object, axis: int, buttons: int) -> void:
    var pressed: int = buttons & (~actor.last_buttons)
    actor.last_buttons = buttons
    if actor.health <= 0:
        return

    actor.invulnerable = maxi(0, actor.invulnerable - 1)
    actor.dash_cooldown = maxi(0, actor.dash_cooldown - 1)

    if actor.action == State.HITSTUN:
        actor.action_frame += 1
        if actor.action_frame >= 13:
            actor.action = State.IDLE
            actor.action_frame = 0
    elif actor.action == State.ATTACK:
        if (pressed & BUTTON_ATTACK) != 0 and actor.attack_index < 2:
            actor.queued_combo = true
        actor.action_frame += 1
        if actor.action_frame >= Moves.total_frames(actor.attack_index):
            if actor.queued_combo and actor.attack_index < 2:
                _start_attack(actor, actor.attack_index + 1)
            else:
                actor.action = State.IDLE
                actor.action_frame = 0
                actor.queued_combo = false
    elif actor.action == State.DODGE:
        actor.action_frame += 1
        if actor.action_frame >= 16:
            actor.action = State.IDLE
            actor.action_frame = 0
    elif actor.action == State.DASH:
        actor.action_frame += 1
        if actor.action_frame >= 9:
            actor.action = State.IDLE
            actor.action_frame = 0

    if actor.action == State.IDLE:
        if (pressed & BUTTON_DODGE) != 0:
            actor.action = State.DODGE
            actor.action_frame = 0
            actor.invulnerable = 9
        elif (pressed & BUTTON_ATTACK) != 0:
            _start_attack(actor, 0)
        elif (pressed & BUTTON_DASH) != 0 and actor.dash_cooldown == 0:
            actor.action = State.DASH
            actor.action_frame = 0
            actor.dash_cooldown = 28

    if axis != 0 and actor.action == State.IDLE:
        actor.facing = axis

    if actor.action == State.HITSTUN:
        actor.vx = int(float(actor.vx) * 0.80)
    elif actor.action == State.DODGE:
        actor.vx = actor.facing * DODGE_PER_TICK
    elif actor.action == State.DASH:
        actor.vx = actor.facing * DASH_PER_TICK
    elif actor.action == State.ATTACK:
        actor.vx = axis * (RUN_PER_TICK / 3)
    else:
        actor.vx = axis * RUN_PER_TICK

    if (pressed & BUTTON_JUMP) != 0 and actor.y == 0 and actor.action == State.IDLE:
        actor.vy = JUMP_PER_TICK

    actor.x = clampi(actor.x + actor.vx, -ARENA_HALF_WIDTH, ARENA_HALF_WIDTH)
    if actor.y > 0 or actor.vy > 0:
        actor.vy = maxi(actor.vy - GRAVITY_PER_TICK, -TERMINAL_FALL)
        actor.y = maxi(0, actor.y + actor.vy)
        if actor.y == 0:
            actor.vy = 0

func _start_attack(actor: Object, index: int) -> void:
    actor.action = State.ATTACK
    actor.action_frame = 0
    actor.attack_index = index
    actor.hit_mask = 0
    actor.queued_combo = false

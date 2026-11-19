extends Node2D
## Temporary vector stand-ins. Final Baekseol/Sangmi character sheet assets will
## replace drawing functions; simulation and damage must remain unchanged.

const Core = preload("res://combat/combat_simulation.gd")
const Moves = preload("res://combat/move_data.gd")
const State = preload("res://combat/combat_state.gd")
const HitDetection = preload("res://combat/hit_detection.gd")

var combat = Core.new()
var requested_buttons: int = 0
var touch_left: bool = false
var touch_right: bool = false
var mobile_buttons: Dictionary = {}
var mobile_layer: CanvasLayer
var mobile_root: Control
var recent_hit_frames: int = 0
var dummy_respawn_frames: int = 0

func _ready() -> void:
    _restart()
    _build_touch_controls()
    get_viewport().size_changed.connect(_layout_touch_controls)
    queue_redraw()

func _restart() -> void:
    combat.reset()
    combat.spawn(1, -270000)
    combat.spawn(2, 130000)
    requested_buttons = 0
    recent_hit_frames = 0
    dummy_respawn_frames = 0
    queue_redraw()

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventKey and event.pressed and not event.echo:
        match event.keycode:
            KEY_SPACE:
                requested_buttons |= Core.BUTTON_JUMP
            KEY_J, KEY_Z:
                requested_buttons |= Core.BUTTON_ATTACK
            KEY_K, KEY_X:
                requested_buttons |= Core.BUTTON_DODGE
            KEY_SHIFT:
                requested_buttons |= Core.BUTTON_DASH
            KEY_R:
                _restart()
        get_viewport().set_input_as_handled()

func _physics_process(_delta: float) -> void:
    var horizontal: int = int(Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT) or touch_right) - int(Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT) or touch_left)
    var command: Dictionary = {"axis": horizontal, "buttons": requested_buttons}
    requested_buttons = 0
    var events: Array[Dictionary] = combat.step({1: command, 2: {"axis": 0, "buttons": 0}})
    for item in events:
        if item.get("kind", "") == "hit":
            recent_hit_frames = 11
    recent_hit_frames = maxi(0, recent_hit_frames - 1)
    var dummy = combat.actors[2]
    if dummy.health <= 0:
        dummy_respawn_frames += 1
        if dummy_respawn_frames > 95:
            dummy.health = 100
            dummy.action = State.IDLE
            dummy.action_frame = 0
            dummy.x = 130000
            dummy.y = 0
            dummy.vx = 0
            dummy.vy = 0
            dummy_respawn_frames = 0
    else:
        dummy_respawn_frames = 0
    queue_redraw()

func _draw() -> void:
    var size: Vector2 = get_viewport_rect().size
    var ground: float = size.y * 0.78
    var cx: float = size.x * 0.50
    draw_rect(Rect2(Vector2.ZERO, size), Color("#111d32"))
    draw_circle(Vector2(size.x * .77, size.y * .19), 50.0, Color("#9db6d1", .21))
    draw_colored_polygon(PackedVector2Array([
        Vector2(-100, ground), Vector2(135, ground - 226), Vector2(310, ground - 74),
        Vector2(550, ground - 310), Vector2(770, ground - 76),
        Vector2(size.x + 100, ground)]), Color("#273b55"))
    draw_colored_polygon(PackedVector2Array([
        Vector2(-100, ground), Vector2(145, ground - 133), Vector2(330, ground - 12),
        Vector2(600, ground - 176), Vector2(840, ground - 33),
        Vector2(size.x + 100, ground)]), Color("#344b64"))
    draw_rect(Rect2(0, ground, size.x, size.y - ground), Color("#34475b"))
    draw_line(Vector2(0, ground), Vector2(size.x, ground), Color("#d5e7f4"), 7.0)

    # Every frame reads the same simulation state used for authoritative hits.
    _draw_fighter(combat.actors[2], cx, ground, false)
    _draw_fighter(combat.actors[1], cx, ground, true)
    _draw_hud(size)

func _draw_fighter(actor: Object, cx: float, ground: float, is_baekseol: bool) -> void:
    var feet := Vector2(cx + float(actor.x) / 1000.0, ground - float(actor.y) / 1000.0)
    var direction: float = float(actor.facing)
    draw_set_transform(feet, 0.0, Vector2(direction, 1.0))
    var coat := Color("#3d6790") if is_baekseol else Color("#643c58")
    var inner := Color("#1c2c43") if is_baekseol else Color("#292731")
    var accent := Color("#b7e5fb") if is_baekseol else Color("#7fbbc0")
    var head := Color("#eadbd2")

    # Silhouette includes only a primitive stand-in, not final animation art.
    draw_colored_polygon(PackedVector2Array([
        Vector2(-19, -72), Vector2(-14, -14), Vector2(-1, -24),
        Vector2(6, -12), Vector2(21, -73)]), coat)
    draw_rect(Rect2(-13, -31, 10, 31), inner)
    draw_rect(Rect2(4, -31, 10, 31), inner)
    draw_rect(Rect2(-22, -104, 44, 66), inner)
    draw_rect(Rect2(-24, -101, 8, 47), coat)
    draw_rect(Rect2(16, -101, 8, 47), coat)
    draw_circle(Vector2(0, -123), 24.0, head)
    draw_arc(Vector2(0, -128), 23.0, PI, TAU, 14, Color("#e4edf7") if is_baekseol else Color("#202434"), 13.0)
    draw_rect(Rect2(-26, -105, 52, 8), accent)
    if is_baekseol:
        draw_rect(Rect2(11, -142, 7, 30), Color("#4e91d7"))
        draw_rect(Rect2(-16, -94, 8, 8), Color("#e4a66f"))
    else:
        draw_rect(Rect2(-26, -95, 17, 19), Color("#a45270"))
        draw_arc(Vector2(-19, -65), 23.0, -PI, 0.0, 11, Color("#6fb1b6"), 3.0)

    if is_baekseol:
        var sword_angle: float = -1.30
        if actor.action == State.ATTACK:
            var move: Dictionary = Moves.get_move(actor.attack_index)
            var progress: float = float(actor.action_frame) / float(Moves.total_frames(actor.attack_index))
            sword_angle = lerpf(-1.1, 1.1, clampf(progress * 2.7, 0, 1))
            _draw_swing(actor, feet, cx, ground)
        var wrist := Vector2(17, -87)
        var tip := wrist + Vector2(cos(sword_angle), sin(sword_angle)) * 91.0
        draw_line(wrist, tip, Color("#e9f7ff"), 8.0)
        draw_line(wrist, tip, Color("#a6dffd"), 3.0)
    else:
        draw_circle(Vector2(-20, -68), 10.0, Color("#c0a170"))
        draw_arc(Vector2(-20, -68), 13.0, 0, TAU, 16, Color("#6fb1b6"), 2.0)

    draw_set_transform(Vector2.ZERO)

func _draw_swing(actor: Object, _feet: Vector2, cx: float, ground: float) -> void:
    var move: Dictionary = Moves.get_move(actor.attack_index)
    var startup: int = int(move["startup"])
    var active: int = int(move["active"])
    var frame: int = actor.action_frame
    if frame > startup + active + 4:
        return
    # The visible cyan box is the exact AABB tested by hit_detection.gd.
    var region: Rect2 = HitDetection.hit_region(actor, move)
    var x: float = cx + region.position.x
    var y: float = ground - (region.position.y + region.size.y)
    var visual_rect := Rect2(x, y, region.size.x, region.size.y)
    if frame < startup:
        draw_set_transform(Vector2.ZERO)
        draw_rect(visual_rect, Color("#8fdaff", .07))
        draw_rect(visual_rect, Color("#70caef", .42), false, 2.0)
        draw_set_transform(Vector2(cx + float(actor.x) / 1000.0, ground - float(actor.y) / 1000.0), 0.0, Vector2(float(actor.facing), 1.0))
    else:
        draw_set_transform(Vector2.ZERO)
        draw_rect(visual_rect, Color("#48bcfa", .14))
        draw_rect(visual_rect, Color("#9be5ff", .78), false, 3.0)
        var slash_center := visual_rect.get_center()
        draw_arc(slash_center, minf(region.size.x, region.size.y) * .38, -1.4, 1.2, 28, Color("#ecfbff", .75), 6.0, true)
        draw_set_transform(Vector2(cx + float(actor.x) / 1000.0, ground - float(actor.y) / 1000.0), 0.0, Vector2(float(actor.facing), 1.0))

func _draw_hud(size: Vector2) -> void:
    var font: Font = ThemeDB.fallback_font
    var hero = combat.actors[1]
    var dummy = combat.actors[2]
    draw_string(font, Vector2(26, 37), "DREAMWALKER / GODOT COMBAT LAB", HORIZONTAL_ALIGNMENT_LEFT, -1, 24, Color("#e8f3ff"))
    draw_string(font, Vector2(27, 66), "Move A/D    Jump SPACE    Attack J/Z    Dodge K/X    Dash SHIFT    Restart R", HORIZONTAL_ALIGNMENT_LEFT, -1, 17, Color("#b6c8da"))
    draw_string(font, Vector2(27, 99), "BAEKSEOL  HP: %d    SANGMI dummy HP: %d    tick: %d" % [hero.health, dummy.health, combat.tick], HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color("#eff5ff"))
    draw_string(font, Vector2(26, size.y - 28), "Prototype art only  |  hitbox overlay = real damage area  |  No online PvP yet", HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color("#b9c8d8"))
    if recent_hit_frames > 0:
        draw_string(font, Vector2(size.x * .44, size.y * .27), "HIT!", HORIZONTAL_ALIGNMENT_LEFT, -1, 36, Color("#f6f5c7"))

func _build_touch_controls() -> void:
    mobile_layer = CanvasLayer.new()
    add_child(mobile_layer)
    mobile_root = Control.new()
    mobile_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
    mobile_root.set_anchors_preset(Control.PRESET_FULL_RECT)
    mobile_layer.add_child(mobile_root)
    for action in ["left", "right", "jump", "attack", "dodge", "dash"]:
        var button := Button.new()
        button.name = "Touch_" + action
        button.text = {"left": "<", "right": ">", "jump": "JUMP", "attack": "ATK", "dodge": "DODGE", "dash": "DASH"}[action]
        button.focus_mode = Control.FOCUS_NONE
        button.button_down.connect(_touch_down.bind(action))
        button.button_up.connect(_touch_up.bind(action))
        mobile_root.add_child(button)
        mobile_buttons[action] = button
    _layout_touch_controls()

func _layout_touch_controls() -> void:
    var dimensions: Vector2 = get_viewport_rect().size
    var width: float = clampf(dimensions.x * .095, 64, 104)
    var gap: float = 12.0
    var bottom: float = dimensions.y - width - 52
    var layout: Dictionary = {
        "left": Vector2(22, bottom),
        "right": Vector2(22 + width + gap, bottom),
        "jump": Vector2(dimensions.x - width - 22, bottom),
        "attack": Vector2(dimensions.x - width * 2 - gap - 22, bottom),
        "dodge": Vector2(dimensions.x - width * 3 - gap * 2 - 22, bottom),
        "dash": Vector2(dimensions.x - width * 4 - gap * 3 - 22, bottom)
    }
    for action in mobile_buttons:
        var button: Button = mobile_buttons[action]
        button.position = layout[action]
        button.size = Vector2(width, width)

func _touch_down(action: String) -> void:
    match action:
        "left":
            touch_left = true
        "right":
            touch_right = true
        "jump":
            requested_buttons |= Core.BUTTON_JUMP
        "attack":
            requested_buttons |= Core.BUTTON_ATTACK
        "dodge":
            requested_buttons |= Core.BUTTON_DODGE
        "dash":
            requested_buttons |= Core.BUTTON_DASH

func _touch_up(action: String) -> void:
    match action:
        "left":
            touch_left = false
        "right":
            touch_right = false

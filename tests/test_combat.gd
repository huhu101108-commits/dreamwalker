extends SceneTree
## Run after editor import: godot --headless --path . --script res://tests/test_combat.gd

const Core = preload("res://combat/combat_simulation.gd")
const State = preload("res://combat/combat_state.gd")
var failed: int = 0

func _initialize() -> void:
    _test_single_hit()
    _test_dodge_invulnerability()
    _test_snapshot_replay()
    if failed == 0:
        print("DREAMWALKER TESTS PASSED (3 cases)")
    else:
        push_error("DREAMWALKER TESTS FAILED: %d" % failed)
    quit(0 if failed == 0 else 1)

func _expect(condition: bool, message: String) -> void:
    if not condition:
        failed += 1
        push_error(message)

func _make_sim() -> Object:
    var sim = Core.new()
    sim.spawn(1, 0)
    sim.spawn(2, 70000)
    return sim

func _test_single_hit() -> void:
    var sim = _make_sim()
    sim.step({1: {"axis": 0, "buttons": Core.BUTTON_ATTACK}})
    for i in range(30):
        sim.step({})
    _expect(sim.actors[2].health == 88, "one slash should apply exactly one 12-HP hit")
    _expect(sim.actors[1].health == 100, "training attacker should not damage itself")

func _test_dodge_invulnerability() -> void:
    var sim = _make_sim()
    sim.step({
        1: {"axis": 0, "buttons": Core.BUTTON_ATTACK},
        2: {"axis": 0, "buttons": Core.BUTTON_DODGE}
    })
    for i in range(10):
        sim.step({})
    _expect(sim.actors[2].health == 100, "dodge invulnerability should deny hit during active ticks")

func _test_snapshot_replay() -> void:
    var sim = _make_sim()
    var commands: Array[Dictionary] = []
    for i in range(132):
        var buttons := 0
        if i == 9 or i == 26 or i == 57:
            buttons |= Core.BUTTON_ATTACK
        if i == 44:
            buttons |= Core.BUTTON_JUMP
        if i == 76:
            buttons |= Core.BUTTON_DODGE
        var axis := 1 if i < 17 else (-1 if i > 73 and i < 100 else 0)
        commands.append({1: {"axis": axis, "buttons": buttons}, 2: {"axis": 0, "buttons": 0}})

    for i in range(66):
        sim.step(commands[i])
    var saved: Dictionary = sim.snapshot()
    for i in range(66, commands.size()):
        sim.step(commands[i])
    var expected: Dictionary = sim.snapshot()

    var replay = Core.new()
    replay.restore(saved)
    for i in range(66, commands.size()):
        replay.step(commands[i])
    _expect(replay.snapshot() == expected, "restored snapshot + replayed inputs must match exactly")

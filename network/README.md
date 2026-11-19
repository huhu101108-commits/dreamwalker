# Networking — planned, NOT yet implemented

The offline combat core has two explicit contracts:
- `CombatSimulation.step({peer_id: {"axis": -1..1, "buttons": int}})` advances exactly one 60 Hz tick.
- `CombatSimulation.snapshot()` and `restore(snapshot)` persist all currently relevant combat fields.

Later network tasks (test against netfox on Godot 4.7.2 + Android before choosing it):
1. Dedicated authoritative Linux process using ENet and tick-indexed input messages.
2. Server validates inputs and owned PvP equipment; client never sends accepted damage.
3. Snapshot transfer with authoritative tick and latest acknowledged input tick.
4. Client-side prediction and input replay; remote entity interpolation.
5. Simulated RTT/loss tests (0/40/80/120/200 ms, 0–5% loss).
6. Production Android PvP prohibition enforced server-side; test accounts can use development server only.

Do not infer that these modules are complete because their interfaces are specified here.

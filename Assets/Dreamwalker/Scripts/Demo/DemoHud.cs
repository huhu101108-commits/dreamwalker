using Dreamwalker.Combat;
using Dreamwalker.Player;
using Dreamwalker.UI;
using UnityEngine;

namespace Dreamwalker.Demo
{
    /// <summary>
    /// Development-only demo HUD. Mobile controls use the same
    /// Request* entry points as keyboard input, without a second combat logic.
    /// </summary>
    public sealed class DemoHud : MonoBehaviour
    {
        public BaekseolMotor motor;
        public BaekseolSlash attack;
        public CombatTarget trainingDummy;

        private StudioPainter ui;
        private void OnEnable() { ui ??= StudioPainter.Create(this, "Dreamwalker Demo HUD", 5, Paint); }
        // A disabled HUD leaves nothing on screen; the game screens take over while studio content plays.
        private void OnDisable() { ui?.Dispose(); ui = null; }
        private void LateUpdate() => ui?.Frame(Paint);

        private void Paint()
        {
            if (StudioOnlineArena.Visible || !enabled) return;
            var info = new StudioText(Mathf.Max(Mathf.RoundToInt(ui.Dp(15)), Screen.height / 49), StudioAlign.Left, new Color(.88f, .96f, 1f));
            float x = ui.Dp(18), line = ui.Dp(31), top = ui.Dp(16);
            ui.Label(new Rect(x, top, Screen.width - x * 2, ui.Dp(35)), "DREAMWALKER | BAEKSEOL / COMBAT TEST", info);
            ui.Label(new Rect(x, top + line, Screen.width - x * 2, ui.Dp(35)), "A/D or Arrows: Move   SPACE: Jump   Shift: Dash   J/Z: Slash", info);
            if (trainingDummy != null)
                ui.Label(new Rect(x, top + line * 2, Screen.width - x * 2, ui.Dp(35)), "Training dummy HP: " + trainingDummy.Health, info);

            if (!Application.isMobilePlatform || motor == null || attack == null) return;
            float size = Mathf.Min(Screen.width * .13f, Screen.height * .16f);
            float bottom = Screen.height - size - ui.Dp(22), gap = ui.Dp(12), edge = ui.Dp(22);
            var label = new StudioText(Mathf.Max(Mathf.RoundToInt(ui.Dp(21)), Screen.height / 32), StudioAlign.Center, Color.white);
            var skin = StudioSkin.Standard(ui.Density);
            bool left = ui.Held("demo/left", new Rect(edge, bottom, size, size), "◀", label, skin);
            bool right = ui.Held("demo/right", new Rect(edge + size + ui.Dp(8), bottom, size, size), "▶", label, skin);
            motor.SetVirtualHorizontal((right ? 1f : 0f) - (left ? 1f : 0f));
            if (ui.Button("demo/attack", new Rect(Screen.width - size - edge, bottom, size, size), "ATK", label, true, skin))
                attack.RequestAttack();
            if (ui.Button("demo/jump", new Rect(Screen.width - size * 2f - edge - gap, bottom, size, size), "JUMP", label, true, skin))
                motor.RequestJump();
            if (ui.Button("demo/dash", new Rect(Screen.width - size * 3f - edge - gap * 2, bottom, size, size), "DASH", label, true, skin))
                motor.RequestDash();
        }
    }
}

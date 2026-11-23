using Dreamwalker.Combat;
using Dreamwalker.Player;
using UnityEngine;

namespace Dreamwalker.Demo
{
    /// <summary>
    /// Development-only immediate-mode UI. Mobile controls use the same
    /// Request* entry points as keyboard input, without a second combat logic.
    /// </summary>
    public sealed class DemoHud : MonoBehaviour
    {
        public BaekseolMotor motor;
        public BaekseolSlash attack;
        public CombatTarget trainingDummy;

        private GUIStyle instructions;
        private GUIStyle touchButton;

        private void OnGUI()
        {
            if (StudioOnlineArena.Visible) return;
            if (instructions == null)
            {
                instructions = new GUIStyle(GUI.skin.label)
                {
                    fontSize = Mathf.Max(15, Screen.height / 49),
                    normal = { textColor = new Color(.88f, .96f, 1f) }
                };
                touchButton = new GUIStyle(GUI.skin.button)
                {
                    fontSize = Mathf.Max(21, Screen.height / 32),
                    alignment = TextAnchor.MiddleCenter
                };
            }

            GUI.Label(new Rect(18f, 16f, Screen.width - 36f, 35f),
                "DREAMWALKER | BAEKSEOL / COMBAT TEST", instructions);
            GUI.Label(new Rect(18f, 46f, Screen.width - 36f, 35f),
                "A/D or Arrows: Move   SPACE: Jump   Shift: Dash   J/Z: Slash", instructions);
            if (trainingDummy != null)
                GUI.Label(new Rect(18f, 77f, Screen.width - 36f, 35f),
                    "Training dummy HP: " + trainingDummy.Health, instructions);

            if (!Application.isMobilePlatform || motor == null || attack == null) return;
            float size = Mathf.Min(Screen.width * .13f, Screen.height * .16f);
            float bottom = Screen.height - size - 22f;
            bool left = GUI.RepeatButton(new Rect(22f, bottom, size, size), "◀", touchButton);
            bool right = GUI.RepeatButton(new Rect(30f + size, bottom, size, size), "▶", touchButton);
            motor.SetVirtualHorizontal((right ? 1f : 0f) - (left ? 1f : 0f));
            if (GUI.Button(new Rect(Screen.width - size - 22f, bottom, size, size), "ATK", touchButton))
                attack.RequestAttack();
            if (GUI.Button(new Rect(Screen.width - size * 2f - 34f, bottom, size, size), "JUMP", touchButton))
                motor.RequestJump();
            if (GUI.Button(new Rect(Screen.width - size * 3f - 46f, bottom, size, size), "DASH", touchButton))
                motor.RequestDash();
        }
    }
}

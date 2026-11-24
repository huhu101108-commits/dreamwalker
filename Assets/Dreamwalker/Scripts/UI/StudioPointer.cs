using UnityEngine;

namespace Dreamwalker.UI
{
    // Pointer and key state for painters, in painter coordinates (top-left origin), with either input backend.
    public static class StudioPointer
    {
        private static Vector2 Gui(Vector2 screen) => new Vector2(screen.x, Screen.height - screen.y);

        // Every press that started this frame (touches, or the mouse when no finger is down).
        public static int Began(Vector2[] into)
        {
            int n = 0;
#if ENABLE_LEGACY_INPUT_MANAGER
            for (int i = 0; i < UnityEngine.Input.touchCount && n < into.Length; i++)
            {
                var t = UnityEngine.Input.GetTouch(i);
                if (t.phase == TouchPhase.Began) into[n++] = Gui(t.position);
            }
            if (UnityEngine.Input.touchCount == 0 && n < into.Length && UnityEngine.Input.GetMouseButtonDown(0)) into[n++] = Gui(UnityEngine.Input.mousePosition);
#elif ENABLE_INPUT_SYSTEM
            var screen = UnityEngine.InputSystem.Touchscreen.current;
            if (screen != null)
                foreach (var t in screen.touches)
                    if (t.press.wasPressedThisFrame && n < into.Length) into[n++] = Gui(t.position.ReadValue());
            var mouse = UnityEngine.InputSystem.Mouse.current;
            if (n == 0 && mouse != null && mouse.leftButton.wasPressedThisFrame && n < into.Length) into[n++] = Gui(mouse.position.ReadValue());
#endif
            return n;
        }

        public static bool HeldIn(Rect r)
        {
#if ENABLE_LEGACY_INPUT_MANAGER
            for (int i = 0; i < UnityEngine.Input.touchCount; i++)
            {
                var t = UnityEngine.Input.GetTouch(i);
                if (t.phase != TouchPhase.Ended && t.phase != TouchPhase.Canceled && r.Contains(Gui(t.position))) return true;
            }
            return UnityEngine.Input.touchCount == 0 && UnityEngine.Input.GetMouseButton(0) && r.Contains(Gui(UnityEngine.Input.mousePosition));
#elif ENABLE_INPUT_SYSTEM
            var screen = UnityEngine.InputSystem.Touchscreen.current;
            if (screen != null)
                foreach (var t in screen.touches)
                    if (t.press.isPressed && r.Contains(Gui(t.position.ReadValue()))) return true;
            var mouse = UnityEngine.InputSystem.Mouse.current;
            return mouse != null && mouse.leftButton.isPressed && r.Contains(Gui(mouse.position.ReadValue()));
#else
            return false;
#endif
        }

        public static bool Key(KeyCode key)
        {
#if ENABLE_LEGACY_INPUT_MANAGER
            return UnityEngine.Input.GetKeyDown(key);
#elif ENABLE_INPUT_SYSTEM
            var k = UnityEngine.InputSystem.Keyboard.current;
            if (k == null) return false;
            switch (key)
            {
                case KeyCode.Return: return k.enterKey.wasPressedThisFrame;
                case KeyCode.KeypadEnter: return k.numpadEnterKey.wasPressedThisFrame;
                case KeyCode.Escape: return k.escapeKey.wasPressedThisFrame;
                default: return false;
            }
#else
            return false;
#endif
        }
    }
}

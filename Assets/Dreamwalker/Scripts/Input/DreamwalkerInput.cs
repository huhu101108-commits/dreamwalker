using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace Dreamwalker.Input
{
    /// <summary>
    /// Works with both legacy input and the new Input System. Touch UI calls
    /// the public Request* methods on the motor / sword controller directly.
    /// </summary>
    public static class DreamwalkerInput
    {
        public static float Horizontal
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                Keyboard k = Keyboard.current;
                if (k == null) return 0f;
                bool left = k.aKey.isPressed || k.leftArrowKey.isPressed;
                bool right = k.dKey.isPressed || k.rightArrowKey.isPressed;
#else
                bool left = UnityEngine.Input.GetKey(KeyCode.A) || UnityEngine.Input.GetKey(KeyCode.LeftArrow);
                bool right = UnityEngine.Input.GetKey(KeyCode.D) || UnityEngine.Input.GetKey(KeyCode.RightArrow);
#endif
                return (right ? 1f : 0f) - (left ? 1f : 0f);
            }
        }

        public static bool JumpPressed()
        {
#if ENABLE_INPUT_SYSTEM
            Keyboard k = Keyboard.current;
            return k != null && k.spaceKey.wasPressedThisFrame;
#else
            return UnityEngine.Input.GetKeyDown(KeyCode.Space);
#endif
        }

        public static bool DashPressed()
        {
#if ENABLE_INPUT_SYSTEM
            Keyboard k = Keyboard.current;
            return k != null && (k.leftShiftKey.wasPressedThisFrame || k.rightShiftKey.wasPressedThisFrame);
#else
            return UnityEngine.Input.GetKeyDown(KeyCode.LeftShift) || UnityEngine.Input.GetKeyDown(KeyCode.RightShift);
#endif
        }

        public static bool AttackPressed()
        {
#if ENABLE_INPUT_SYSTEM
            Keyboard k = Keyboard.current;
            return k != null && (k.jKey.wasPressedThisFrame || k.zKey.wasPressedThisFrame);
#else
            return UnityEngine.Input.GetKeyDown(KeyCode.J) || UnityEngine.Input.GetKeyDown(KeyCode.Z);
#endif
        }
    }
}

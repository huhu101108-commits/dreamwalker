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
        public static System.Func<string,bool> MaskKey;
        private static bool Free(string code) => MaskKey == null || !MaskKey(code);
        public static float Horizontal
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                Keyboard k = Keyboard.current;
                if (k == null) return 0f;
                bool left = (k.aKey.isPressed && Free("KeyA")) || (k.leftArrowKey.isPressed && Free("ArrowLeft"));
                bool right = (k.dKey.isPressed && Free("KeyD")) || (k.rightArrowKey.isPressed && Free("ArrowRight"));
#else
                bool left = (UnityEngine.Input.GetKey(KeyCode.A) && Free("KeyA")) || (UnityEngine.Input.GetKey(KeyCode.LeftArrow) && Free("ArrowLeft"));
                bool right = (UnityEngine.Input.GetKey(KeyCode.D) && Free("KeyD")) || (UnityEngine.Input.GetKey(KeyCode.RightArrow) && Free("ArrowRight"));
#endif
                return (right ? 1f : 0f) - (left ? 1f : 0f);
            }
        }

        public static bool JumpPressed()
        {
#if ENABLE_INPUT_SYSTEM
            Keyboard k = Keyboard.current;
            return k != null && k.spaceKey.wasPressedThisFrame && Free("Space");
#else
            return UnityEngine.Input.GetKeyDown(KeyCode.Space) && Free("Space");
#endif
        }

        public static bool DashPressed()
        {
#if ENABLE_INPUT_SYSTEM
            Keyboard k = Keyboard.current;
            return k != null && Free("Shift") && (k.leftShiftKey.wasPressedThisFrame || k.rightShiftKey.wasPressedThisFrame);
#else
            return Free("Shift") && (UnityEngine.Input.GetKeyDown(KeyCode.LeftShift) || UnityEngine.Input.GetKeyDown(KeyCode.RightShift));
#endif
        }

        public static bool AttackPressed()
        {
#if ENABLE_INPUT_SYSTEM
            Keyboard k = Keyboard.current;
            return k != null && ((k.jKey.wasPressedThisFrame && Free("KeyJ")) || (k.zKey.wasPressedThisFrame && Free("KeyZ")));
#else
            return (UnityEngine.Input.GetKeyDown(KeyCode.J) && Free("KeyJ")) || (UnityEngine.Input.GetKeyDown(KeyCode.Z) && Free("KeyZ"));
#endif
        }
    }
}

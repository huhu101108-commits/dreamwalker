#if UNITY_EDITOR
using Dreamwalker.UI;
using UnityEditor;
using UnityEngine;

namespace Dreamwalker.EditorTools
{
    // Game screens use uGUI. This Editor-only switch draws the next Play session with the previous IMGUI screens,
    // so both can be compared on the same content. Player builds always use uGUI.
    internal static class StudioUiMenu
    {
        private const string Item = "Tools/Dreamwalker/이전 IMGUI 화면으로 비교";

        [MenuItem(Item)]
        private static void Toggle()
        {
            bool next = !EditorPrefs.GetBool(StudioPainter.ImmediatePreference, false);
            EditorPrefs.SetBool(StudioPainter.ImmediatePreference, next);
            Menu.SetChecked(Item, next);
            Debug.Log(next ? "Dreamwalker: 다음 Play부터 이전 IMGUI 화면으로 그려요." : "Dreamwalker: 다음 Play부터 uGUI 화면으로 그려요.");
        }

        [MenuItem(Item, true)]
        private static bool CanToggle()
        {
            Menu.SetChecked(Item, EditorPrefs.GetBool(StudioPainter.ImmediatePreference, false));
            return !EditorApplication.isPlayingOrWillChangePlaymode;
        }
    }
}
#endif

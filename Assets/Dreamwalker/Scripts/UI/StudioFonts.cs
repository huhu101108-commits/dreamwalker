using UnityEngine;

namespace Dreamwalker.UI
{
    // Korean-capable OS fonts, created once per family and shared by every painter.
    public static class StudioFonts
    {
        private static Font sans, serif, mono, builtin;
        private static bool triedSans, triedSerif, triedMono;

        private static Font Builtin => builtin != null ? builtin : builtin = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        private static Font Make(string[] names)
        {
            try { return Font.CreateDynamicFontFromOSFont(names, 18); }
            catch (System.Exception) { return null; }
        }
        public static Font For(StudioFamily family)
        {
            switch (family)
            {
                case StudioFamily.Serif:
                    if (!triedSerif) { triedSerif = true; serif = Make(new[] { "Noto Serif CJK KR", "Noto Serif KR", "Batang", "serif" }); }
                    return serif != null ? serif : For(StudioFamily.Sans);
                case StudioFamily.Mono:
                    if (!triedMono) { triedMono = true; mono = Make(new[] { "D2Coding", "Noto Sans Mono CJK KR", "Consolas", "monospace" }); }
                    return mono != null ? mono : For(StudioFamily.Sans);
                default:
                    if (!triedSans) { triedSans = true; sans = Make(new[] { "Noto Sans CJK KR", "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", "sans-serif" }); }
                    return sans != null ? sans : Builtin;
            }
        }
    }
}

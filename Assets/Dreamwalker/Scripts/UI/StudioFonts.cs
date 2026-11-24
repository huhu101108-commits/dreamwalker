using UnityEngine;

namespace Dreamwalker.UI
{
    // Korean-capable OS fonts, created once per family and shared by every painter. Later names cover glyphs the first
    // font lacks (Japanese, Chinese, Thai and Latin text of translated games).
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
                    if (!triedSans) { triedSans = true; sans = Make(new[] { "Noto Sans CJK KR", "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", "sans-serif", "NotoSansCJK-Regular", "Noto Sans CJK JP", "Noto Sans CJK SC", "Noto Sans CJK TC", "NotoSansThai-Regular", "Noto Sans Thai", "Roboto-Regular", "DroidSansFallback", "Arial Unicode MS" }); }
                    return sans != null ? sans : Builtin;
            }
        }
    }
}

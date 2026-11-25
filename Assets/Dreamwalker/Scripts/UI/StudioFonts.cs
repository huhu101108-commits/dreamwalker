using UnityEngine;

namespace Dreamwalker.UI
{
    // Korean-capable OS fonts, created once per family and shared by every painter. Later names cover glyphs the first
    // font lacks (Japanese, Chinese, Thai and Latin text of translated games). A web player has no OS fonts: it draws
    // every family with the bundled font (Pretendard, SIL Open Font License: Hangul, kana and Latin letters; Chinese
    // characters are not in it).
    public static class StudioFonts
    {
        private static Font sans, serif, mono, builtin, bundled;
        private static bool triedSans, triedSerif, triedMono, triedBundled;

        private static Font Bundled
        {
            get
            {
                if (!triedBundled) { triedBundled = true; bundled = Resources.Load<Font>("DreamwalkerFonts/Pretendard-Regular"); }
                return bundled;
            }
        }

        private static Font Builtin => builtin != null ? builtin : builtin = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        private static Font Make(string[] names)
        {
            try { return Font.CreateDynamicFontFromOSFont(names, 18); }
            catch (System.Exception) { return null; }
        }
        public static Font For(StudioFamily family)
        {
            if (Application.platform == RuntimePlatform.WebGLPlayer) return Bundled != null ? Bundled : Builtin;
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
                    return sans != null ? sans : Bundled != null ? Bundled : Builtin;
            }
        }
    }
}

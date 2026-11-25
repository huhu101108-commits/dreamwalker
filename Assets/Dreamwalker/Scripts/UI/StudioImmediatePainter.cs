using System.Collections.Generic;
using UnityEngine;

namespace Dreamwalker.UI
{
    // The previous IMGUI drawing, kept behind the same calls so the Editor can compare it with the uGUI screens.
    public sealed class StudioImmediatePainter : StudioPainter
    {
        private readonly StudioImmediateUi host;
        private readonly Dictionary<int, GUIStyle> styles = new Dictionary<int, GUIStyle>();
        private readonly GUIContent content = new GUIContent();

        public StudioImmediatePainter(StudioImmediateUi host)
        {
            this.host = host;
            Density = StudioUiGeometry.Density(Screen.dpi);
        }
        public override void Dispose() => StudioCanvasPainter.Gone(host);

        private GUIStyle Style(StudioText s)
        {
            int key = s.size * 16 + (int)s.align * 4 + (int)s.family;
            if (!styles.TryGetValue(key, out var style))
            {
                style = new GUIStyle(GUI.skin.label)
                {
                    wordWrap = true, fontSize = s.size, padding = new RectOffset(5, 5, 2, 2), font = StudioFonts.For(s.family),
                    alignment = s.align == StudioAlign.Left ? TextAnchor.MiddleLeft : s.align == StudioAlign.Right ? TextAnchor.MiddleRight : TextAnchor.MiddleCenter,
                };
                styles[key] = style;
            }
            style.normal.textColor = s.color;
            return style;
        }
        private GUIContent Content(string text) { content.text = text; return content; }
        private static bool Repaint => Event.current.type == EventType.Repaint;

        public override void Box(Rect r, Color color, float radius = 0, float border = 0, float angle = 0)
        {
            if (!Repaint || color.a <= 0) return;
            var matrix = GUI.matrix;
            if (angle != 0) GUIUtility.RotateAroundPivot(angle, r.center);
            GUI.DrawTexture(r, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, color, border, radius);
            GUI.matrix = matrix;
        }
        public override void Picture(Rect r, Texture texture, StudioFit fit, Color tint, float radius = 0, bool flip = false)
        {
            if (!Repaint || texture == null) return;
            var matrix = GUI.matrix;
            if (flip) GUIUtility.ScaleAroundPivot(new Vector2(-1, 1), r.center);
            var mode = fit == StudioFit.Cover ? ScaleMode.ScaleAndCrop : fit == StudioFit.Stretch ? ScaleMode.StretchToFill : ScaleMode.ScaleToFit;
            GUI.DrawTexture(r, texture, mode, true, 0, tint, 0, radius);
            GUI.matrix = matrix;
        }
        public override void Label(Rect r, string text, StudioText style) => GUI.Label(r, Content(text), Style(style));
        public override float Height(string text, StudioText style, float width) => Style(style).CalcHeight(Content(text), width);
        public override float Width(string text, StudioText style) => Style(style).CalcSize(Content(text)).x;

        private void Skin(Rect r, StudioSkin skin)
        {
            if (!skin.visible || skin.standard || !Repaint) return;
            GUI.DrawTexture(r, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, HeldIn(r) ? skin.press : skin.fill, 0, skin.radius);
            if (skin.width > 0) GUI.DrawTexture(r, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, skin.edge, skin.width, skin.radius);
        }
        public override bool Button(string key, Rect r, string label, StudioText style, bool enabled, StudioSkin skin)
        {
            bool was = GUI.enabled;
            GUI.enabled = was && enabled;
            Skin(r, skin);
            bool clicked = skin.standard ? GUI.Button(r, label) : GUI.Button(r, Content(label), Style(style));
            GUI.enabled = was;
            return clicked;
        }
        public override bool Held(string key, Rect r, string label, StudioText style, StudioSkin skin)
        {
            Skin(r, skin);
            return skin.standard ? GUI.RepeatButton(r, label) : GUI.RepeatButton(r, Content(label), Style(style));
        }
        public override Vector2 BeginScroll(string key, Rect view, Rect content, Vector2 position) => GUI.BeginScrollView(view, position, content);
        public override void EndScroll() => GUI.EndScrollView();
        public override string Field(string key, Rect r, string text, int limit, StudioText style, bool enabled, bool password = false)
        {
            bool was = GUI.enabled;
            GUI.enabled = was && enabled;
            GUI.SetNextControlName(key);
            string next = password ? GUI.PasswordField(r, text ?? "", '*', limit, Style(style)) : GUI.TextField(r, text ?? "", limit, Style(style));
            GUI.enabled = was;
            return next;
        }
        public override bool Focused(string key) => GUI.GetNameOfFocusedControl() == key;
        public override void Focus(string key) => GUI.FocusControl(key);
        public override void Blur() => GUI.FocusControl(null);
        public override float Slider(string key, Rect track, float value, float min, float max, out bool dragging)
        {
            float next = GUI.HorizontalSlider(track, value, min, max, GUIStyle.none, GUIStyle.none);
            dragging = GUIUtility.hotControl != 0;
            return next;
        }
        public override bool PressedOutside(Rect r) => Event.current.type == EventType.MouseDown && !r.Contains(Event.current.mousePosition);
        public override bool HeldIn(Rect r) => GUIUtility.hotControl != 0 && r.Contains(Event.current.mousePosition);
        public override bool KeyPressed(KeyCode key) => Event.current.type == EventType.KeyDown && Event.current.keyCode == key;
        public override void Consume() => Event.current.Use();
    }
}

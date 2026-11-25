using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Dreamwalker.UI
{
    // uGUI painter: one Screen Space Overlay canvas in device pixels. Each drawing call reuses the object it used on
    // the previous frame and only writes values that changed, so a still screen does not rebuild the canvas.
    public sealed class StudioCanvasPainter : StudioPainter
    {
        private const float PadX = 5, PadY = 2;
        private static readonly Rect Whole = new Rect(0, 0, 1, 1);
        private static GameObject events;
        private static int eventUsers;

        private readonly GameObject host;
        private readonly RectTransform root;
        private readonly TextGenerator measure = new TextGenerator();
        private readonly Dictionary<(string, int, StudioFamily, int), float> heights = new Dictionary<(string, int, StudioFamily, int), float>();
        private readonly Vector2[] began = new Vector2[10];
        private int frame, consumedFrame = -1;
        private bool disposed;

        private sealed class Layer
        {
            public RectTransform parent;
            public readonly List<StudioShapeGraphic> shapes = new List<StudioShapeGraphic>();
            public readonly List<Text> texts = new List<Text>();
            public int shapeCount, textCount, order, frame = -1;
        }
        private enum Kind { Button, Scroll, Field, Slider }
        private sealed class Control
        {
            public Kind kind;
            public RectTransform rect;
            public int frame;
            public StudioShapeGraphic back, edge, bar;
            public Text text;
            public StudioPress press;
            public ScrollRect scroll;
            public RectTransform content;
            public Vector2 returned;
            public InputField input;
            public StudioDrag drag;
        }
        private readonly Dictionary<RectTransform, Layer> layers = new Dictionary<RectTransform, Layer>();
        private readonly Stack<Layer> stack = new Stack<Layer>();
        private readonly Dictionary<string, Control> controls = new Dictionary<string, Control>();

        public StudioCanvasPainter(string name, int order)
        {
            host = new GameObject(name, typeof(RectTransform));
            var canvas = host.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = order;
            canvas.pixelPerfect = false;
            // One canvas unit is one screen pixel, the coordinate space the screens are laid out in.
            var scaler = host.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ConstantPixelSize;
            scaler.scaleFactor = 1;
            host.AddComponent<GraphicRaycaster>();
            root = (RectTransform)host.transform;
            Density = StudioUiGeometry.Density(Screen.dpi);
            UseEvents();
        }

        private static void UseEvents()
        {
            eventUsers++;
            if (events != null || EventSystem.current != null || Object.FindFirstObjectByType<EventSystem>() != null) return;
            events = new GameObject("Dreamwalker EventSystem", typeof(EventSystem));
#if ENABLE_LEGACY_INPUT_MANAGER || !ENABLE_INPUT_SYSTEM
            events.AddComponent<StandaloneInputModule>();
#else
            events.AddComponent<UnityEngine.InputSystem.UI.InputSystemUIInputModule>();
#endif
        }

        // Edit-mode tests create painters too, where only DestroyImmediate is allowed.
        internal static void Gone(Object o)
        {
            if (o == null) return;
            if (Application.isPlaying) Object.Destroy(o);
            else Object.DestroyImmediate(o);
        }
        public override void Dispose()
        {
            if (disposed) return;
            disposed = true;
            Gone(host);
            if (--eventUsers <= 0)
            {
                eventUsers = 0;
                Gone(events);
                events = null;
            }
        }

        protected override bool Retained => !disposed;
        protected override void Begin()
        {
            frame++;
            Density = StudioUiGeometry.Density(Screen.dpi);
            stack.Clear();
            stack.Push(LayerOf(root));
            if (heights.Count > 512) heights.Clear();
        }
        protected override void End()
        {
            foreach (var layer in layers.Values)
            {
                bool used = layer.frame == frame;
                for (int i = used ? layer.shapeCount : 0; i < layer.shapes.Count; i++) Show(layer.shapes[i].gameObject, false);
                for (int i = used ? layer.textCount : 0; i < layer.texts.Count; i++) Show(layer.texts[i].gameObject, false);
            }
            foreach (var c in controls.Values) if (c.frame != frame) Show(c.rect.gameObject, false);
            stack.Clear();
        }

        // ---- object pool and placement ----
        private Layer LayerOf(RectTransform parent)
        {
            if (!layers.TryGetValue(parent, out var layer)) layers[parent] = layer = new Layer { parent = parent };
            if (layer.frame != frame) { layer.frame = frame; layer.shapeCount = layer.textCount = layer.order = 0; }
            return layer;
        }
        private static void Show(GameObject go, bool on) { if (go.activeSelf != on) go.SetActive(on); }
        private static RectTransform NewRect(string name, Transform parent)
        {
            var go = new GameObject(name, typeof(RectTransform));
            var t = (RectTransform)go.transform;
            t.SetParent(parent, false);
            t.anchorMin = t.anchorMax = new Vector2(0, 1);
            t.pivot = new Vector2(.5f, .5f);
            return t;
        }
        private static void Stretch(RectTransform t, float x, float y)
        {
            if (t.anchorMin != Vector2.zero) t.anchorMin = Vector2.zero;
            if (t.anchorMax != Vector2.one) t.anchorMax = Vector2.one;
            var min = new Vector2(x, y);
            if (t.offsetMin != min) t.offsetMin = min;
            if (t.offsetMax != -min) t.offsetMax = -min;
        }
        // A rectangle given from the parent's top-left corner, y down.
        private static void Place(RectTransform t, Rect r, float angle = 0)
        {
            var size = new Vector2(Mathf.Max(0, r.width), Mathf.Max(0, r.height));
            var at = new Vector2(r.x + r.width / 2, -(r.y + r.height / 2));
            if (t.sizeDelta != size) t.sizeDelta = size;
            if (t.anchoredPosition != at) t.anchoredPosition = at;
            var turn = angle == 0 ? Quaternion.identity : Quaternion.Euler(0, 0, -angle);
            if (t.localRotation != turn) t.localRotation = turn;
        }
        // Draw order is sibling order: each object takes the next index under the current parent.
        private void Order(Transform t)
        {
            var layer = stack.Peek();
            if (t.parent != layer.parent) t.SetParent(layer.parent, false);
            int index = layer.order++;
            if (t.GetSiblingIndex() != index) t.SetSiblingIndex(index);
            Show(t.gameObject, true);
        }
        private static StudioShapeGraphic NewShape(Transform parent, string name, bool raycast)
        {
            var g = NewRect(name, parent).gameObject.AddComponent<StudioShapeGraphic>();
            g.raycastTarget = raycast;
            return g;
        }
        private Text NewText(Transform parent)
        {
            var text = NewRect("text", parent).gameObject.AddComponent<Text>();
            text.raycastTarget = false;
            text.supportRichText = false;
            text.alignByGeometry = false;
            text.horizontalOverflow = HorizontalWrapMode.Wrap;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            text.font = StudioFonts.For(StudioFamily.Sans);
            return text;
        }
        private StudioShapeGraphic NextShape()
        {
            var layer = stack.Peek();
            if (layer.shapeCount == layer.shapes.Count) layer.shapes.Add(NewShape(layer.parent, "shape", false));
            var g = layer.shapes[layer.shapeCount++];
            Order(g.transform);
            return g;
        }
        private Text NextText()
        {
            var layer = stack.Peek();
            if (layer.textCount == layer.texts.Count) layer.texts.Add(NewText(layer.parent));
            var t = layer.texts[layer.textCount++];
            Order(t.transform);
            return t;
        }
        private static void Paint(Graphic g, Color c) { if (g.color != c) g.color = c; }
        private static TextAnchor Anchor(StudioAlign a) =>
            a == StudioAlign.Left ? TextAnchor.MiddleLeft : a == StudioAlign.Right ? TextAnchor.MiddleRight : TextAnchor.MiddleCenter;
        private static void Look(Text t, StudioText s)
        {
            var font = StudioFonts.For(s.family);
            if (t.font != font) t.font = font;
            if (t.fontSize != s.size) t.fontSize = Mathf.Max(1, s.size);
            var anchor = Anchor(s.align);
            if (t.alignment != anchor) t.alignment = anchor;
            Paint(t, s.color);
        }
        private static void Words(Text t, string value) { value = value ?? ""; if (t.text != value) t.text = value; }

        // ---- drawing ----
        public override void Box(Rect r, Color color, float radius = 0, float border = 0, float angle = 0)
        {
            if (color.a <= 0 || r.width <= 0 || r.height <= 0) return;
            var g = NextShape();
            Place(g.rectTransform, r, angle);
            g.Set(null, radius, border, Whole, false);
            Paint(g, color);
        }
        public override void Picture(Rect r, Texture texture, StudioFit fit, Color tint, float radius = 0, bool flip = false)
        {
            if (texture == null || tint.a <= 0 || r.width <= 0 || r.height <= 0) return;
            float aspect = texture.height > 0 ? (float)texture.width / texture.height : 1;
            var area = r;
            var uv = Whole;
            if (fit == StudioFit.Fit)
            {
                StudioUiGeometry.Fit(r.x, r.y, r.width, r.height, aspect, out float x, out float y, out float w, out float h);
                area = new Rect(x, y, w, h);
            }
            else if (fit == StudioFit.Cover)
            {
                StudioUiGeometry.Crop(r.width, r.height, aspect, out float u, out float v, out float uw, out float vh);
                uv = new Rect(u, v, uw, vh);
            }
            var g = NextShape();
            Place(g.rectTransform, area);
            g.Set(texture, radius, 0, uv, flip);
            Paint(g, tint);
        }
        public override void Label(Rect r, string text, StudioText style)
        {
            if (string.IsNullOrEmpty(text) || style.color.a <= 0) return;
            var t = NextText();
            Place(t.rectTransform, new Rect(r.x + Dp(PadX), r.y + Dp(PadY), r.width - Dp(PadX) * 2, r.height - Dp(PadY) * 2));
            Look(t, style);
            Words(t, text);
        }
        private TextGenerationSettings Settings(StudioText s, float width, bool wrap) => new TextGenerationSettings
        {
            font = StudioFonts.For(s.family), fontSize = Mathf.Max(1, s.size), fontStyle = FontStyle.Normal, lineSpacing = 1,
            richText = false, scaleFactor = 1, textAnchor = TextAnchor.UpperLeft, alignByGeometry = false,
            resizeTextForBestFit = false, updateBounds = false, generateOutOfBounds = true, color = Color.white,
            horizontalOverflow = wrap ? HorizontalWrapMode.Wrap : HorizontalWrapMode.Overflow,
            verticalOverflow = VerticalWrapMode.Overflow, generationExtents = new Vector2(Mathf.Max(1, width), 0), pivot = Vector2.zero,
        };
        public override float Height(string text, StudioText style, float width)
        {
            text = text ?? "";
            var key = (text, style.size, style.family, Mathf.RoundToInt(width));
            if (!heights.TryGetValue(key, out float h))
                heights[key] = h = measure.GetPreferredHeight(text, Settings(style, width - Dp(PadX) * 2, true)) + Dp(PadY) * 2;
            return h;
        }
        public override float Width(string text, StudioText style) =>
            measure.GetPreferredWidth(text ?? "", Settings(style, 0, false)) + Dp(PadX) * 2;

        // ---- controls ----
        private Control ControlOf(string key, Kind kind)
        {
            if (!controls.TryGetValue(key, out var c) || c.kind != kind)
            {
                if (c != null) Gone(c.rect.gameObject);
                controls[key] = c = Make(kind, stack.Peek().parent);
            }
            c.frame = frame;
            return c;
        }
        private Control Make(Kind kind, Transform parent)
        {
            var c = new Control { kind = kind, rect = NewRect(kind.ToString(), parent) };
            var go = c.rect.gameObject;
            go.SetActive(false);
            c.back = go.AddComponent<StudioShapeGraphic>();
            c.back.raycastTarget = true;
            c.back.color = Color.clear;
            switch (kind)
            {
                case Kind.Button:
                    c.edge = NewShape(c.rect, "edge", false);
                    c.text = NewText(c.rect);
                    c.press = go.AddComponent<StudioPress>();
                    break;
                case Kind.Scroll:
                    go.AddComponent<RectMask2D>();
                    c.content = NewRect("content", c.rect);
                    c.content.pivot = new Vector2(0, 1);
                    c.bar = NewShape(c.rect, "bar", false);
                    c.scroll = go.AddComponent<ScrollRect>();
                    c.scroll.content = c.content;
                    c.scroll.viewport = c.rect;
                    c.scroll.horizontal = false;
                    c.scroll.vertical = true;
                    c.scroll.movementType = ScrollRect.MovementType.Clamped;
                    c.scroll.inertia = true;
                    c.scroll.scrollSensitivity = 40 * Density;
                    break;
                case Kind.Field:
                    c.text = NewText(c.rect);
                    c.text.horizontalOverflow = HorizontalWrapMode.Overflow;
                    c.input = go.AddComponent<InputField>();
                    c.input.transition = Selectable.Transition.None;
                    c.input.targetGraphic = c.back;
                    c.input.textComponent = c.text;
                    c.input.lineType = InputField.LineType.SingleLine;
                    c.input.customCaretColor = true;
                    c.input.navigation = new Navigation { mode = Navigation.Mode.None };
                    break;
                case Kind.Slider:
                    c.drag = go.AddComponent<StudioDrag>();
                    break;
            }
            go.SetActive(true);
            return c;
        }

        private bool Press(string key, Rect r, string label, StudioText style, bool enabled, StudioSkin skin, out Control c)
        {
            c = ControlOf(key, Kind.Button);
            Place(c.rect, r);
            Order(c.rect);
            float fade = enabled ? 1 : .5f;
            var fill = skin.visible ? (c.press.Held && enabled ? skin.press : skin.fill) : Color.clear;
            fill.a *= fade;
            Paint(c.back, fill);
            c.back.Set(null, skin.radius, 0, Whole, false);
            bool edge = skin.visible && skin.width > 0;
            Show(c.edge.gameObject, edge);
            if (edge)
            {
                var e = skin.edge; e.a *= fade;
                Stretch(c.edge.rectTransform, 0, 0);
                c.edge.Set(null, skin.radius, skin.width, Whole, false);
                Paint(c.edge, e);
            }
            Stretch(c.text.rectTransform, Dp(PadX), Dp(PadY));
            var ink = style.color; ink.a *= fade;
            Look(c.text, style.With(ink));
            Words(c.text, label);
            return enabled;
        }
        public override bool Button(string key, Rect r, string label, StudioText style, bool enabled, StudioSkin skin)
        {
            bool live = Press(key, r, label, style, enabled, skin, out var c);
            bool clicked = c.press.Clicked;
            c.press.Clicked = false;
            return clicked && live && c.press.PressedFrame > consumedFrame;
        }
        public override bool Held(string key, Rect r, string label, StudioText style, StudioSkin skin)
        {
            Press(key, r, label, style, true, skin, out var c);
            c.press.Clicked = false;
            return c.press.Held;
        }

        public override Vector2 BeginScroll(string key, Rect view, Rect content, Vector2 position)
        {
            var c = ControlOf(key, Kind.Scroll);
            Place(c.rect, view);
            Order(c.rect);
            var size = new Vector2(Mathf.Max(0, content.width), Mathf.Max(0, content.height));
            if (c.content.sizeDelta != size) c.content.sizeDelta = size;
            if (c.content.anchoredPosition.x != 0) c.content.anchoredPosition = new Vector2(0, c.content.anchoredPosition.y);
            float range = Mathf.Max(0, size.y - view.height);
            // Callers reset their position when the list changes, as with IMGUI scroll views.
            if (position != c.returned)
            {
                c.scroll.StopMovement();
                c.content.anchoredPosition = new Vector2(0, Mathf.Clamp(position.y, 0, range));
            }
            float y = Mathf.Clamp(c.content.anchoredPosition.y, 0, range);
            bool more = range > .5f;
            Show(c.bar.gameObject, more);
            if (more)
            {
                float w = Dp(4), h = Mathf.Max(Dp(24), view.height * view.height / size.y);
                Place(c.bar.rectTransform, new Rect(view.width - w - Dp(3), (view.height - h) * (y / range), w, h));
                c.bar.Set(null, w / 2, 0, Whole, false);
                Paint(c.bar, new Color(1, 1, 1, .42f));
            }
            c.scroll.scrollSensitivity = 40 * Density;
            c.returned = new Vector2(0, y);
            stack.Push(LayerOf(c.content));
            return c.returned;
        }
        public override void EndScroll()
        {
            if (stack.Count > 1) stack.Pop();
        }

        public override string Field(string key, Rect r, string text, int limit, StudioText style, bool enabled, bool password = false)
        {
            var c = ControlOf(key, Kind.Field);
            Place(c.rect, r);
            Order(c.rect);
            var input = c.input;
            if (input.interactable != enabled) input.interactable = enabled;
            if (input.characterLimit != limit) input.characterLimit = Mathf.Max(0, limit);
            var type = password ? InputField.ContentType.Password : InputField.ContentType.Standard;
            if (input.contentType != type) input.contentType = type;
            Stretch(c.text.rectTransform, Dp(PadX), Dp(PadY));
            Look(c.text, style);
            if (input.caretColor != style.color) input.caretColor = style.color;
            var selection = style.color; selection.a = .3f;
            if (input.selectionColor != selection) input.selectionColor = selection;
            text = text ?? "";
            if (!input.isFocused && input.text != text) input.text = text;
            return input.isFocused ? input.text : text;
        }
        public override bool Focused(string key) => controls.TryGetValue(key, out var c) && c.input != null && c.input.isFocused;
        public override void Focus(string key)
        {
            if (!controls.TryGetValue(key, out var c) || c.input == null) return;
            EventSystem.current?.SetSelectedGameObject(c.input.gameObject);
            c.input.ActivateInputField();
        }
        public override void Blur()
        {
            foreach (var c in controls.Values)
                if (c.input != null && c.input.isFocused)
                {
                    c.input.DeactivateInputField();
                    if (EventSystem.current != null && EventSystem.current.currentSelectedGameObject == c.input.gameObject)
                        EventSystem.current.SetSelectedGameObject(null);
                }
        }

        public override float Slider(string key, Rect track, float value, float min, float max, out bool dragging)
        {
            var c = ControlOf(key, Kind.Slider);
            Place(c.rect, track);
            Order(c.rect);
            dragging = c.drag.Dragging;
            return dragging ? Mathf.Lerp(min, max, c.drag.Normalized) : value;
        }

        // ---- pointer and keys ----
        public override bool PressedOutside(Rect r)
        {
            int n = StudioPointer.Began(began);
            for (int i = 0; i < n; i++) if (!r.Contains(began[i])) return true;
            return false;
        }
        public override bool HeldIn(Rect r) => StudioPointer.HeldIn(r);
        public override bool KeyPressed(KeyCode key) => StudioPointer.Key(key);
        public override void Consume() => consumedFrame = Time.frameCount;
    }
}

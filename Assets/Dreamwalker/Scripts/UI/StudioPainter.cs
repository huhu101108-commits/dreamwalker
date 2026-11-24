using UnityEngine;

namespace Dreamwalker.UI
{
    public enum StudioAlign : byte { Left, Center, Right }
    public enum StudioFamily : byte { Sans, Serif, Mono }
    public enum StudioFit : byte { Stretch, Fit, Cover }

    // Text appearance shared by both painters. Sizes are device pixels.
    public struct StudioText
    {
        public int size;
        public StudioAlign align;
        public StudioFamily family;
        public Color color;
        public StudioText(int size, StudioAlign align, Color color, StudioFamily family = StudioFamily.Sans)
        {
            this.size = size; this.align = align; this.color = color; this.family = family;
        }
        public StudioText With(Color tint) { var copy = this; copy.color = tint; return copy; }
        public static StudioAlign Align(string authored) => authored == "left" ? StudioAlign.Left : authored == "right" ? StudioAlign.Right : StudioAlign.Center;
        public static StudioFamily Family(string authored) => authored == "serif" ? StudioFamily.Serif : authored == "mono" ? StudioFamily.Mono : StudioFamily.Sans;
    }

    // A button background. Without one, a button is clickable text over whatever was drawn below it.
    public struct StudioSkin
    {
        public bool visible, standard;
        public Color fill, press, edge;
        public float width, radius;
        public static StudioSkin None => default;
        // The neutral button used where the creator did not style one (IMGUI's default skin in the fallback painter).
        public static StudioSkin Standard(float density) => new StudioSkin
        {
            visible = true, standard = true, width = density, radius = 6 * density,
            fill = new Color(.2f, .25f, .31f, .96f), press = new Color(.33f, .4f, .48f, .98f), edge = new Color(.55f, .62f, .7f, .9f),
        };
        public static StudioSkin Of(Color fill, Color press, Color edge, float width, float radius) =>
            new StudioSkin { visible = true, fill = fill, press = press, edge = edge, width = width, radius = radius };
    }

    // Immediate-mode drawing calls for the game screens. Rectangles are screen pixels from the top-left, as in IMGUI.
    // StudioCanvasPainter keeps one uGUI object per call site and updates it only when a value changes;
    // StudioImmediatePainter issues the original IMGUI calls and exists to compare the two in the Editor.
    public abstract class StudioPainter
    {
        public float Density { get; protected set; } = 1;
        // Shapes and pictures. Angles are clockwise degrees around the rectangle's centre.
        public abstract void Box(Rect r, Color color, float radius = 0, float border = 0, float angle = 0);
        public abstract void Picture(Rect r, Texture texture, StudioFit fit, Color tint, float radius = 0, bool flip = false);
        // Text and measurement (style padding included).
        public abstract void Label(Rect r, string text, StudioText style);
        public abstract float Height(string text, StudioText style, float width);
        public abstract float Width(string text, StudioText style);
        // Controls keep state across frames under their key.
        public abstract bool Button(string key, Rect r, string label, StudioText style, bool enabled, StudioSkin skin);
        public abstract bool Held(string key, Rect r, string label, StudioText style, StudioSkin skin);
        public abstract Vector2 BeginScroll(string key, Rect view, Rect content, Vector2 position);
        public abstract void EndScroll();
        public abstract string Field(string key, Rect r, string text, int limit, StudioText style, bool enabled, bool password = false);
        public abstract bool Focused(string key);
        public abstract void Focus(string key);
        public abstract void Blur();
        public abstract float Slider(string key, Rect track, float value, float min, float max, out bool dragging);
        // Pointer and key state for this frame, in the same coordinates.
        public abstract bool PressedOutside(Rect r);
        public abstract bool HeldIn(Rect r);
        public abstract bool KeyPressed(KeyCode key);
        // Stops the current press from reaching controls drawn after this call (a closing popup, for example).
        public abstract void Consume();

        public float Dp(float cssPixels) => cssPixels * Density;
        public int TextSize(float authored, float max = 90) => StudioUiGeometry.TextPixels(authored, Screen.width, Density, max);

        // The uGUI painter draws once per frame through Frame; the IMGUI painter is driven by OnGUI.
        protected virtual bool Retained => false;
        protected virtual void Begin() { }
        protected virtual void End() { }
        public void Frame(System.Action paint)
        {
            if (!Retained) return;
            Begin();
            try { paint(); }
            finally { End(); }
        }
        public abstract void Dispose();

        // order: higher draws above lower, for both painters.
        public static StudioPainter Create(MonoBehaviour owner, string name, int order, System.Action paint)
        {
            if (!PreferImmediate) return new StudioCanvasPainter(name, order);
            var host = owner.gameObject.AddComponent<StudioImmediateUi>();
            host.depth = -order;
            host.paint = paint;
            return new StudioImmediatePainter(host);
        }

        // The Editor can switch back to the IMGUI screens to compare them with uGUI; players always get uGUI.
        public const string ImmediatePreference = "Dreamwalker.ImmediateUi";
        public static bool PreferImmediate
        {
            get
            {
#if UNITY_EDITOR
                return UnityEditor.EditorPrefs.GetBool(ImmediatePreference, false);
#else
                return false;
#endif
            }
        }
    }
}

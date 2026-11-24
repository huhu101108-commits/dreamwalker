using UnityEngine;
using UnityEngine.UI;

namespace Dreamwalker.UI
{
    // A rounded rectangle, ring or picture drawn as one uGUI mesh. Radius and border are in canvas pixels.
    [RequireComponent(typeof(CanvasRenderer))]
    public sealed class StudioShapeGraphic : MaskableGraphic
    {
        private Texture picture;
        private float radius, border;
        private Rect uv = new Rect(0, 0, 1, 1);
        private bool flip;
        private static readonly float[] OuterX = new float[52], OuterY = new float[52], InnerX = new float[52], InnerY = new float[52];

        public override Texture mainTexture => picture != null ? picture : s_WhiteTexture;

        public void Set(Texture texture, float cornerRadius, float borderWidth, Rect textureRect, bool mirrored)
        {
            if (picture != texture) { picture = texture; SetMaterialDirty(); SetVerticesDirty(); }
            if (radius != cornerRadius || border != borderWidth || uv != textureRect || flip != mirrored)
            {
                radius = cornerRadius; border = borderWidth; uv = textureRect; flip = mirrored;
                SetVerticesDirty();
            }
        }

        private UIVertex Vertex(float px, float py, Rect area, Color32 tint)
        {
            float fx = area.width > 0 ? (px - area.x) / area.width : 0, fy = area.height > 0 ? (py - area.y) / area.height : 0;
            var v = UIVertex.simpleVert;
            v.position = new Vector3(px, py);
            v.color = tint;
            v.uv0 = new Vector4(uv.x + (flip ? 1 - fx : fx) * uv.width, uv.y + fy * uv.height, 0, 0);
            return v;
        }

        protected override void OnPopulateMesh(VertexHelper vh)
        {
            vh.Clear();
            var area = GetPixelAdjustedRect();
            if (area.width <= 0 || area.height <= 0) return;
            Color32 tint = color;
            float r = StudioUiGeometry.ClampRadius(radius, area.width, area.height);
            int steps = StudioUiGeometry.CornerSteps(r);
            int count = StudioUiGeometry.RoundedOutline(area.x, area.y, area.width, area.height, r, steps, OuterX, OuterY);
            bool ring = border > 0 && border * 2 < Mathf.Min(area.width, area.height);
            if (!ring)
            {
                // A fan from the centre covers the convex outline.
                vh.AddVert(Vertex(area.center.x, area.center.y, area, tint));
                for (int i = 0; i < count; i++) vh.AddVert(Vertex(OuterX[i], OuterY[i], area, tint));
                for (int i = 0; i < count; i++) vh.AddTriangle(0, 1 + i, 1 + (i + 1) % count);
                return;
            }
            // The inner edge keeps the same number of points so each outer point pairs with one inner point.
            StudioUiGeometry.RoundedOutline(area.x + border, area.y + border, area.width - border * 2, area.height - border * 2,
                Mathf.Max(0, r - border), steps, InnerX, InnerY);
            for (int i = 0; i < count; i++)
            {
                vh.AddVert(Vertex(OuterX[i], OuterY[i], area, tint));
                vh.AddVert(Vertex(InnerX[i], InnerY[i], area, tint));
            }
            for (int i = 0; i < count; i++)
            {
                int a = i * 2, b = (i + 1) % count * 2;
                vh.AddTriangle(a, b, b + 1);
                vh.AddTriangle(a, b + 1, a + 1);
            }
        }
    }
}

using System;

namespace Dreamwalker.UI
{
    // Screen maths shared by the uGUI and IMGUI painters. It has no engine types so the .NET contract check runs it.
    public static class StudioUiGeometry
    {
        // Device pixels per CSS pixel. Browsers on dense tablets lay the studio preview out in CSS pixels;
        // Unity works in device pixels, so text and fixed sizes are multiplied by this to look the same.
        // Device pixels per CSS pixel. A web player's page gives its own ratio (StudioWebBridge); elsewhere the
        // screen's density decides, as Android's density-independent pixels do.
        public static float HostDensity;
        public static float Density(float dpi) => HostDensity > 0 ? HostDensity : dpi > 160 ? dpi / 160f : 1f;

        // The web game's clamp(8px, n/8 cqw, 1.4n px): n × min(width/800, 1.4) CSS pixels, at least 8, here capped
        // like the previous Unity screens, then converted to device pixels.
        // Doubles and half-up rounding, as JavaScript's Math.round, so both sides agree on every table entry.
        public static int TextPixels(double authored, double screenWidth, double density, double max = 90)
        {
            density = Math.Max(1, density);
            double css = screenWidth / density;
            double size = Math.Min(max, Math.Max(8, authored * Math.Min(css / 800, 1.4)));
            return (int)Math.Floor(size * density + .5);
        }

        // ScaleToFit: the largest box with the picture's aspect, centred in the target.
        public static void Fit(float x, float y, float w, float h, float aspect, out float fx, out float fy, out float fw, out float fh)
        {
            fx = x; fy = y; fw = w; fh = h;
            if (!(aspect > 0) || w <= 0 || h <= 0) return;
            if (aspect > w / h) { fh = w / aspect; fy = y + (h - fh) / 2; }
            else { fw = h * aspect; fx = x + (w - fw) / 2; }
        }

        // ScaleAndCrop: the centred part of the picture, in 0..1 texture coordinates, that fills the target.
        public static void Crop(float w, float h, float aspect, out float u, out float v, out float uw, out float vh)
        {
            u = 0; v = 0; uw = 1; vh = 1;
            if (!(aspect > 0) || w <= 0 || h <= 0) return;
            float box = w / h;
            if (aspect > box) { uw = box / aspect; u = (1 - uw) / 2; }
            else { vh = aspect / box; v = (1 - vh) / 2; }
        }

        // Points per rounded corner: none for square corners, more for larger radii.
        public static int CornerSteps(float radius) => radius <= .5f ? 0 : Math.Min(12, Math.Max(2, (int)Math.Ceiling(radius / 3f)));

        public static float ClampRadius(float radius, float w, float h) => Math.Max(0, Math.Min(radius, Math.Min(w, h) / 2));

        // Outline of a rounded rectangle, counter-clockwise from the bottom-left corner, y up.
        // Each corner contributes steps + 1 points (one point when steps is 0). Returns the number of points written.
        public static int RoundedOutline(float x, float y, float w, float h, float radius, int steps, float[] xs, float[] ys)
        {
            float r = ClampRadius(radius, w, h);
            int n = 0;
            for (int corner = 0; corner < 4; corner++)
            {
                float cx = corner == 0 || corner == 3 ? x + r : x + w - r;
                float cy = corner < 2 ? y + r : y + h - r;
                double start = Math.PI * (1 + corner * .5);
                if (steps == 0 || r <= 0)
                {
                    xs[n] = corner == 0 || corner == 3 ? x : x + w;
                    ys[n] = corner < 2 ? y : y + h;
                    n++;
                    if (steps > 0) for (int i = 0; i < steps; i++, n++) { xs[n] = xs[n - 1]; ys[n] = ys[n - 1]; }
                    continue;
                }
                for (int i = 0; i <= steps; i++, n++)
                {
                    double a = start + Math.PI / 2 * i / steps;
                    xs[n] = cx + r * (float)Math.Cos(a);
                    ys[n] = cy + r * (float)Math.Sin(a);
                }
            }
            return n;
        }
    }
}

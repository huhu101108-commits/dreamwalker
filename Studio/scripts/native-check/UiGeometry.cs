using System;
using System.IO;
using System.Text.Json;
using Dreamwalker.UI;
// Unity uGUI geometry: text sizes from the studio preview table (scripts/test-ui-geometry.mjs), fitted and cropped
// pictures, and rounded outlines.
public static class UiGeometry
{
#pragma warning disable CS0649 // Filled from the shared JSON table.
    private sealed class TextCase { public double authored, screenWidth, density; public int pixels; }
    private sealed class Table { public TextCase[] texts; }
#pragma warning restore CS0649
    public static void Run()
    {
        var table = JsonSerializer.Deserialize<Table>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "ui-geometry.json")),
            new JsonSerializerOptions { IncludeFields = true });
        foreach (var t in table.texts)
        {
            int got = StudioUiGeometry.TextPixels(t.authored, t.screenWidth, t.density);
            if (got != t.pixels) throw new Exception("text " + t.authored + " at " + t.screenWidth + " px, density " + t.density + ": " + got + " != " + t.pixels);
        }
        StudioUiGeometry.Fit(0, 0, 100, 100, 2, out float fx, out float fy, out float fw, out float fh);
        if (fx != 0 || fy != 25 || fw != 100 || fh != 50) throw new Exception("fit wide picture");
        StudioUiGeometry.Fit(0, 0, 100, 100, .5f, out fx, out fy, out fw, out fh);
        if (fx != 25 || fy != 0 || fw != 50 || fh != 100) throw new Exception("fit tall picture");
        StudioUiGeometry.Crop(100, 100, 2, out float u, out float v, out float uw, out float vh);
        if (u != .25f || v != 0 || uw != .5f || vh != 1) throw new Exception("cover wide picture");
        if (StudioUiGeometry.CornerSteps(0) != 0 || StudioUiGeometry.CornerSteps(3) != 2 || StudioUiGeometry.CornerSteps(1000) != 12)
            throw new Exception("corner steps");
        var xs = new float[52]; var ys = new float[52];
        int steps = StudioUiGeometry.CornerSteps(12);
        int n = StudioUiGeometry.RoundedOutline(10, 20, 100, 60, 12, steps, xs, ys);
        if (n != 4 * (steps + 1)) throw new Exception("outline points");
        for (int i = 0; i < n; i++)
        {
            if (xs[i] < 10 - 1e-3 || xs[i] > 110 + 1e-3 || ys[i] < 20 - 1e-3 || ys[i] > 80 + 1e-3) throw new Exception("outline leaves the box");
            // Every point lies on the rounded rectangle's edge: on a straight side or 12 px from a corner centre.
            float cx = Math.Clamp(xs[i], 22, 98), cy = Math.Clamp(ys[i], 32, 68);
            double d = Math.Sqrt((xs[i] - cx) * (xs[i] - cx) + (ys[i] - cy) * (ys[i] - cy));
            if (Math.Abs(d - 12) > 1e-3) throw new Exception("outline point off the edge");
        }
        if (StudioUiGeometry.RoundedOutline(0, 0, 10, 4, 50, 3, xs, ys) != 16 || Math.Abs(xs[0]) > 1e-4 || Math.Abs(ys[0] - 2) > 1e-4)
            throw new Exception("radius is limited to half the short side");
        Console.WriteLine("PASS native uGUI geometry: " + table.texts.Length + " text sizes match the studio preview formula, fit/cover pictures and rounded outlines");
    }
}

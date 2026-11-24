using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using Dreamwalker.Demo;
// Unity's StudioLocalization lists, applies and picks languages like model.js; the table is from scripts/unity-locale.mjs.
public static class Locale
{
    private static string[][] Pairs(JsonElement e) =>
        e.EnumerateArray().Select(r => new[] { r[0].GetString(), r[1].GetString() }).ToArray();
    private static void Same(string what, string[][] expected, System.Collections.Generic.List<System.Collections.Generic.KeyValuePair<string, string>> actual)
    {
        if (expected.Length != actual.Count) throw new Exception(what + ": " + actual.Count + " keys, expected " + expected.Length);
        for (int i = 0; i < expected.Length; i++)
            if (expected[i][0] != actual[i].Key || expected[i][1] != actual[i].Value)
                throw new Exception(what + " #" + i + ": " + actual[i].Key + " = " + actual[i].Value + ", expected " + expected[i][0] + " = " + expected[i][1]);
    }
    public static void Run()
    {
        using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "locale.json")));
        var root = doc.RootElement;
        var project = JsonSerializer.Deserialize<StudioProject>(root.GetProperty("project").GetRawText(), new JsonSerializerOptions { IncludeFields = true });
        var keys = Pairs(root.GetProperty("keys"));
        Same("keys", keys, StudioLocalization.Keys(project));
        int applied = 0;
        foreach (string code in new[] { "en", "ja", "ko" })
        {
            var expect = root.GetProperty("applied").GetProperty(code);
            if (StudioLocalization.Apply(project, code) != code) throw new Exception("apply " + code);
            Same("applied " + code, Pairs(expect.GetProperty("values")), StudioLocalization.Keys(project));
            foreach (var row in Pairs(expect.GetProperty("system")))
                if (StudioLocalization.Text(row[0]) != row[1]) throw new Exception(code + " system text " + row[0] + ": " + StudioLocalization.Text(row[0]) + ", expected " + row[1]);
            applied++;
        }
        if (StudioLocalization.Apply(project, "xx") != "ko") throw new Exception("an unknown language falls back to the base language");
        if (StudioSystemText.Names.Count() != root.GetProperty("applied").GetProperty("ko").GetProperty("system").GetArrayLength()) throw new Exception("built-in text count");
        int picks = 0;
        foreach (var row in root.GetProperty("picks").EnumerateArray())
        {
            var codes = row[0].EnumerateArray().Select(v => v.GetString()).ToList();
            var wanted = row[1].EnumerateArray().Select(v => v.GetString()).ToArray();
            string got = StudioLocalization.Pick(codes, wanted);
            if (got != row[2].GetString()) throw new Exception("pick " + string.Join("+", wanted) + ": " + got + ", expected " + row[2].GetString());
            picks++;
        }
        Console.WriteLine("PASS native localization: " + keys.Length + " keys in the studio's order, " + applied + " languages applied with built-in texts, " + picks + " device-language picks match the studio");
    }
}

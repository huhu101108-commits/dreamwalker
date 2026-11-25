using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using Dreamwalker.Demo;
// Unity's game menu rules (StudioMenuRules, StudioDeviceSettings, typing speed and standby screens in StudioScreenFlow)
// against the studio's; the table is from scripts/unity-menus.mjs.
public static class Menus
{
    private static readonly JsonSerializerOptions Fields = new JsonSerializerOptions { IncludeFields = true };
    private static string Show(StudioDeviceSettings s) =>
        s.music + "/" + s.fx + "/" + s.voice + "/" + s.mute + "/" + s.textSpeed + "/" + s.autoAdvance;
    public static void Run()
    {
        using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "menus.json")));
        var root = doc.RootElement;
        foreach (var row in root.GetProperty("links").EnumerateArray())
            if (StudioMenuRules.LinkTarget(row[0].GetString()) != row[1].GetBoolean())
                throw new Exception("link " + JsonSerializer.Serialize(row[0].GetString()) + " should be " + (row[1].GetBoolean() ? "allowed" : "refused"));
        foreach (var row in root.GetProperty("stored").EnumerateArray())
        {
            // The defaults of a fresh object stand for the fields a stored text leaves out, as with JsonUtility.
            var read = (JsonSerializer.Deserialize<StudioDeviceSettings>(row[0].GetRawText(), Fields) ?? new StudioDeviceSettings()).Bounded();
            var expected = JsonSerializer.Deserialize<StudioDeviceSettings>(row[1].GetRawText(), Fields);
            if (Show(read) != Show(expected)) throw new Exception("settings " + row[0].GetRawText() + ": " + Show(read) + ", expected " + Show(expected));
        }
        foreach (var row in root.GetProperty("texts").EnumerateArray())
        {
            var spec = JsonSerializer.Deserialize<StudioControlSpec>(row[0].GetRawText(), Fields);
            var settings = JsonSerializer.Deserialize<StudioDeviceSettings>(row[1].GetRawText(), Fields);
            if (settings.Text(spec) != row[2].GetString()) throw new Exception("setting text " + spec.setting + ": " + settings.Text(spec));
        }
        foreach (var row in root.GetProperty("waits").EnumerateArray())
        {
            double wait = StudioMenuRules.AutoWait(row[0].GetString(), row[1].GetInt32(), row[2].GetInt32());
            if (Math.Abs(wait - row[3].GetDouble()) > 1e-6) throw new Exception("auto wait " + row[1] + "/" + row[2] + ": " + wait + ", expected " + row[3]);
        }
        foreach (var row in root.GetProperty("visible").EnumerateArray())
        {
            var track = new StudioStageTrack { rate = row[2].GetInt32() };
            string shown = track.Visible(row[0].GetString(), row[1].GetInt32(), row[3].GetInt32());
            if (shown != row[4].GetString()) throw new Exception("typed " + row[1] + " ticks at " + row[2] + "/" + row[3] + ": " + shown + ", expected " + row[4]);
        }
        var idle = root.GetProperty("idle");
        var project = JsonSerializer.Deserialize<StudioProject>(idle.GetProperty("project").GetRawText(), Fields);
        var flow = new StudioScreenFlow();
        int calls = 0;
        foreach (var row in idle.GetProperty("calls").EnumerateArray())
        {
            flow.CloseAll();
            bool opened = flow.Fire(project, idle.GetProperty("map").GetString(), idle.GetProperty("actor").GetString(), "idle", row[0].GetString(), 100,
                                    row[1].GetSingle(), row[2].GetSingle());
            string top = opened ? flow.Top : "";
            if (top != row[3].GetString()) throw new Exception("standby on " + row[0] + " " + row[1] + "→" + row[2] + ": " + top + ", expected " + row[3]);
            calls++;
        }
        Console.WriteLine("PASS native menu rules match the studio: links, stored settings, settings controls, auto lines, typing speed and " + calls + " standby checks");
    }
}

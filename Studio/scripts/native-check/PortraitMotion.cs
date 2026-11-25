using System;
using System.IO;
using System.Text.Json;
using Dreamwalker.Demo;
// Portrait motion in Unity uses the studio's numbers: the table comes from scripts/test-portrait-motion.mjs.
public static class PortraitMotion
{
    public static void Run()
    {
        using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "portrait-motion.json")));
        int poses = 0, faces = 0;
        foreach (var row in doc.RootElement.GetProperty("poses").EnumerateArray())
        {
            string id = row[0].GetString();
            uint seed = row[1].GetUInt32();
            if (StudioPortraitMotion.Seed(id) != seed) throw new Exception("seed of " + id);
            string pose = StudioPortraitMotion.Pose(row[2].GetInt32(), row[3].GetBoolean(), row[4].GetBoolean(), row[5].GetDouble(), row[6].GetBoolean(), seed, out double scale);
            if (pose != row[7].GetString() || Math.Abs(scale - row[8].GetDouble()) > 1e-9)
                throw new Exception("pose " + row.GetRawText() + ": " + pose + " " + scale);
            poses++;
        }
        var options = new JsonSerializerOptions { IncludeFields = true };
        foreach (var item in doc.RootElement.GetProperty("faces").EnumerateArray())
        {
            var actor = JsonSerializer.Deserialize<StudioCharacter>(item.GetProperty("actor").GetRawText(), options);
            string image = actor.FaceSet(item.GetProperty("expression").GetString(), out string blink, out string talk);
            var face = item.GetProperty("face");
            if (image != face.GetProperty("image").GetString() || blink != face.GetProperty("blink").GetString() || talk != face.GetProperty("talk").GetString())
                throw new Exception("face set " + item.GetRawText());
            faces++;
        }
        Console.WriteLine("PASS native portrait motion: " + poses + " poses (blink, talk, breathing) and " + faces + " face sets match the studio");
    }
}

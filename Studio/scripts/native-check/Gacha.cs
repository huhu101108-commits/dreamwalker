using System;
using System.IO;
using System.Text.Json;
using Dreamwalker.Demo;
// Unity's StudioGacha draws and discloses like model.js; the table is from scripts/unity-gacha.mjs.
public static class Gacha
{
    public static void Run()
    {
        using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "gacha.json")));
        var root = doc.RootElement;
        var project = JsonSerializer.Deserialize<StudioProject>(root.GetProperty("project").GetRawText(), new JsonSerializerOptions { IncludeFields = true });
        int pulls = 0, rows = 0;
        foreach (var b in root.GetProperty("banners").EnumerateArray())
        {
            var banner = Array.Find(project.shop.banners, x => x.id == b.GetProperty("id").GetString());
            var odds = StudioGacha.Odds(project, banner);
            var expect = b.GetProperty("odds").GetProperty("tiers");
            if (odds.Count != expect.GetArrayLength()) throw new Exception("tier count of " + banner.id);
            for (int i = 0; i < odds.Count; i++)
            {
                var t = expect[i];
                if (odds[i].name != t.GetProperty("name").GetString() || odds[i].percent != t.GetProperty("percent").GetString() || odds[i].top != t.GetProperty("top").GetBoolean())
                    throw new Exception("tier " + banner.id + "/" + i + ": " + odds[i].name + " " + odds[i].percent);
                var entries = t.GetProperty("entries");
                for (int k = 0; k < entries.GetArrayLength(); k++, rows++)
                    if (odds[i].entries[k].name != entries[k].GetProperty("name").GetString() || odds[i].entries[k].percent != entries[k].GetProperty("percent").GetString())
                        throw new Exception("entry " + banner.id + "/" + i + "/" + k + ": " + odds[i].entries[k].name + " " + odds[i].entries[k].percent);
            }
            var eff = b.GetProperty("effective");
            bool has = StudioGacha.Effective(banner, out string average, out string percent);
            if (has != (eff.ValueKind != JsonValueKind.Null) || (has && (average != eff[0].GetString() || percent != eff[1].GetString())))
                throw new Exception("average with pity of " + banner.id + ": " + average + " " + percent);
            foreach (var r in b.GetProperty("pulls").EnumerateArray())
            {
                int since = r[0].GetInt32(), tierRoll = r[1].GetInt32(), entryRoll = r[2].GetInt32();
                int tier = StudioGacha.Tier(banner, since, tierRoll), entry = StudioGacha.Entry(banner.tiers[tier], entryRoll);
                int after = banner.tiers[tier].top ? 0 : since + 1;
                if (tier != r[3].GetInt32() || entry != r[4].GetInt32() || after != r[5].GetInt32()) throw new Exception("pull " + r.GetRawText() + ": " + tier + " " + entry + " " + after);
                pulls++;
            }
        }
        foreach (var r in root.GetProperty("percents").EnumerateArray())
            if (StudioGacha.Percent(r[0].GetInt64(), r[1].GetInt64()) != r[2].GetString()) throw new Exception("percent " + r.GetRawText());
        Console.WriteLine("PASS native gacha: " + pulls + " pulls with set rolls (tier edges and pity), " + rows + " disclosed rewards and averages with pity match the studio");
    }
}

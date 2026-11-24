using System;
using System.Collections.Generic;
using System.Globalization;

namespace Dreamwalker.Demo
{
// project.shop as the studio saves it: currencies, products and gacha banners. Rates are in 0.001% units (100000 = 100%).
[Serializable] public class StudioShop { public StudioCurrency[] currencies; public StudioProduct[] products; public StudioBanner[] banners; }
[Serializable] public class StudioCurrency { public string id, name, icon; public int start, max; }
[Serializable] public class StudioProductCost { public string kind, id, sku; public int amount; }
[Serializable] public class StudioReward { public string kind, id; public int count, weight; }
[Serializable] public class StudioProduct { public string id, name; public StudioProductCost cost; public StudioReward[] gives; public int limit; }
[Serializable] public class StudioBannerCost { public string currency; public int amount; }
[Serializable] public class StudioTier { public string id, name; public int rate; public bool top; public StudioReward[] entries; }
[Serializable] public class StudioBanner { public string id, name, image; public StudioBannerCost cost; public int multi, pity; public StudioTier[] tiers; }

public sealed class StudioOddsEntry { public string kind, id, name, percent; public int count; }
public sealed class StudioOddsTier { public string name, percent; public bool top; public List<StudioOddsEntry> entries = new List<StudioOddsEntry>(); }

// The draw rule and the disclosure of model.js (gachaTier, gachaEntry, oddsPercent, gachaOdds, gachaEffective), checked
// against the studio by scripts/native-check/gacha.json.
public static class StudioGacha
{
    public const int Rate = 100000;
    public static int Weight(StudioTier t)
    {
        int n = 0;
        foreach (var e in t.entries ?? Array.Empty<StudioReward>()) n += e.weight;
        return n;
    }
    // With pity N, the N-th pull since the last top result is a top result; otherwise the roll walks the tier rates.
    public static int Tier(StudioBanner b, int sinceTop, int tierRoll)
    {
        int top = Array.FindIndex(b.tiers, t => t.top);
        if (b.pity > 0 && top >= 0 && sinceTop + 1 >= b.pity) return top;
        long edge = 0;
        for (int i = 0; i < b.tiers.Length; i++)
        {
            edge += b.tiers[i].rate;
            if (tierRoll < edge) return i;
        }
        return b.tiers.Length - 1;
    }
    public static int Entry(StudioTier t, int entryRoll)
    {
        long edge = 0;
        for (int i = 0; i < t.entries.Length; i++)
        {
            edge += t.entries[i].weight;
            if (entryRoll < edge) return i;
        }
        return t.entries.Length - 1;
    }
    // Percent with three decimals from numerator/denominator in 0.001% units, rounded half up.
    public static string Percent(long numerator, long denominator)
    {
        long thousandths = (numerator * 2 + denominator) / (2 * denominator);
        return (thousandths / 1000).ToString(CultureInfo.InvariantCulture) + "." + (thousandths % 1000).ToString("000", CultureInfo.InvariantCulture);
    }
    public static string RewardName(StudioProject p, StudioReward g)
    {
        if (g.kind == "item") return Array.Find(p.items ?? Array.Empty<StudioItem>(), v => v.id == g.id)?.name ?? g.id;
        return Array.Find(p.shop?.currencies ?? Array.Empty<StudioCurrency>(), v => v.id == g.id)?.name ?? g.id;
    }
    public static List<StudioOddsTier> Odds(StudioProject p, StudioBanner b)
    {
        var tiers = new List<StudioOddsTier>();
        foreach (var t in b.tiers)
        {
            int total = Weight(t);
            var row = new StudioOddsTier { name = t.name, top = t.top, percent = Percent(t.rate, 1) };
            foreach (var e in t.entries ?? Array.Empty<StudioReward>())
                row.entries.Add(new StudioOddsEntry { kind = e.kind, id = e.id, count = e.count, name = RewardName(p, e),
                    percent = total > 0 ? Percent((long)t.rate * e.weight, total) : "0.000" });
            tiers.Add(row);
        }
        return tiers;
    }
    // Average pulls per top result with hard pity N: (1-(1-p)^N)/p; null without a top tier that can come out.
    public static bool Effective(StudioBanner b, out string pulls, out string percent)
    {
        pulls = percent = "";
        var top = Array.Find(b.tiers, t => t.top);
        if (top == null || top.rate == 0) return false;
        double p = top.rate / (double)Rate, n = b.pity > 0 ? (1 - Math.Pow(1 - p, b.pity)) / p : 1 / p;
        pulls = (Math.Floor(n * 10 + .5) / 10).ToString(CultureInfo.InvariantCulture);
        long t = (long)Math.Floor(100000 / n + .5);
        percent = (t / 1000).ToString(CultureInfo.InvariantCulture) + "." + (t % 1000).ToString("000", CultureInfo.InvariantCulture);
        return true;
    }
}
}

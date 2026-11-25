using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using Dreamwalker.UI;
using UnityEngine;

namespace Dreamwalker.Demo
{
[Serializable] public class StudioCount { public string key; public int count; }
[Serializable] public class StudioShopSave { public StudioCount[] wallet, pity, bought; public StudioDrawRecord[] draws; }
public sealed class StudioShopPanel { public string kind, banner, title; public List<StudioDrawRecord> rewards = new List<StudioDrawRecord>(); }

// Paid products go through the platform store. A release build sets Handler to its store adapter (for example Unity IAP
// with receipt checks on a server); without one, the editor and development builds complete a test purchase and
// release builds refuse.
public static class StudioPurchases
{
    public delegate void Purchase(string sku, int priceWon, Action<bool> done);
    public static Purchase Handler;
    // A store adapter that reports each purchase's store and token (StudioUnityPurchasing with Unity IAP): Prepare starts
    // it with the project's paid products, ReceiptHandler buys, Confirm finishes a purchase once the game has kept what
    // it gave, and Pending receives purchases the store delivers again (one interrupted before it was confirmed).
    public static Action<StudioProject> Prepare;
    public delegate void ReceiptPurchase(string sku, int priceWon, Action<StudioReceipt> done);
    public static ReceiptPurchase ReceiptHandler;
    public static Action<StudioReceipt> Confirm;
    public static Action<StudioReceipt> Pending;
}
// store: "google", "apple" or "test" (the editor's fake store); token: the purchase token or transaction ID.
public sealed class StudioReceipt { public bool ok; public string store, sku, token; }

// The player's store and gacha state, the same rules as FieldRun.buy/draw in the studio: wallet, pulls since the last
// top result, purchase counts and the last 30 pulls, kept in the progress save.
public sealed partial class StudioWorld
{
    private const int DrawHistory = 30;
    private readonly Dictionary<string, int> wallet = new Dictionary<string, int>(), pityCount = new Dictionary<string, int>(), bought = new Dictionary<string, int>();
    private readonly List<StudioDrawRecord> draws = new List<StudioDrawRecord>();
    private Vector2 shopScroll;
    internal StudioShopPanel ShopPanel { get; private set; }

    private void ShopReset()
    {
        wallet.Clear(); pityCount.Clear(); bought.Clear(); draws.Clear(); ShopPanel = null;
        foreach (var c in Project.shop?.currencies ?? Array.Empty<StudioCurrency>()) wallet[c.id] = c.start;
    }
    private StudioCurrency Currency(string id) => Array.Find(Project.shop?.currencies ?? Array.Empty<StudioCurrency>(), c => c.id == id);
    private StudioBanner Banner(string id) => Array.Find(Project.shop?.banners ?? Array.Empty<StudioBanner>(), b => b.id == id);
    private int Owned(string id) => wallet.TryGetValue(id, out int n) ? n : 0;
    private void Grant(StudioReward g)
    {
        if (g.kind == "currency") { var c = Currency(g.id); if (c != null) wallet[g.id] = (int)Math.Min(c.max, (long)Owned(g.id) + g.count); }
        else if (g.kind == "character") { if (Project.Character(g.id) != null) ownedCharacters.Add(g.id); }
        else if (Item(g.id) != null) bag[g.id] = (int)Math.Min(999999, (long)(bag.TryGetValue(g.id, out int n) ? n : 0) + g.count);
    }
    private StudioDrawRecord PullReward(StudioBanner b, StudioTier t, StudioReward e) => StudioGacha.Grant(b, t, e, Owns, Grant);
    private string Buy(string id, bool paid)
    {
        var p = Array.Find(Project.shop?.products ?? Array.Empty<StudioProduct>(), v => v.id == id);
        if (p == null) return "missing";
        if (p.limit > 0 && (bought.TryGetValue(id, out int had) ? had : 0) >= p.limit) return "limit";
        if (p.cost.kind == "money" && !paid) return "store";
        if (Project.shop.server && !paid) return "server";
        if (p.cost.kind == "currency")
        {
            if (Owned(p.cost.id) < p.cost.amount) return "short";
            wallet[p.cost.id] = Owned(p.cost.id) - p.cost.amount;
        }
        var panel = new StudioShopPanel { kind = "result", title = p.name };
        foreach (var g in p.gives) { Grant(g); panel.rewards.Add(new StudioDrawRecord { kind = g.kind, id = g.id, count = g.count, tier = "" }); }
        bought[id] = (bought.TryGetValue(id, out int n) ? n : 0) + 1;
        ShopPanel = panel;
        return "ok";
    }
    // The tier roll is drawn even when pity decides, then the reward roll, as in the studio.
    private string Draw(string id, int count)
    {
        var b = Banner(id);
        if (b == null) return "missing";
        long price = (long)b.cost.amount * count;
        if (Owned(b.cost.currency) < price) return "short";
        if (Project.shop.server) return "server";
        wallet[b.cost.currency] = (int)(Owned(b.cost.currency) - price);
        int since = pityCount.TryGetValue(id, out int s) ? s : 0;
        var panel = new StudioShopPanel { kind = "result", title = b.name };
        for (int i = 0; i < count; i++)
        {
            var t = b.tiers[StudioGacha.Tier(b, since, RandomNumberGenerator.GetInt32(StudioGacha.Rate))];
            var e = t.entries[StudioGacha.Entry(t, RandomNumberGenerator.GetInt32(StudioGacha.Weight(t)))];
            since = t.top ? 0 : since + 1;
            panel.rewards.Add(PullReward(b, t, e));
        }
        pityCount[id] = since;
        for (int i = 0; i < panel.rewards.Count; i++) draws.Insert(0, panel.rewards[i]);
        if (draws.Count > DrawHistory) draws.RemoveRange(DrawHistory, draws.Count - DrawHistory);
        ShopPanel = panel;
        return "ok";
    }
    private bool ShopAction(string action, string target)
    {
        if (action == "odds") { if (Banner(target) != null) { ShopPanel = new StudioShopPanel { kind = "odds", banner = target }; shopScroll = Vector2.zero; } return true; }
        if (action != "buy" && action != "draw" && action != "drawMulti") return false;
        int count = action == "drawMulti" ? Banner(target)?.multi ?? 0 : 1;
        string done = action == "buy" ? Buy(target, false) : Draw(target, count);
        shopScroll = Vector2.zero;
        if (done == "store") BuyWithMoney(target);
        else if (done == "server") ServerShop(action == "buy" ? "buy" : "draw", target, count);
        else if (done != "ok" && done != "missing") Notice(StudioLocalization.Text("shop." + done));
        if (done == "ok") PersistShop();
        return true;
    }
    // A purchase or pull is kept at once, also while a menu is open: the last device save gets the new wallet and bag.
    private void PersistShop()
    {
        if (SaveProgress() || !PlayerPrefs.HasKey(SaveKey)) return;
        StudioPlayerSave saved;
        try { saved = JsonUtility.FromJson<StudioPlayerSave>(PlayerPrefs.GetString(SaveKey)); }
        catch (ArgumentException) { return; }
        if (saved == null) return;
        var inventory = new List<StudioBagEntry>();
        foreach (var pair in bag) inventory.Add(new StudioBagEntry { id = pair.Key, count = pair.Value });
        var equipment = new List<StudioEquipEntry>();
        foreach (var pair in gear) equipment.Add(new StudioEquipEntry { key = pair.Key, id = pair.Value });
        saved.bag = inventory.ToArray();
        saved.gear = equipment.ToArray();
        saved.owned = new List<string>(ownedCharacters).ToArray();
        saved.shop = ShopSave();
        string json = JsonUtility.ToJson(saved);
        PlayerPrefs.SetString(SaveKey, json);
        PlayerPrefs.Save();
        lastCheckpoint = json;
    }
    private void BuyWithMoney(string id)
    {
        var p = Array.Find(Project.shop.products, v => v.id == id);
        // A server-wallet game has the server check the store's receipt and pay; the purchase is confirmed after that.
        if (Project.shop.server)
        {
            if (StudioPurchases.ReceiptHandler != null) StudioPurchases.ReceiptHandler(p.cost.sku, p.cost.amount, ReceiptArrived);
            else if (Application.isEditor || Debug.isDebugBuild) ReceiptArrived(new StudioReceipt { ok = true, store = "test", sku = p.cost.sku, token = Guid.NewGuid().ToString("N") });
            else Notice(StudioLocalization.Text("shop.store"));
            return;
        }
        if (StudioPurchases.ReceiptHandler != null)
        {
            StudioPurchases.ReceiptHandler(p.cost.sku, p.cost.amount, receipt => { if (receipt.ok) KeepPurchase(receipt); });
            return;
        }
        if (StudioPurchases.Handler != null)
        {
            StudioPurchases.Handler(p.cost.sku, p.cost.amount, ok =>
            {
                // The grant is saved before this returns, so the store adapter may confirm the purchase afterwards.
                if (ok && Buy(id, true) == "ok") { PersistShop(); Notice(StudioLocalization.Text("shop.bought")); }
            });
            return;
        }
        if (Application.isEditor || Debug.isDebugBuild)
        {
            if (Buy(id, true) == "ok") { PersistShop(); Notice(StudioLocalization.Text("shop.testPaid")); }
            return;
        }
        Notice(StudioLocalization.Text("shop.store"));
    }
    private StudioShopSave ShopSave()
    {
        var save = new StudioShopSave { draws = draws.ToArray() };
        StudioCount[] Pairs(Dictionary<string, int> d) { var list = new List<StudioCount>(); foreach (var pair in d) list.Add(new StudioCount { key = pair.Key, count = pair.Value }); return list.ToArray(); }
        save.wallet = Pairs(wallet); save.pity = Pairs(pityCount); save.bought = Pairs(bought);
        return save;
    }
    private void ShopRestore(StudioShopSave saved)
    {
        ShopReset();
        var shop = Project.shop;
        if (shop == null || saved == null) return;
        foreach (var c in saved.wallet ?? Array.Empty<StudioCount>()) { var currency = Currency(c?.key); if (currency != null && c.count >= 0) wallet[c.key] = Math.Min(c.count, currency.max); }
        foreach (var c in saved.pity ?? Array.Empty<StudioCount>()) if (c != null && Banner(c.key) != null && c.count >= 0 && c.count <= 1000) pityCount[c.key] = c.count;
        foreach (var c in saved.bought ?? Array.Empty<StudioCount>())
            if (c != null && Array.Exists(shop.products ?? Array.Empty<StudioProduct>(), p => p.id == c.key) && c.count >= 1 && c.count <= 999) bought[c.key] = c.count;
        foreach (var d in saved.draws ?? Array.Empty<StudioDrawRecord>())
            if (d != null && Banner(d.banner) != null && (d.kind == "item" || d.kind == "currency" || d.kind == "character") && d.count >= 1 && draws.Count < DrawHistory) draws.Add(d);
    }
    private string WalletText(string text)
    {
        if (string.IsNullOrEmpty(text) || !text.Contains("{재화:")) return text;
        return System.Text.RegularExpressions.Regex.Replace(text, @"\{재화:([a-zA-Z0-9_-]{1,50})\}",
            m => Owned(m.Groups[1].Value).ToString(System.Globalization.CultureInfo.InvariantCulture));
    }
    private string Counted(StudioDrawRecord g) =>
        (g.kind == "character" && !g.dup ? StudioLocalization.Text("gacha.new") + " " : "") +
        StudioGacha.RewardName(Project, new StudioReward { kind = g.kind, id = g.id }) + (g.count > 1 ? " ×" + g.count : "") +
        (g.dup ? " · " + StudioLocalization.Text("gacha.owned") + (!string.IsNullOrEmpty(g.instead?.kind)
            ? " → " + StudioGacha.RewardName(Project, g.instead) + (g.instead.count > 1 ? " ×" + g.instead.count : "") : "") : "");
    // The built-in panel above every screen: a banner's probability disclosure, or what a purchase or pull gave.
    private void DrawShopPanel()
    {
        var p = ShopPanel;
        if (p == null || Painter == null) return;
        var ui = Painter;
        ui.Box(new Rect(0, 0, Screen.width, Screen.height), new Color(.02f, .06f, .1f, .8f));
        float width = Mathf.Min(Screen.width - ui.Dp(24), ui.Dp(560)), height = Mathf.Min(Screen.height - ui.Dp(24), ui.Dp(620));
        var card = new Rect((Screen.width - width) / 2, (Screen.height - height) / 2, width, height);
        ui.Box(card, new Color(.09f, .15f, .22f), ui.Dp(12));
        var lines = new List<(string text, bool strong, bool right)>();
        if (p.kind == "odds")
        {
            var b = Banner(p.banner);
            if (b == null) { ShopPanel = null; return; }
            var odds = StudioGacha.Odds(Project, b);
            string top = Array.Find(b.tiers, t => t.top)?.name ?? "";
            lines.Add((b.name + " · " + StudioLocalization.Text("gacha.odds"), true, false));
            lines.Add((StudioLocalization.Text("gacha.price").Replace("{가격}", b.cost.amount + " " + (Currency(b.cost.currency)?.name ?? "")), false, false));
            if (b.pity > 0)
            {
                lines.Add((StudioLocalization.Text("gacha.pity").Replace("{횟수}", b.pity.ToString()).Replace("{등급}", top), false, false));
                lines.Add((StudioLocalization.Text("gacha.since").Replace("{등급}", top).Replace("{횟수}", (pityCount.TryGetValue(b.id, out int since) ? since : 0).ToString()), false, false));
                if (StudioGacha.Effective(b, out string pulls, out string percent))
                    lines.Add((StudioLocalization.Text("gacha.effective").Replace("{등급}", top).Replace("{확률}", percent).Replace("{횟수}", pulls), false, false));
            }
            else lines.Add((StudioLocalization.Text("gacha.noPity"), false, false));
            foreach (var t in odds)
            {
                lines.Add((t.name + " · " + t.percent + "%", true, false));
                foreach (var e in t.entries) lines.Add((e.name + (e.count > 1 ? " ×" + e.count : "") + "\t" + e.percent + "%", false, true));
            }
            var mine = draws.FindAll(d => d.banner == b.id);
            if (mine.Count > 0)
            {
                lines.Add((StudioLocalization.Text("gacha.history"), true, false));
                for (int i = 0; i < mine.Count && i < 10; i++) lines.Add((mine[i].tier + " · " + Counted(mine[i]), false, false));
            }
        }
        else
        {
            lines.Add((p.title + " · " + StudioLocalization.Text("shop.got"), true, false));
            foreach (var g in p.rewards) lines.Add(((string.IsNullOrEmpty(g.tier) ? "" : g.tier + " · ") + Counted(g), g.top, false));
        }
        var ink = new StudioText(Mathf.RoundToInt(ui.Dp(15)), StudioAlign.Left, Color.white);
        var bold = new StudioText(Mathf.RoundToInt(ui.Dp(17)), StudioAlign.Left, new Color(.63f, .91f, .83f));
        float pad = ui.Dp(14), row = ui.Dp(30), inner = card.width - pad * 2;
        var view = new Rect(card.x + pad, card.y + pad, inner, card.height - pad * 3 - ui.Dp(44));
        shopScroll = ui.BeginScroll("shop/panel", view, new Rect(0, 0, inner - ui.Dp(12), row * lines.Count), shopScroll);
        for (int i = 0; i < lines.Count; i++)
        {
            var (text, strong, right) = lines[i];
            var area = new Rect(0, row * i, inner - ui.Dp(12), row);
            if (right)
            {
                string[] parts = text.Split('\t');
                ui.Label(area, parts[0], ink);
                ui.Label(area, parts[1], new StudioText(ink.size, StudioAlign.Right, Color.white));
            }
            else ui.Label(area, text, strong ? bold : ink);
        }
        ui.EndScroll();
        if (ui.Button("shop/close", new Rect(card.x + pad, card.yMax - pad - ui.Dp(44), inner, ui.Dp(44)), StudioLocalization.Text("shop.close"),
                new StudioText(Mathf.RoundToInt(ui.Dp(16)), StudioAlign.Center, Color.white), true, StudioSkin.Standard(ui.Density)))
            ShopPanel = null;
        ui.Consume();
    }
}
}

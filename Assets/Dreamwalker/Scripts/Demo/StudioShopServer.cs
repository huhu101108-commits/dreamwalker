using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace Dreamwalker.Demo
{
// Owned characters, the server wallet and store purchases: the same rules as FieldRun and the web host (game.js).
// Locked characters join the roster from pulls and rewards. With the server wallet (shop.server) the server buys,
// pulls and pays quest currency (wallet-service.js); store purchases are paid by the server after it checks the
// receipt with the store, and are confirmed only then, so the store delivers an interrupted purchase again.
public sealed partial class StudioWorld
{
    [Serializable] private class ShopRequest { public string game, action, id; public int count; }
    [Serializable] private class ReceiptRequest { public string game, store, sku, token; }
    [Serializable] private class WalletRequest { public string game; }
    [Serializable] private class ShopState { public StudioCount[] wallet, pity, bought, items; public string[] owned; public StudioDrawRecord[] draws; }
    [Serializable] private class ShopReply { public string error, title; public bool paid; public ShopState state; public StudioDrawRecord[] results; }

    private readonly HashSet<string> ownedCharacters = new HashSet<string>();
    private int shopCalls;
    private const string KeptPurchasesKey = "dreamwalker-iap-v1:";

    private void OwnedReset()
    {
        ownedCharacters.Clear();
        foreach (var c in Project.characters) if (!c.locked) ownedCharacters.Add(c.id);
    }
    private bool Owns(string id) => ownedCharacters.Contains(id);
    private StudioCharacter[] Roster => Array.FindAll(Project.characters, c => ownedCharacters.Contains(c.id));
    // The character to play a map with: its start character when the player has it, else the one in play.
    private string Playable(string id, string previous)
    {
        if (Owns(id)) return id;
        if (!string.IsNullOrEmpty(previous) && Owns(previous)) return previous;
        var roster = Roster;
        return roster.Length > 0 ? roster[0].id : id;
    }
    // Editor plays are test plays, with their own wallet, as the studio's test plays are.
    private string ShopGame
    {
        get
        {
            string game = (Application.isEditor ? "preview-" : "") + CloudGame;
            return game.Length > 50 ? game.Substring(0, 50) : game;
        }
    }

    private void StartStore()
    {
        StudioPurchases.Pending = PendingPurchase;
        if (Array.Exists(Project.shop?.products ?? Array.Empty<StudioProduct>(), p => p.cost?.kind == "money")) StudioPurchases.Prepare?.Invoke(Project);
        if (Project.shop?.server == true) ServerShop("wallet", "", 1, true);
    }
    // buy, draw, claim (a quest's currency), wallet or receipt.
    private void ServerShop(string op, string id, int count, bool quiet = false, StudioReceipt receipt = null)
    {
        if (!Running) return;
        StartCoroutine(ServerShopCall(op, id, count, quiet, receipt));
    }
    private static IEnumerator ShopPost(string path, object body, Action<long, string> done)
    {
        string token = PlayerPrefs.GetString(GuestTokenKey, "");
        using (var req = new UnityWebRequest(StudioConnection.Origin + "/api/arena/" + path, "POST"))
        {
            req.downloadHandler = new DownloadHandlerBuffer();
            req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(JsonUtility.ToJson(body)));
            req.SetRequestHeader("Content-Type", "application/json");
            req.timeout = 20;
            if (!string.IsNullOrEmpty(token)) req.SetRequestHeader("Authorization", "Bearer " + token);
            yield return req.SendWebRequest();
            bool answered = req.result == UnityWebRequest.Result.Success || req.result == UnityWebRequest.Result.ProtocolError;
            done(answered ? req.responseCode : -1, req.downloadHandler.text);
        }
    }
    private IEnumerator ServerShopCall(string op, string id, int count, bool quiet, StudioReceipt receipt)
    {
        bool exclusive = op != "claim" && op != "wallet";
        if (exclusive && shopCalls > 0) yield break;
        if (exclusive) shopCalls++;
        try
        {
            long status = 0;
            CloudReply session = null;
            yield return CloudCall("session", new CloudSession(), (s, r) => { status = s; session = r; });
            if (status < 200 || status >= 300) { if (!quiet) Notice(StudioLocalization.Text("shop.server")); yield break; }
            if (!string.IsNullOrEmpty(session.token)) { PlayerPrefs.SetString(GuestTokenKey, session.token); PlayerPrefs.Save(); }
            string text = "";
            object body = op == "wallet" ? new WalletRequest { game = ShopGame }
                : op == "receipt" ? (object)new ReceiptRequest { game = ShopGame, store = receipt.store, sku = receipt.sku, token = receipt.token }
                : new ShopRequest { game = ShopGame, action = op, id = id, count = count };
            yield return ShopPost(op == "wallet" || op == "receipt" ? op : "shop", body, (s, t) => { status = s; text = t; });
            ShopReply reply = null;
            try { reply = JsonUtility.FromJson<ShopReply>(text); }
            catch (ArgumentException) { }
            if (status != 200 || reply?.state == null)
            {
                if (!quiet) Notice(StudioLocalization.Text(op == "receipt" ? "shop.verify" : "shop.server"));
                yield break;
            }
            bool showResults = string.IsNullOrEmpty(reply.error) && op != "claim" && op != "wallet" && reply.results != null;
            ApplyServerShop(reply.state, showResults ? reply.results : null, reply.title);
            PersistShop();
            if (!string.IsNullOrEmpty(reply.error)) Notice(StudioLocalization.Text(reply.error == "short" || reply.error == "limit" ? "shop." + reply.error : "shop.server"));
            else if (op == "receipt")
            {
                // Paid (now or before): the store may finish the purchase.
                StudioPurchases.Confirm?.Invoke(receipt);
                Notice(StudioLocalization.Text(receipt.store == "test" ? "shop.testPaid" : "shop.bought"));
            }
        }
        finally
        {
            if (exclusive) shopCalls--;
        }
    }
    // The server's answer: its wallet, pity and purchase counts replace the device's, its items and characters join
    // the player's, and a pull or purchase shows its result.
    private void ApplyServerShop(ShopState state, StudioDrawRecord[] results, string title)
    {
        var shop = Project.shop;
        wallet.Clear(); pityCount.Clear(); bought.Clear(); draws.Clear();
        foreach (var c in shop.currencies) wallet[c.id] = 0;
        foreach (var c in state.wallet ?? Array.Empty<StudioCount>()) { var currency = Currency(c?.key); if (currency != null && c.count >= 0) wallet[c.key] = Math.Min(c.count, currency.max); }
        foreach (var c in state.pity ?? Array.Empty<StudioCount>()) if (c != null && Banner(c.key) != null && c.count >= 0 && c.count <= 1000) pityCount[c.key] = c.count;
        foreach (var c in state.bought ?? Array.Empty<StudioCount>())
            if (c != null && Array.Exists(shop.products ?? Array.Empty<StudioProduct>(), p => p.id == c.key) && c.count >= 1 && c.count <= 999) bought[c.key] = c.count;
        foreach (var c in state.items ?? Array.Empty<StudioCount>())
            if (c != null && Item(c.key) != null && c.count >= 1) bag[c.key] = Math.Max(bag.TryGetValue(c.key, out int n) ? n : 0, Math.Min(999999, c.count));
        foreach (var characterId in state.owned ?? Array.Empty<string>()) if (Project.Character(characterId) != null) ownedCharacters.Add(characterId);
        foreach (var d in state.draws ?? Array.Empty<StudioDrawRecord>())
            if (d != null && Banner(d.banner) != null && d.count >= 1 && draws.Count < DrawHistory) draws.Add(d);
        if (results != null)
        {
            var panel = new StudioShopPanel { kind = "result", title = title };
            foreach (var r in results) if (r != null && r.count >= 1 && panel.rewards.Count < 10) panel.rewards.Add(r);
            ShopPanel = panel;
        }
        SyncControls();
    }
    // A store purchase for a server-wallet game: the server checks the receipt with the store and pays once.
    private void ReceiptArrived(StudioReceipt receipt)
    {
        if (receipt == null || !receipt.ok) return;
        ServerShop("receipt", "", 1, false, receipt);
    }
    // A store purchase for a game without the server wallet: kept in the device save, then confirmed. Tokens already
    // kept are confirmed without paying again, so a purchase the store delivers twice pays once.
    private void KeepPurchase(StudioReceipt receipt)
    {
        string key = KeptPurchasesKey + CloudGame, kept = PlayerPrefs.GetString(key, "");
        var tokens = new List<string>(kept.Split(new[] { '\n' }, StringSplitOptions.RemoveEmptyEntries));
        if (!tokens.Contains(receipt.token))
        {
            var p = Array.Find(Project.shop?.products ?? Array.Empty<StudioProduct>(), v => v.cost?.kind == "money" && v.cost.sku == receipt.sku);
            if (p == null || Buy(p.id, true) != "ok") return;
            PersistShop();
            tokens.Add(receipt.token);
            if (tokens.Count > 100) tokens.RemoveRange(0, tokens.Count - 100);
            PlayerPrefs.SetString(key, string.Join("\n", tokens));
            PlayerPrefs.Save();
            Notice(StudioLocalization.Text("shop.bought"));
        }
        StudioPurchases.Confirm?.Invoke(receipt);
    }
    private void PendingPurchase(StudioReceipt receipt)
    {
        if (receipt == null || !receipt.ok || !Running) return;
        if (Project.shop?.server == true) ReceiptArrived(receipt);
        else KeepPurchase(receipt);
    }
}
}

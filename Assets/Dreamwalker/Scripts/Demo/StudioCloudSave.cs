using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using Dreamwalker.UI;
using UnityEngine;
using UnityEngine.Networking;

namespace Dreamwalker.Demo
{
// Cloud saves and device transfer through the studio server, with this device's online guest (the same token as the
// online match). The cloud copy is the device save as it is. The screen actions match the web game: cloudSave,
// cloudLoad, transferIssue and transferClaim (the button's target is the input that holds the code).
public sealed partial class StudioWorld
{
    internal const string GuestTokenKey = "dreamwalker-arena-guest-v1";
    private const string CloudSlot = "unity";
    private bool cloudBusy;
    private string notice = "";
    private float noticeUntil;
    // Values screens show but saves never keep, such as the transfer code ({입력:기기이전코드}).
    private readonly Dictionary<string, string> hostValues = new Dictionary<string, string>();
    private string CloudGame => string.IsNullOrEmpty(Project.saveId) ? Project.startMap : Project.saveId;
    private string CloudRevKey => "dreamwalker-cloud-v1:" + CloudGame;

    [Serializable] private class CloudSession { public bool native = true; }
    [Serializable] private class CloudClaim { public string code; public bool native = true; }
    [Serializable] private class CloudWrite { public string game, slot, data; public int rev; public bool overwrite; }
    [Serializable] private class CloudReply { public string error, data, code, token; public int rev; public bool created; }

    private static bool CloudAction(string action) =>
        action == "cloudSave" || action == "cloudLoad" || action == "transferIssue" || action == "transferClaim";
    private void Notice(string text)
    {
        notice = text ?? "";
        noticeUntil = Time.unscaledTime + 5;
    }
    private void CloudPress(string action, string target)
    {
        if (cloudBusy) return;
        string code = "";
        if (action == "transferClaim" && !formValues.TryGetValue(target ?? "", out code)) formDefaults.TryGetValue(target ?? "", out code);
        StartCoroutine(Cloud(action, target ?? "", code ?? ""));
    }
    // status: the HTTP status, or -1 when the server could not be reached.
    private static IEnumerator CloudCall(string path, object body, Action<long, CloudReply> done)
    {
        string token = PlayerPrefs.GetString(GuestTokenKey, "");
        using (var req = new UnityWebRequest(StudioConnection.Origin + "/api/arena/" + path, body == null ? "GET" : "POST"))
        {
            req.downloadHandler = new DownloadHandlerBuffer();
            req.timeout = 15;
            if (body != null)
            {
                req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(JsonUtility.ToJson(body)));
                req.SetRequestHeader("Content-Type", "application/json");
            }
            if (!string.IsNullOrEmpty(token)) req.SetRequestHeader("Authorization", "Bearer " + token);
            yield return req.SendWebRequest();
            CloudReply reply = null;
            try { reply = JsonUtility.FromJson<CloudReply>(req.downloadHandler.text); }
            catch (ArgumentException) { }
            bool answered = req.result == UnityWebRequest.Result.Success || req.result == UnityWebRequest.Result.ProtocolError;
            done(answered ? req.responseCode : -1, reply ?? new CloudReply());
        }
    }
    private IEnumerator Cloud(string action, string target, string code)
    {
        cloudBusy = true;
        try
        {
            long status = 0;
            CloudReply reply = null;
            Action<long, CloudReply> take = (s, r) => { status = s; reply = r; };
            bool claimed = false;
            if (action == "transferClaim")
            {
                // The new device takes over the guest that issued the code; the old device's token stops working.
                yield return CloudCall("claim", new CloudClaim { code = code }, take);
                if (status != 200 || string.IsNullOrEmpty(reply.token))
                {
                    Notice(StudioLocalization.Text(status == 400 || status == 404 ? "cloud.badCode" : "cloud.failed"));
                    yield break;
                }
                PlayerPrefs.SetString(GuestTokenKey, reply.token);
                PlayerPrefs.DeleteKey(CloudRevKey);
                PlayerPrefs.Save();
                claimed = true;
                action = "cloudLoad";
            }
            else
            {
                yield return CloudCall("session", new CloudSession(), take);
                if (status < 200 || status >= 300) { Notice(StudioLocalization.Text("cloud.failed")); yield break; }
                if (!string.IsNullOrEmpty(reply.token)) PlayerPrefs.SetString(GuestTokenKey, reply.token);
                // A new guest (for example after this device's progress moved away) has no cloud copy yet.
                if (reply.created) PlayerPrefs.DeleteKey(CloudRevKey);
                PlayerPrefs.Save();
            }
            if (action == "cloudSave")
            {
                SaveProgress();
                string data = PlayerPrefs.GetString(SaveKey, "");
                if (string.IsNullOrEmpty(data)) { Notice(StudioLocalization.Text("save.busy")); yield break; }
                yield return CloudCall("save", new CloudWrite { game = CloudGame, slot = CloudSlot, data = data,
                    rev = PlayerPrefs.GetInt(CloudRevKey, 0), overwrite = target == "overwrite" }, take);
                if (status == 409) { Notice(StudioLocalization.Text("cloud.conflict")); yield break; }
                if (status != 200) { Notice(StudioLocalization.Text("cloud.failed")); yield break; }
                PlayerPrefs.SetInt(CloudRevKey, reply.rev);
                PlayerPrefs.Save();
                Notice(StudioLocalization.Text("cloud.saved"));
            }
            else if (action == "cloudLoad")
            {
                yield return CloudCall("save?game=" + UnityWebRequest.EscapeURL(CloudGame) + "&slot=" + CloudSlot, null, take);
                if (status == 404)
                {
                    Notice((claimed ? StudioLocalization.Text("cloud.claimed") + " " : "") + StudioLocalization.Text("cloud.none"));
                    yield break;
                }
                if (status != 200 || string.IsNullOrEmpty(reply.data)) { Notice(StudioLocalization.Text("cloud.failed")); yield break; }
                if (!LoadSave(reply.data)) { Notice(StudioLocalization.Text("cloud.incompatible")); yield break; }
                PlayerPrefs.SetInt(CloudRevKey, reply.rev);
                PlayerPrefs.Save();
                Notice(StudioLocalization.Text(claimed ? "cloud.claimed" : "cloud.loaded"));
            }
            else if (action == "transferIssue")
            {
                yield return CloudCall("transfer", new CloudSession(), take);
                if (status != 200 || string.IsNullOrEmpty(reply.code)) { Notice(StudioLocalization.Text("cloud.failed")); yield break; }
                hostValues["기기이전코드"] = reply.code;
                Notice(StudioLocalization.Text("cloud.code").Replace("{코드}", reply.code));
            }
        }
        finally
        {
            cloudBusy = false;
        }
    }
    // Opens a downloaded save like a device save: checked first, so a save this version cannot open changes nothing.
    private bool LoadSave(string json)
    {
        StudioPlayerSave saved;
        try { saved = JsonUtility.FromJson<StudioPlayerSave>(json); }
        catch (ArgumentException) { return false; }
        if (saved == null || saved.version != 1 || saved.hp <= 0 || Project.Map(saved.map) == null || Project.Character(saved.actor) == null)
            return false;
        PlayerPrefs.SetString(SaveKey, json);
        PlayerPrefs.Save();
        ResetProgress();
        flow = new StudioScreenFlow();
        Present(null);
        if (!RestoreProgress()) { Enter(Project.Map(Project.startMap)); Fire("start"); }
        lastCheckpoint = json;
        SyncControls();
        return true;
    }
    private void DrawNotice()
    {
        if (string.IsNullOrEmpty(notice) || Time.unscaledTime >= noticeUntil || Painter == null) return;
        var style = new StudioText(Mathf.RoundToInt(Painter.Dp(15)), StudioAlign.Center, Color.white);
        float width = Mathf.Min(Screen.width - Painter.Dp(24), Painter.Width(notice, style) + Painter.Dp(32));
        float height = Mathf.Max(Painter.Dp(44), Painter.Height(notice, style, width - Painter.Dp(16)) + Painter.Dp(16));
        var area = new Rect((Screen.width - width) / 2, Screen.height - height - Painter.Dp(84), width, height);
        Painter.Box(area, new Color(0, 0, 0, .8f), Painter.Dp(10));
        Painter.Label(area, notice, style);
    }
}
}

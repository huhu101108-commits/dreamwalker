using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace Dreamwalker.Demo
{
// Error reports with the player's consent (screen action «reports»): exceptions and errors of a player build go to the
// studio server with the game version, map and device model, ten different ones at most per play, plus one count per
// play. No player identity, inputs or saves are sent, and nothing is sent from the Unity Editor.
public sealed partial class StudioWorld
{
    private readonly HashSet<string> reported = new HashSet<string>();
    private bool listening;
    private static bool countedPlay;
    private string ReportKey => "dreamwalker-reports-v1:" + CloudGame;
    private bool ReportsAllowed => PlayerPrefs.GetString(ReportKey, "") == "on";

    [Serializable] private class ErrorReport { public string runtime = "unity", message, stack, version, place, device; }
    [Serializable] private class PlayCount { public string runtime = "unity"; }

    private static string Cut(string text, int max) => string.IsNullOrEmpty(text) ? "" : text.Length <= max ? text : text.Substring(0, max);
    private void StartReports()
    {
        if (!listening) { Application.logMessageReceived += OnLog; listening = true; }
        ReportsWord();
        // One count per run of the app, also when the studio sends a newer content version.
        if (ReportsAllowed && !Application.isEditor && !countedPlay)
        {
            countedPlay = true;
            StartCoroutine(PostReport("/session", JsonUtility.ToJson(new PlayCount())));
        }
    }
    private void StopReports()
    {
        if (listening) { Application.logMessageReceived -= OnLog; listening = false; }
    }
    private void ReportsWord() => hostValues["오류보고"] = StudioLocalization.Text(ReportsAllowed ? "reports.on" : "reports.off");
    private void SetReports(string target)
    {
        bool on = target == "on" || (string.IsNullOrEmpty(target) && !ReportsAllowed);
        PlayerPrefs.SetString(ReportKey, on ? "on" : "off");
        PlayerPrefs.Save();
        ReportsWord();
        Notice(StudioLocalization.Text(on ? "reports.agreed" : "reports.stopped"));
    }
    private void OnLog(string condition, string stackTrace, LogType type)
    {
        if (type != LogType.Exception && type != LogType.Error && type != LogType.Assert) return;
        if (Application.isEditor || !Running || !ReportsAllowed || reported.Count >= 10) return;
        string first = (stackTrace ?? "").Split('\n')[0];
        if (!reported.Add(condition + "\n" + first)) return;
        var report = new ErrorReport
        {
            message = Cut(condition, 300), stack = Cut(stackTrace, 2000), version = Cut(Application.version, 64),
            place = Map?.id ?? "", device = Cut(SystemInfo.deviceModel + " · " + SystemInfo.operatingSystem, 80)
        };
        StartCoroutine(PostReport("", JsonUtility.ToJson(report)));
    }
    private static IEnumerator PostReport(string path, string json)
    {
        using (var req = new UnityWebRequest(StudioConnection.Origin + "/api/reports" + path, "POST"))
        {
            req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json));
            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type", "application/json");
            req.timeout = 10;
            yield return req.SendWebRequest();
        }
    }
}
}

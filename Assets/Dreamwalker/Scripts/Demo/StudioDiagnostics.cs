using System;
using System.IO;
using Dreamwalker.UI;
using UnityEngine;
namespace Dreamwalker.Demo
{
[Serializable]
public class StudioDeviceSample
{
    public int version = 1, frames, slowFrames;
    public string map, platform, time;
    public float fps, p95ms, maxms;
}
public sealed partial class StudioWorld
{
    private readonly float[] frameSamples = new float[240], sortedSamples = new float[240];
    private int sampleCount, sampleIndex;
    private bool showReport;
    private string reportText = "", reportStatus = "";
    private float nextReport;
    private void RecordFrame()
    {
        if (!Debug.isDebugBuild && !Application.isEditor)
            return;
        float ms = Time.unscaledDeltaTime * 1000;
        if (ms <= 0)
            return;
        frameSamples[sampleIndex] = ms;
        sampleIndex = (sampleIndex + 1) % frameSamples.Length;
        sampleCount = Math.Min(sampleCount + 1, frameSamples.Length);
    }
    private void DrawDiagnostics()
    {
        if (!Debug.isDebugBuild && !Application.isEditor)
            return;
        var ui = Painter;
        float w = Mathf.Min(ui.Dp(260), Screen.width * .35f);
        var label = new StudioText(Mathf.RoundToInt(ui.Dp(13)), StudioAlign.Center, Color.white);
        var standard = StudioSkin.Standard(ui.Density);
        if (ui.Button("world/performance", new Rect(ui.Dp(4), Screen.height - ui.Dp(38), ui.Dp(100), ui.Dp(34)), showReport ? "성능 닫기" : "성능 기록", label, true, standard))
            showReport = !showReport;
        if (!showReport || sampleCount == 0)
            return;
        if (Time.unscaledTime >= nextReport || reportText == "")
        {
            nextReport = Time.unscaledTime + 1;
            Array.Copy(frameSamples, sortedSamples, sampleCount);
            Array.Sort(sortedSamples, 0, sampleCount);
            float sum = 0;
            int slow = 0;
            for (int i = 0; i < sampleCount; i++)
            {
                sum += sortedSamples[i];
                if (sortedSamples[i] > 25)
                    slow++;
            }
            var report =
                new StudioDeviceSample { map = Map.id,
                                         platform = Application.platform.ToString(),
                                         time = DateTime.UtcNow.ToString("O"),
                                         frames = sampleCount,
                                         slowFrames = slow,
                                         fps = 1000f * sampleCount / sum,
                                         p95ms = sortedSamples[Mathf.CeilToInt(sampleCount * .95f) - 1],
                                         maxms = sortedSamples[sampleCount - 1] };
            reportText = JsonUtility.ToJson(report);
            reportLabel = report.fps.ToString("F1") + " FPS · P95 " + report.p95ms.ToString("F1") + " ms";
        }
        var rect = new Rect(ui.Dp(4), Screen.height - ui.Dp(152), w, ui.Dp(108));
        ui.Box(rect, new Color(.05f, .07f, .1f, .9f), ui.Dp(6));
        ui.Label(new Rect(rect.x, rect.y, rect.width, ui.Dp(26)), reportLabel, label);
        if (ui.Button("world/performance/copy", new Rect(rect.x + ui.Dp(4), rect.y + ui.Dp(28), w - ui.Dp(8), ui.Dp(33)), "측정 JSON 복사", label, true, standard))
        {
            GUIUtility.systemCopyBuffer = reportText;
            reportStatus = "복사 완료";
        }
        if (ui.Button("world/performance/save", new Rect(rect.x + ui.Dp(4), rect.y + ui.Dp(65), w - ui.Dp(8), ui.Dp(33)), "기기에 기록 " + reportStatus, label, true, standard))
        {
            try
            {
                File.WriteAllText(
                    Path.Combine(Application.persistentDataPath, "dreamwalker-performance.json"), reportText);
                reportStatus = "저장 완료";
            }
            catch (IOException)
            {
                reportStatus = "저장 공간 확인";
            }
        }
    }
    private string reportLabel = "";
}
}

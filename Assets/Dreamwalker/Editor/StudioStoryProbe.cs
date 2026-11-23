using System;
using System.IO;
using System.Text;
using Dreamwalker.Demo;
using Dreamwalker.Player;
using UnityEditor;
using UnityEngine;

namespace Dreamwalker.Editor
{
[InitializeOnLoad]
public static class StudioStoryProbe
{
    private const string Prefix = "Dreamwalker.StoryProbe.";
    private const string Menu = "Tools/Dreamwalker/대사 분기·저장 재생";
    private static string Slot => SessionState.GetString(StudioWorld.StoryProbeSlotKey, "");
    static StudioStoryProbe()
    {
        EditorApplication.update += CheckPlayer;
        EditorApplication.playModeStateChanged += OnPlayMode;
    }
    private static void OutsideAssets(string path)
    {
        string assets = Path.GetFullPath(Application.dataPath) + Path.DirectorySeparatorChar;
        if (Path.GetFullPath(path).StartsWith(assets, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("검수 입력과 결과 JSON은 Assets 밖에 보관하세요.");
    }
    private static StudioRelease ReadRelease()
    {
        var asset = Resources.Load<TextAsset>("DreamwalkerStudio/release");
        if (asset == null) throw new InvalidDataException("스튜디오에서 같은 저장본을 내보낸 Unity 콘텐츠 팩을 가져오세요.");
        return JsonUtility.FromJson<StudioRelease>(asset.text);
    }
    private static StudioStoryRequest ReadRequest(string path)
    {
        if (new FileInfo(path).Length > 256_000) throw new InvalidDataException("256KB 이하의 입력 기록을 선택하세요.");
        return JsonUtility.FromJson<StudioStoryRequest>(File.ReadAllText(path, Encoding.UTF8));
    }
    [MenuItem(Menu)]
    public static void StartReplay()
    {
        if (EditorApplication.isPlayingOrWillChangePlaymode || StudioWorld.IsStoryProbeSlot(Slot))
        {
            EditorUtility.DisplayDialog("대사 검수", "현재 재생을 종료한 뒤 새 검수 Play 세션을 시작하세요.", "확인");
            return;
        }
        try
        {
            if (UnityEngine.Object.FindFirstObjectByType<BaekseolMotor>() == null || Camera.main == null)
                throw new InvalidOperationException("플레이어와 메인 카메라가 있는 데모 씬을 열고 다시 실행하세요.");
            var release = ReadRelease();
            string input = EditorUtility.OpenFilePanel("스튜디오에서 저장한 대사 입력 기록", "", "json");
            if (string.IsNullOrEmpty(input)) return;
            OutsideAssets(input);
            StudioWorld.ValidateStoryRequest(release, ReadRequest(input));
            string output = EditorUtility.SaveFilePanel("Unity 대사 검수 결과", Path.GetDirectoryName(input),
                "Dreamwalker-Story-Result-v" + release.rev, "json");
            if (string.IsNullOrEmpty(output)) return;
            OutsideAssets(output);
            if (string.Equals(Path.GetFullPath(input), Path.GetFullPath(output), StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("입력 기록과 다른 파일에 결과를 저장하세요.");
            SessionState.SetString(Prefix + "input", input);
            SessionState.SetString(Prefix + "output", output);
            SessionState.SetString(Prefix + "phase", "waiting");
            SessionState.SetString(Prefix + "message", "");
            SessionState.SetFloat(Prefix + "started", (float)EditorApplication.timeSinceStartup);
            SessionState.SetString(StudioWorld.StoryProbeSlotKey, StudioWorld.StoryProbeSlotPrefix + Guid.NewGuid().ToString("N"));
            EditorApplication.EnterPlaymode();
        }
        catch (Exception error) { EditorUtility.DisplayDialog("대사 검수", error.Message, "확인"); }
    }
    private static void CheckPlayer()
    {
        if (!StudioWorld.IsStoryProbeSlot(Slot) || !EditorApplication.isPlaying ||
            SessionState.GetString(Prefix + "phase", "") != "waiting") return;
        try
        {
            var world = UnityEngine.Object.FindFirstObjectByType<StudioWorld>();
            if (world == null || !world.Running)
            {
                if (EditorApplication.timeSinceStartup - SessionState.GetFloat(Prefix + "started", 0) < 90) return;
                throw new InvalidOperationException("검수 시간이 지났어요. 콘텐츠 팩과 데모 씬의 플레이어·카메라를 확인하세요.");
            }
            SessionState.SetString(Prefix + "phase", "running");
            var result = world.ReplayStory(ReadRelease(), ReadRequest(SessionState.GetString(Prefix + "input", "")));
            string output = SessionState.GetString(Prefix + "output", "");
            string json = JsonUtility.ToJson(result, true);
            if (Encoding.UTF8.GetByteCount(json) > 4_000_000) throw new InvalidDataException("기록이 4MB를 넘었어요. 입력을 나누어 검수하세요.");
            File.WriteAllText(output, json, new UTF8Encoding(false));
            EndSession("v" + result.revision + " 대사 입력 " + result.outcome.steps.Length + "건을 재생했어요. 스튜디오에서 이 결과 파일을 비교하세요.\n" + output);
        }
        catch (Exception error) { EndSession("대사 검수 중단 · " + error.Message); }
    }
    private static void EndSession(string message)
    {
        SessionState.SetString(Prefix + "message", message);
        SessionState.SetString(Prefix + "phase", "finished");
        EditorApplication.ExitPlaymode();
    }
    private static void OnPlayMode(PlayModeStateChange state)
    {
        // Keep the isolated key until the runtime's quit/destroy autosave has finished.
        if (state != PlayModeStateChange.EnteredEditMode || !StudioWorld.IsStoryProbeSlot(Slot)) return;
        PlayerPrefs.DeleteKey(Slot);
        PlayerPrefs.Save();
        string message = SessionState.GetString(Prefix + "message", "");
        if (string.IsNullOrEmpty(message)) message = "검수 Play 세션을 종료했어요. 결과를 얻으려면 다시 재생하세요.";
        SessionState.EraseString(StudioWorld.StoryProbeSlotKey);
        foreach (var name in new[] { "input", "output", "phase", "message" }) SessionState.EraseString(Prefix + name);
        SessionState.EraseFloat(Prefix + "started");
        EditorApplication.delayCall += () => EditorUtility.DisplayDialog("대사 검수", message, "확인");
    }
}
}

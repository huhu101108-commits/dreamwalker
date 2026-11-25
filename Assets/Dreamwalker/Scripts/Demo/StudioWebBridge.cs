using System;
using System.Runtime.InteropServices;
using UnityEngine;

namespace Dreamwalker.Demo
{
// The Unity web player inside the studio's «Unity로 테스트 플레이» frame (Studio/src/unity-play.js). The frame has no
// network: the page hands over the draft world and the addresses of its pictures and sounds, and this object passes
// them to StudioConnection. Outside a web player nothing here runs.
public sealed class StudioWebBridge : MonoBehaviour
{
    // The name the page sends its messages to.
    public const string ObjectName = "DreamwalkerWeb";
    [Serializable] internal class HostAsset { public string id, url, type; }
    [Serializable] private class HostPlay { public StudioRelease release; public HostAsset[] assets; public string map; public float pixelRatio; }
    [Serializable] private class HostEvent { public string @event, message; }

#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")] private static extern void DreamwalkerWebPost(string json);
#else
    private static void DreamwalkerWebPost(string json) { }
#endif

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    private static void Attach()
    {
        if (Application.platform != RuntimePlatform.WebGLPlayer) return;
        var host = new GameObject(ObjectName);
        DontDestroyOnLoad(host);
        host.AddComponent<StudioWebBridge>();
    }

    private static void Post(string name, string message = "") =>
        DreamwalkerWebPost(JsonUtility.ToJson(new HostEvent { @event = name, message = message }));

    // The page waits for this before it hands the content over.
    private void Start() => Post("ready", "Unity " + Application.unityVersion);

    // Called by the page (SendMessage): {"release":{"rev":1,"project":{…}},"assets":[{"id":"asset:…","url":"blob:…","type":"image/png"}],"map":"","pixelRatio":2}.
    public void Play(string json)
    {
        HostPlay play;
        try { play = JsonUtility.FromJson<HostPlay>(json); }
        catch (ArgumentException) { play = null; }
        var connection = FindFirstObjectByType<StudioConnection>();
        if (play?.release?.project == null || connection == null)
        {
            Debug.LogError(connection == null ? "Dreamwalker: the studio connection is not in the scene." : "Dreamwalker: the page sent content this player cannot read.");
            return;
        }
        // Screens are authored in CSS pixels: the page's device pixel ratio is the scale to the canvas's pixels.
        if (play.pixelRatio > 0) Dreamwalker.UI.StudioUiGeometry.HostDensity = Mathf.Clamp(play.pixelRatio, 1f, 4f);
        // «여기서 플레이»: start on the map being edited.
        if (!string.IsNullOrEmpty(play.map) && play.release.project.scenes != null && play.release.project.Map(play.map) != null)
            play.release.project.startMap = play.map;
        if (!connection.PlayHosted(play.release, play.assets ?? Array.Empty<HostAsset>()))
            Debug.LogError("Dreamwalker: this player does not support the content's format (schema " + play.release.project.schema + ").");
    }
}
}

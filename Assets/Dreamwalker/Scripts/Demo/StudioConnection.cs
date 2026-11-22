using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using Dreamwalker.Combat;
using Dreamwalker.Player;
using UnityEngine;
using UnityEngine.Networking;

namespace Dreamwalker.Demo
{
public sealed class StudioConnection : MonoBehaviour
{
    private const string Origin = "https://dreamwalker-snowfield-studio.congenialcockatoo.chatgpt.site";
    [Serializable]
    private class Login
    {
        public string password;
        public bool runtime = true;
    }
    [Serializable]
    private class Session
    {
        public string token = "";
    }

    private string password = "", token, status = "";
    private bool expanded, connecting;
    private StudioRelease latest, bundled;
    private readonly Dictionary<string, Texture2D> localImages = new Dictionary<string, Texture2D>();
    private StudioWorld world;
    private readonly Dictionary<string, Texture2D> textures = new Dictionary<string, Texture2D>();
    private readonly HashSet<string> loading = new HashSet<string>();
    private readonly Dictionary<string, float> retryAfter = new Dictionary<string, float>();

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    private static void Attach()
    {
        var player = FindFirstObjectByType<BaekseolMotor>();
        if (player != null && player.GetComponent<StudioConnection>() == null)
            player.gameObject.AddComponent<StudioConnection>();
    }

    private void Start()
    {
        // An explicitly exported content pack can ship in a normal offline build.
        var asset = Resources.Load<TextAsset>("DreamwalkerStudio/release");
        if (asset == null)
            return;
        try
        {
            bundled = JsonUtility.FromJson<StudioRelease>(asset.text);
        }
        catch (ArgumentException)
        {
            status = "Invalid content pack";
            return;
        }
        if (Supported(bundled))
            PlayContent(bundled);
    }

    private static bool Supported(StudioRelease release) =>
        release?.project?.schema == 3 || release?.project?.schema == 4;

    private void PlayContent(StudioRelease release)
    {
        if (world == null)
            world = gameObject.AddComponent<StudioWorld>();
        world.Play(release.project, this);
        expanded = false;
    }

    private void OnGUI()
    {
        GUI.depth = -100;
        float width = Mathf.Min(245, Screen.width);
        GUILayout.BeginArea(new Rect(Screen.width - width, 0, width, expanded ? 245 : 30));
        if (GUILayout.Button(expanded ? "Close Studio" : "Dreamwalker Studio"))
            expanded = !expanded;
        if (expanded)
        {
            if (world != null && GUILayout.Button("Return to combat demo"))
                CloseWorld();
            if (world == null && Supported(bundled) && GUILayout.Button("Play bundled content"))
                PlayContent(bundled);
            if (string.IsNullOrEmpty(token))
            {
                password = GUILayout.PasswordField(password, '*', 128);
                GUI.enabled = !connecting && password.Length > 0;
                if (GUILayout.Button("Connect to studio"))
                    StartCoroutine(Connect());
                GUI.enabled = true;
            }
            else
            {
                if (Supported(latest) &&
                    GUILayout.Button(world == null ? "Play studio maps" : "Restart with latest version"))
                {
                    PlayContent(latest);
                }
                if (GUILayout.Button("Disconnect"))
                {
                    string old = token;
                    StopAllCoroutines();
                    EndSession();
                    StartCoroutine(Logout(old));
                }
            }
            GUILayout.Label(status);
        }
        GUILayout.EndArea();
    }

    private void CloseWorld()
    {
        if (world == null)
            return;
        world.Leave();
        Destroy(world);
        world = null;
        if (latest != null)
            ApplyDemoTuning(latest.project.tuning);
    }

    private void ApplyDemoTuning(StudioTuning t)
    {
        GetComponent<BaekseolMotor>().ApplyStudioMovement(t.runSpeed, t.jumpSpeed, t.dashSpeed, t.dashDuration);
        GetComponent<BaekseolSlash>()?.ApplyStudioAttack(t.damage, t.reach);
        foreach (var enemy in FindObjectsByType<CombatTarget>(FindObjectsSortMode.None))
            if (enemy.Faction == CombatFaction.Enemy)
                enemy.ApplyStudioHealth(t.hp);
    }

    private static IEnumerator Logout(string old)
    {
        using (var request = JsonPost("/api/logout", "{}"))
        {
            request.SetRequestHeader("Authorization", "Bearer " + old);
            yield return request.SendWebRequest();
        }
    }

    private void EndSession()
    {
        CloseWorld();
        token = null;
        latest = null;
        status = "Disconnected";
        loading.Clear();
        retryAfter.Clear();
        foreach (var tex in textures.Values)
            Destroy(tex);
        textures.Clear();
    }

    private void OnDestroy()
    {
        foreach (var tex in textures.Values)
            Destroy(tex);
    }

    private static UnityWebRequest JsonPost(string path, string body)
    {
        var request = new UnityWebRequest(Origin + path, "POST");
        request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
        request.downloadHandler = new DownloadHandlerBuffer();
        request.SetRequestHeader("Content-Type", "application/json");
        request.timeout = 12;
        return request;
    }

    private IEnumerator Connect()
    {
        connecting = true;
        var body = JsonUtility.ToJson(new Login { password = password });
        password = "";
        using (var request = JsonPost("/api/login", body))
        {
            yield return request.SendWebRequest();
            connecting = false;
            if (request.result != UnityWebRequest.Result.Success)
            {
                status = "Login failed (" + request.responseCode + ")";
                yield break;
            }
            token = JsonUtility.FromJson<Session>(request.downloadHandler.text)?.token;
        }

        while (!string.IsNullOrEmpty(token))
        {
            int since = latest != null ? latest.rev : -1;
            using (var request = UnityWebRequest.Get(Origin + "/api/runtime?schema=4&joystick=1&since=" + since))
            {
                request.SetRequestHeader("Authorization", "Bearer " + token);
                request.timeout = 12;
                yield return request.SendWebRequest();
                if (request.responseCode == 401 || request.responseCode == 403)
                {
                    EndSession();
                    status = "Please sign in again.";
                    yield break;
                }
                if (request.responseCode == 204)
                    status = "Studio version " + since;
                else if (request.result == UnityWebRequest.Result.Success)
                {
                    var release = JsonUtility.FromJson<StudioRelease>(request.downloadHandler.text);
                    if (Supported(release) && release.project.tuning != null)
                    {
                        latest = release;
                        if (world == null)
                            ApplyDemoTuning(release.project.tuning);
                        status = "Studio version " + latest.rev;
                    }
                }
                else
                    status = "Connection interrupted. Retrying...";
            }
            yield return new WaitForSecondsRealtime(5);
        }
    }

    internal int PendingTextures => loading.Count;
    public Texture2D Texture(string reference)
    {
        if (string.IsNullOrEmpty(reference))
            return null;
        if (textures.TryGetValue(reference, out var texture))
            return texture;
        string path;
        if (reference == "builtin-player")
            path = "/player.png";
        else if (reference == "builtin-stage")
            path = "/stage.jpg";
        else if (reference.StartsWith("asset:", StringComparison.Ordinal) && reference.Length == 70)
        {
            string digest = reference.Substring(6);
            for (int i = 0; i < digest.Length; i++)
                if (!Uri.IsHexDigit(digest[i]))
                    return null;
            path = "/api/assets/" + digest;
        }
        else
            return null;
        if (bundled != null)
        {
            string key = reference.StartsWith("asset:") ? reference.Substring(6) : reference;
            if (!localImages.TryGetValue(key, out var local))
            {
                local = Resources.Load<Texture2D>("DreamwalkerStudio/Images/" + key);
                localImages[key] = local;
            }
            if (local != null)
                return local;
        }
        if (token == null)
            return null;
        if (retryAfter.TryGetValue(reference, out float retry) && Time.unscaledTime < retry)
            return null;
        if (loading.Add(reference))
            StartCoroutine(LoadTexture(reference, path));
        return null;
    }

    private IEnumerator LoadTexture(string reference, string path)
    {
        string session = token;
        using (var request = UnityWebRequestTexture.GetTexture(Origin + path))
        {
            if (path.StartsWith("/api/"))
                request.SetRequestHeader("Authorization", "Bearer " + session);
            request.timeout = 15;
            yield return request.SendWebRequest();
            if (session == token)
            {
                if (request.result == UnityWebRequest.Result.Success)
                    textures[reference] = DownloadHandlerTexture.GetContent(request);
                else
                    retryAfter[reference] = Time.unscaledTime + 30;
            }
        }
        loading.Remove(reference);
    }
}
}

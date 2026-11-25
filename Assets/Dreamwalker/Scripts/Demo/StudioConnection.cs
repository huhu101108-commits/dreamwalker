using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using Dreamwalker.Combat;
using Dreamwalker.Player;
using Dreamwalker.UI;
using UnityEngine;
using UnityEngine.Networking;

namespace Dreamwalker.Demo
{
public sealed class StudioConnection : MonoBehaviour
{
    public const string Origin = "https://dreamwalker-snowfield-studio.congenialcockatoo.chatgpt.site";
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
    private readonly Dictionary<string, AudioClip> bundledSounds = new Dictionary<string, AudioClip>();
    private readonly Dictionary<string, AudioClip> remoteSounds = new Dictionary<string, AudioClip>();
    private readonly HashSet<string> fetchingSound = new HashSet<string>();
    private readonly Dictionary<string, float> retrySound = new Dictionary<string, float>();
    private readonly Dictionary<string, Texture2D> textures = new Dictionary<string, Texture2D>();
    private readonly HashSet<string> loading = new HashSet<string>();
    private readonly Dictionary<string, float> retryAfter = new Dictionary<string, float>();
    // Content a host page handed over (StudioWebBridge): where each picture and sound is, and its media type.
    private readonly Dictionary<string, StudioWebBridge.HostAsset> hostAssets = new Dictionary<string, StudioWebBridge.HostAsset>();

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    private static void Attach()
    {
        var player = FindFirstObjectByType<BaekseolMotor>();
        if (player != null && player.GetComponent<StudioConnection>() == null)
            player.gameObject.AddComponent<StudioConnection>();
    }

    // The studio panel is a development tool: players of a release build only see the game. A web player gets its
    // content from the page it runs in, so it has no panel either.
    private static bool DeveloperPanel => (Application.isEditor || Debug.isDebugBuild) && Application.platform != RuntimePlatform.WebGLPlayer;
    private StudioPainter ui;
    private void LateUpdate() => ui?.Frame(Paint);

    private void Start()
    {
        if (DeveloperPanel) ui = StudioPainter.Create(this, "Dreamwalker Studio Panel", 30, Paint);
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
        release?.project != null && release.project.combatContract <= 1 &&
        (release.project.schema == 3 || release.project.schema == 4);

    // Plays content from a host page, loading its files from the addresses the page gave. False for an unsupported format.
    internal bool PlayHosted(StudioRelease release, StudioWebBridge.HostAsset[] assets)
    {
        if (!Supported(release)) return false;
        CloseWorld();
        StopAllCoroutines();
        loading.Clear();
        retryAfter.Clear();
        foreach (var tex in textures.Values) Destroy(tex);
        textures.Clear();
        ClearRemoteSounds();
        hostAssets.Clear();
        foreach (var asset in assets)
            if (asset != null && !string.IsNullOrEmpty(asset.id) && !string.IsNullOrEmpty(asset.url)) hostAssets[asset.id] = asset;
        PlayContent(release);
        return true;
    }

    private void PlayContent(StudioRelease release)
    {
        if (world == null)
            world = gameObject.AddComponent<StudioWorld>();
        world.Play(release.project, this);
        expanded = false;
    }

    private void Paint()
    {
        if (StudioOnlineArena.Visible) return;
        float width = Mathf.Min(ui.Dp(245), Screen.width), row = ui.Dp(32), gap = ui.Dp(3), y = 0;
        Rect Next(float height) { var r = new Rect(Screen.width - width, y, width, height); y += height + gap; return r; }
        var text = new StudioText(Mathf.RoundToInt(ui.Dp(14)), StudioAlign.Center, Color.white);
        var standard = StudioSkin.Standard(ui.Density);
        if (ui.Button("studio/toggle", Next(row), expanded ? "Close Studio" : "Dreamwalker Studio", text, true, standard))
            expanded = !expanded;
        if (!expanded)
            return;
        if (ui.Button("studio/online", Next(row), "Online friendly match", text, true, standard))
            (GetComponent<StudioOnlineArena>() ?? gameObject.AddComponent<StudioOnlineArena>()).Open();
        if (world != null && ui.Button("studio/demo", Next(row), "Return to combat demo", text, true, standard))
            CloseWorld();
        if (world == null && Supported(bundled) && ui.Button("studio/bundled", Next(row), "Play bundled content", text, true, standard))
            PlayContent(bundled);
        if (string.IsNullOrEmpty(token))
        {
            var field = Next(row);
            ui.Box(field, new Color(.1f, .13f, .17f, .95f), ui.Dp(4));
            ui.Box(field, new Color(.5f, .58f, .66f, .9f), ui.Dp(4), ui.Dp(1));
            password = ui.Field("studio/password", field, password, 128, new StudioText(text.size, StudioAlign.Left, Color.white), true, true);
            if (ui.Button("studio/connect", Next(row), "Connect to studio", text, !connecting && password.Length > 0, standard))
                StartCoroutine(Connect());
        }
        else
        {
            if (Supported(latest) &&
                ui.Button("studio/latest", Next(row), world == null ? "Play studio maps" : "Restart with latest version", text, true, standard))
            {
                PlayContent(latest);
            }
            if (ui.Button("studio/disconnect", Next(row), "Disconnect", text, true, standard))
            {
                string old = token;
                StopAllCoroutines();
                EndSession();
                StartCoroutine(Logout(old));
            }
        }
        if (!string.IsNullOrEmpty(status))
        {
            var note = new StudioText(Mathf.RoundToInt(ui.Dp(13)), StudioAlign.Left, new Color(.9f, .95f, 1f));
            var area = Next(ui.Height(status, note, width));
            ui.Box(area, new Color(.05f, .07f, .1f, .85f), ui.Dp(4));
            ui.Label(area, status, note);
        }
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
        ClearRemoteSounds();
    }

    private void ClearRemoteSounds()
    {
        foreach (var sound in remoteSounds.Values) Destroy(sound);
        remoteSounds.Clear();
        fetchingSound.Clear();
        retrySound.Clear();
    }
    private void OnDestroy()
    {
        ui?.Dispose();
        ui = null;
        ClearRemoteSounds();
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
        if (hostAssets.TryGetValue(reference, out var hosted))
        {
            if (!(retryAfter.TryGetValue(reference, out float wait) && Time.unscaledTime < wait) && loading.Add(reference))
                StartCoroutine(LoadTexture(reference, hosted.url, false));
            return null;
        }
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
            StartCoroutine(LoadTexture(reference, Origin + path, path.StartsWith("/api/")));
        return null;
    }

    internal AudioClip Sound(string reference)
    {
        if (string.IsNullOrEmpty(reference) || reference.Length != 70 ||
            !reference.StartsWith("asset:", StringComparison.Ordinal)) return null;
        if (remoteSounds.TryGetValue(reference, out var cached)) return cached;
        if (hostAssets.TryGetValue(reference, out var hosted))
        {
            if (!(retrySound.TryGetValue(reference, out float wait) && wait > Time.unscaledTime) && fetchingSound.Add(reference))
                StartCoroutine(LoadSound(reference, hosted.url, Codec(hosted.type), false));
            return null;
        }
        string id = reference.Substring(6);
        if (bundled != null)
        {
            if (!bundledSounds.TryGetValue(id, out var local))
            {
                local = Resources.Load<AudioClip>("DreamwalkerStudio/Audio/" + id);
                bundledSounds[id] = local;
            }
            if (local != null) return local;
        }
        if (token == null || (retrySound.TryGetValue(reference, out float retry) && retry > Time.unscaledTime))
            return null;
        for (int i = 0; i < id.Length; i++) if (!Uri.IsHexDigit(id[i])) return null;
        if (fetchingSound.Add(reference)) StartCoroutine(LoadSound(reference, Origin + "/api/assets/" + id, AudioType.UNKNOWN, true));
        return null;
    }
    private static AudioType Codec(string mediaType)
    {
        switch (mediaType)
        {
            case "audio/wav": return AudioType.WAV;
            case "audio/ogg": return AudioType.OGGVORBIS;
            case "audio/mpeg": return AudioType.MPEG;
            default: return AudioType.UNKNOWN;
        }
    }
    // The studio server names a sound's format in a header; a host page gives it with the address.
    private IEnumerator LoadSound(string reference, string url, AudioType codec, bool authorize)
    {
        string session = token;
        if (codec == AudioType.UNKNOWN && authorize)
            using (var meta = UnityWebRequest.Head(url))
            {
                meta.SetRequestHeader("Authorization", "Bearer " + session);
                meta.timeout = 10;
                yield return meta.SendWebRequest();
                if (meta.result == UnityWebRequest.Result.Success) codec = Codec(meta.GetResponseHeader("Content-Type"));
            }
        if (session == token && codec != AudioType.UNKNOWN)
        {
            using (var request = UnityWebRequestMultimedia.GetAudioClip(url, codec))
            {
                if (authorize) request.SetRequestHeader("Authorization", "Bearer " + session);
                request.timeout = 20;
                yield return request.SendWebRequest();
                if (session == token && request.result == UnityWebRequest.Result.Success)
                    remoteSounds[reference] = DownloadHandlerAudioClip.GetContent(request);
            }
        }
        if (session == token)
        {
            fetchingSound.Remove(reference);
            if (!remoteSounds.ContainsKey(reference)) retrySound[reference] = Time.unscaledTime + 30;
        }
    }

    private IEnumerator LoadTexture(string reference, string url, bool authorize)
    {
        string session = token;
        using (var request = UnityWebRequestTexture.GetTexture(url))
        {
            if (authorize)
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

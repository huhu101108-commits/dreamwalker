using System;
using System.Collections;
using System.Text;
using Dreamwalker.Combat;
using Dreamwalker.Player;
using UnityEngine;
using UnityEngine.Networking;

namespace Dreamwalker.Demo
{
    // Opt-in development connection. The team password and token only live in memory.
    public sealed class StudioConnection : MonoBehaviour
    {
        private const string Api = "https://dreamwalker-snowfield-studio.congenialcockatoo.chatgpt.site/api/";
        [Serializable] private class Login { public string password; public bool runtime = true; }
        [Serializable] private class Session { public string token; }
        [Serializable] private class Release { public int rev; public Project project; }
        [Serializable] private class Project { public Tuning tuning; }
        [Serializable] private class Tuning
        {
            public float runSpeed, jumpSpeed, dashSpeed, dashDuration, reach;
            public int damage, hp;
        }

        private string password = "", token, status = "";
        private bool expanded, connecting;
        private int version = -1;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Attach()
        {
            var player = FindFirstObjectByType<BaekseolMotor>();
            if (player != null && player.GetComponent<StudioConnection>() == null)
                player.gameObject.AddComponent<StudioConnection>();
        }

        private void OnGUI()
        {
            GUILayout.BeginArea(new Rect(Mathf.Max(0, Screen.width - 248), 8, 240, 175));
            if (GUILayout.Button(expanded ? "Close Studio" : "Dreamwalker Studio")) expanded = !expanded;
            if (expanded)
            {
                if (string.IsNullOrEmpty(token))
                {
                    password = GUILayout.PasswordField(password, '*', 128);
                    GUI.enabled = !connecting && password.Length > 0;
                    if (GUILayout.Button("Connect to studio")) StartCoroutine(Connect());
                    GUI.enabled = true;
                }
                else if (GUILayout.Button("Disconnect"))
                {
                    StopAllCoroutines();
                    token = null;
                    version = -1;
                    status = "Disconnected";
                }
                GUILayout.Label(status);
            }
            GUILayout.EndArea();
        }

        private IEnumerator Connect()
        {
            connecting = true;
            var body = Encoding.UTF8.GetBytes(JsonUtility.ToJson(new Login { password = password }));
            password = "";
            using (var request = new UnityWebRequest(Api + "login", "POST"))
            {
                request.uploadHandler = new UploadHandlerRaw(body);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                request.timeout = 12;
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
                using (var request = UnityWebRequest.Get(Api + "runtime"))
                {
                    request.SetRequestHeader("Authorization", "Bearer " + token);
                    request.timeout = 12;
                    yield return request.SendWebRequest();
                    if (request.responseCode == 401 || request.responseCode == 403)
                    {
                        token = null;
                        version = -1;
                        status = "Please sign in again.";
                        yield break;
                    }
                    if (request.result == UnityWebRequest.Result.Success)
                    {
                        var release = JsonUtility.FromJson<Release>(request.downloadHandler.text);
                        if (release?.project?.tuning != null && release.rev != version)
                        {
                            var t = release.project.tuning;
                            GetComponent<BaekseolMotor>().ApplyStudioMovement(t.runSpeed, t.jumpSpeed, t.dashSpeed, t.dashDuration);
                            GetComponent<BaekseolSlash>()?.ApplyStudioAttack(t.damage, t.reach);
                            foreach (var enemy in FindObjectsByType<CombatTarget>(FindObjectsSortMode.None))
                                if (enemy.Faction == CombatFaction.Enemy) enemy.ApplyStudioHealth(t.hp);
                            version = release.rev;
                        }
                        status = "Tuning version " + version;
                    }
                    else status = "Connection interrupted. Retrying...";
                }
                yield return new WaitForSecondsRealtime(5);
            }
        }
    }
}

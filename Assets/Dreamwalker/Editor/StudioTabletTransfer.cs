#if UNITY_EDITOR
using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Dreamwalker.Demo;
using Dreamwalker.Player;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Networking;

namespace Dreamwalker.EditorTools
{
    public sealed partial class StudioPackageImporter
    {
        private const string TokenKey = "Dreamwalker.TabletTransfer.Session";
        private const string ApiRoot = StudioConnection.Origin + "/api/unity-sync/";
        private const string PreviewScene = "Assets/Dreamwalker/Demo/BaekseolCombat.unity";
        [Serializable] private class PairBody { public string code; }
        [Serializable] private class Reply { public string token, error; }
        private class Selection { public string map, item, releaseHash; public int revision; }
        private Selection tabletTarget;
        private string pairCode = "", temporaryPack;
        private UnityWebRequest pending;

        [MenuItem("Tools/Dreamwalker/태블릿 변경 가져오기")]
        public static void OpenTablet() { OpenWindow(); }

        private void DrawTabletTransfer()
        {
            string token = SessionState.GetString(TokenKey, "");
            using (new EditorGUI.DisabledScope(pending != null || EditorApplication.isPlayingOrWillChangePlaymode))
            {
                if (string.IsNullOrEmpty(token))
                {
                    pairCode = EditorGUILayout.TextField("태블릿 연결 코드", pairCode);
                    using (new EditorGUI.DisabledScope(!Regex.IsMatch(pairCode.Replace("-","").Trim(), "^[a-fA-F0-9]{12}$")))
                        if (GUILayout.Button("태블릿 연결")) Pair();
                }
                else
                {
                    if (GUILayout.Button("태블릿 변경 가져오기")) FetchPack(token);
                    if (GUILayout.Button("이 에디터 연결 해제")) SessionState.EraseString(TokenKey);
                }
                if (rows == null && tabletTarget != null && GUILayout.Button("전달받은 위치에서 플레이"))
                {
                    try { PlayTarget(tabletTarget); }
                    catch (Exception e) { message = e.Message; }
                }
            }
        }

        private void Send(UnityWebRequest request, Action<UnityWebRequest> success)
        {
            pending = request;
            request.timeout = 60;
            request.redirectLimit = 0;
            request.SendWebRequest().completed += _ =>
            {
                if (pending != request) return;
                try
                {
                    if (request.result != UnityWebRequest.Result.Success)
                    {
                        if (request.responseCode == 401) SessionState.EraseString(TokenKey);
                        string detail = request.downloadHandler.text;
                        var reply = !string.IsNullOrEmpty(detail) && detail.TrimStart().StartsWith("{")
                            ? JsonUtility.FromJson<Reply>(detail) : null;
                        throw new IOException(reply?.error ?? "태블릿 연결을 확인하세요. " + request.error);
                    }
                    success(request);
                }
                catch (Exception e) { message = e.Message; }
                finally { pending = null; request.Dispose(); Repaint(); }
            };
        }
        private void Pair()
        {
            var request = new UnityWebRequest(ApiRoot + "pair", "POST");
            request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(JsonUtility.ToJson(new PairBody { code = pairCode.Trim() })));
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");
            Send(request, reply =>
            {
                string token = JsonUtility.FromJson<Reply>(reply.downloadHandler.text)?.token;
                if (token == null || !Regex.IsMatch(token, "^[a-f0-9]{48}$")) throw new InvalidDataException("연결 응답을 확인하세요.");
                SessionState.SetString(TokenKey, token);
                pairCode = ""; message = "연결됐어요. 태블릿에서 보낸 콘텐츠를 가져올 수 있어요.";
            });
        }
        private void FetchPack(string token)
        {
            message = "태블릿에서 전달한 콘텐츠를 확인하고 있어요…";
            var request = UnityWebRequest.Get(ApiRoot + "content");
            request.SetRequestHeader("Authorization", "Bearer " + token);
            Send(request, reply =>
            {
                if (!int.TryParse(reply.GetResponseHeader("x-dw-revision"), out int rev)) throw new InvalidDataException("콘텐츠 버전이 없어요.");
                string map=Uri.UnescapeDataString(reply.GetResponseHeader("x-dw-map") ?? "");
                string item=Uri.UnescapeDataString(reply.GetResponseHeader("x-dw-object") ?? "");
                byte[] bytes = reply.downloadHandler.data;
                if (bytes.Length > 24*1024*1024) throw new InvalidDataException("콘텐츠 크기를 확인하세요.");
                string folder = Path.Combine(Root, "Library", "DreamwalkerImports");
                Directory.CreateDirectory(folder);
                DeleteTemporaryPack();
                temporaryPack = Path.Combine(folder, Guid.NewGuid().ToString("N") + ".zip");
                File.WriteAllBytes(temporaryPack, bytes);
                Review(temporaryPack, rev);
                tabletTarget = new Selection { map=map,item=item,revision=rev,
                    releaseHash=incoming.files.Single(f => f.path==StudioPackagePlan.ContentRoot+"release.json").sha256 };
                if (rows.Any(r => r.Change != StudioFileChange.Unchanged && !r.Chosen))
                {
                    message = "로컬 수정이나 삭제가 있어요. 아래에서 적용할 파일을 고르세요.";
                    return;
                }
                Import();
                message = "태블릿 v"+rev+" 콘텐츠가 준비됐어요.";
            });
        }
        private void DeleteTemporaryPack()
        {
            if (!string.IsNullOrEmpty(temporaryPack) && File.Exists(temporaryPack)) File.Delete(temporaryPack);
            temporaryPack = null;
        }
        private void OnDisable()
        {
            if (pending != null)
            {
                var request = pending; pending = null;
                request.Abort(); request.Dispose();
            }
            DeleteTemporaryPack();
        }
        private static void PlayTarget(Selection target)
        {
            string release = StudioPackagePlan.SafePath(Root, StudioPackagePlan.ContentRoot+"release.json");
            if (StudioPackagePlan.FileHash(release) != target.releaseHash)
                throw new IOException("전달한 버전의 게임 데이터를 적용한 후 플레이하세요.");
            var content = JsonUtility.FromJson<StudioRelease>(File.ReadAllText(release));
            var map = content?.project?.Map(target.map);
            if (content?.rev != target.revision || map == null || (!string.IsNullOrEmpty(target.item) && !Array.Exists(map.objects, o=>o.id==target.item)))
                throw new InvalidDataException("선택한 맵 또는 개체를 현재 콘텐츠에서 찾을 수 없어요.");
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            if (FindFirstObjectByType<BaekseolMotor>() == null)
            {
                if (!File.Exists(Path.Combine(Root, PreviewScene))) CreateCombatDemo.Build();
                else EditorSceneManager.OpenScene(PreviewScene);
            }
            if (FindFirstObjectByType<BaekseolMotor>() == null) throw new InvalidOperationException("전투 플레이어가 있는 씬을 여세요.");
            SessionState.SetString(StudioWorld.TabletPreviewMapKey, target.map);
            SessionState.SetString(StudioWorld.TabletPreviewObjectKey, target.item);
            SessionState.SetString(StudioWorld.TabletPreviewSlotKey, Guid.NewGuid().ToString("N"));
            EditorApplication.EnterPlaymode();
        }

        [InitializeOnLoadMethod]
        private static void WatchPreview()
        {
            EditorApplication.playModeStateChanged += state =>
            {
                if (state != PlayModeStateChange.EnteredEditMode) return;
                string slot = SessionState.GetString(StudioWorld.TabletPreviewSlotKey, "");
                if (!Guid.TryParseExact(slot,"N",out _)) return;
                PlayerPrefs.DeleteKey("dreamwalker-tablet-preview:"+slot);
                SessionState.EraseString(StudioWorld.TabletPreviewSlotKey);
                SessionState.EraseString(StudioWorld.TabletPreviewMapKey);
                SessionState.EraseString(StudioWorld.TabletPreviewObjectKey);
            };
        }
    }
}
#endif

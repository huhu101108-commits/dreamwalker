#if UNITY_EDITOR
using System;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEngine;
using UnityEngine.Networking;

namespace Dreamwalker.EditorTools
{
    // Sends work made in this Unity project to the studio, where an editor reviews it before it reaches the draft.
    public sealed partial class StudioPackageImporter
    {
        private StudioReturnPlan returnPlan;
        private int returnRevision;
        private Vector2 returnScroll;
        private bool returnMetaOpen;

        private static string ReturnLabel(StudioReturnRow row)
        {
            switch (row.Change)
            {
                case StudioReturnChange.New: return "새 파일";
                case StudioReturnChange.Edit: return "수정";
                case StudioReturnChange.Delete: return "Unity에 없음 · 스튜디오에서 삭제";
                default: return row.Kind == "image" ? "이미지" : "소리";
            }
        }
        private void DrawUnityReturn(string token)
        {
            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Unity → 스튜디오", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox("이 프로젝트에서 만들거나 고친 스크립트·씬·프리팹·설정과 고른 이미지·소리를 스튜디오로 보내요. " +
                "태블릿의 게임 소스 탭 «Unity에서 보낸 변경»에서 검토해 적용하고 저장하면 팀 버전에 들어가요.", MessageType.None);
            if (GUILayout.Button("Unity 변경 찾기")) FindUnityChanges(token);
            if (returnPlan == null) return;
            var rows = returnPlan.Rows;
            EditorGUILayout.LabelField("스튜디오 v" + returnRevision + "와 비교 · 보낼 수 있는 변경 " + rows.Count + "개 · 제외 " + returnPlan.Skipped.Count + "개");
            using (new EditorGUILayout.HorizontalScope())
            {
                if (GUILayout.Button("소스 모두 선택"))
                    foreach (var r in rows) r.Chosen = r.Change == StudioReturnChange.New || r.Change == StudioReturnChange.Edit;
                if (GUILayout.Button("이미지·소리 모두 선택"))
                    foreach (var r in rows) if (r.Change == StudioReturnChange.Media) r.Chosen = true;
                if (GUILayout.Button("모두 해제"))
                    foreach (var r in rows) r.Chosen = false;
            }
            returnScroll = EditorGUILayout.BeginScrollView(returnScroll, GUILayout.MaxHeight(280));
            // Unity writes a GUID file beside every file and folder; they travel together so scenes and prefabs keep their scripts.
            var metas = rows.Where(r => StudioChangeReturn.Meta(r.Path)).ToList();
            foreach (var r in rows) if (!StudioChangeReturn.Meta(r.Path)) r.Chosen = EditorGUILayout.ToggleLeft(ReturnLabel(r) + " · " + r.Path, r.Chosen);
            if (metas.Count > 0)
            {
                bool all = metas.All(r => r.Chosen);
                using (new EditorGUI.MixedValueScope(!all && metas.Any(r => r.Chosen)))
                {
                    bool next = EditorGUILayout.ToggleLeft("Unity 연결 정보(.meta) " + metas.Count + "개 · 씬·프리팹이 스크립트와 폴더를 찾는 GUID", all);
                    if (next != all) foreach (var r in metas) r.Chosen = next;
                }
                returnMetaOpen = EditorGUILayout.Foldout(returnMetaOpen, "파일별로 고르기", true);
                if (returnMetaOpen)
                    using (new EditorGUI.IndentLevelScope())
                        foreach (var r in metas) r.Chosen = EditorGUILayout.ToggleLeft(ReturnLabel(r) + " · " + r.Path, r.Chosen);
            }
            foreach (string skipped in returnPlan.Skipped.Take(30)) EditorGUILayout.LabelField("제외 · " + skipped, EditorStyles.miniLabel);
            if (returnPlan.Skipped.Count > 30) EditorGUILayout.LabelField("제외 " + (returnPlan.Skipped.Count - 30) + "개 더", EditorStyles.miniLabel);
            EditorGUILayout.EndScrollView();
            int count = rows.Count(r => r.Chosen);
            using (new EditorGUI.DisabledScope(count == 0))
                if (GUILayout.Button("선택 " + count + "개 스튜디오로 보내기")) SendUnityChanges(token);
        }
        private void FindUnityChanges(string token)
        {
            message = "스튜디오의 현재 소스와 비교하고 있어요…";
            var request = UnityWebRequest.Get(ApiRoot + "source");
            request.SetRequestHeader("Authorization", "Bearer " + token);
            Send(request, reply =>
            {
                var manifest = JsonUtility.FromJson<StudioSourceManifest>(reply.downloadHandler.text);
                if (manifest?.files == null) throw new InvalidDataException("스튜디오 소스 목록을 확인하세요.");
                returnPlan = StudioChangeReturn.Plan(Root, manifest);
                returnRevision = manifest.rev;
                message = returnPlan.Rows.Count == 0 ? "스튜디오와 다른 소스가 없어요." :
                    "스튜디오와 다른 파일 " + returnPlan.Rows.Count + "개를 찾았어요. 보낼 파일을 고르세요.";
            });
        }
        private void SendUnityChanges(string token)
        {
            var set = StudioChangeReturn.Build(Root, returnRevision, returnPlan.Rows.Where(r => r.Chosen));
            var request = new UnityWebRequest(ApiRoot + "changes", "POST")
            {
                uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(JsonUtility.ToJson(set))),
                downloadHandler = new DownloadHandlerBuffer(),
                timeout = 300,
            };
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("Authorization", "Bearer " + token);
            message = "스튜디오로 " + set.files.Length + "개 변경을 보내고 있어요…";
            Send(request, reply =>
            {
                returnPlan = null;
                message = "스튜디오에 " + set.files.Length + "개 변경을 보냈어요. 태블릿의 게임 소스 탭 «Unity에서 보낸 변경»에서 검토하세요.";
            });
        }
    }
}
#endif

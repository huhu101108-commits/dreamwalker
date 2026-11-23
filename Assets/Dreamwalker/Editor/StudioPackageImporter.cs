#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace Dreamwalker.EditorTools
{
    public sealed partial class StudioPackageImporter : EditorWindow
    {
        private List<StudioImportRow> rows;
        private string archivePath, archiveHash, stateHash, message="";
        private StudioPackageIndex before, incoming;
        private Vector2 scroll;
        private static string Root => Path.GetFullPath(Path.Combine(Application.dataPath,".."));

        [MenuItem("Tools/Dreamwalker/가져오기 변경 검토")]
        public static void OpenWindow() { GetWindow<StudioPackageImporter>("드림워커 팩 가져오기"); }

        private static Dictionary<string,ZipArchiveEntry> Entries(ZipArchive zip)
        {
            if(zip.Entries.Count>10002)throw new InvalidDataException("파일이 너무 많아요.");
            var result=new Dictionary<string,ZipArchiveEntry>(StringComparer.Ordinal);
            var used=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach(var e in zip.Entries) {
                if(e.Name.Length==0)continue;
                if(!used.Add(e.FullName))throw new InvalidDataException("중복 경로 "+e.FullName);
                if(e.FullName!=StudioPackagePlan.IndexName && e.FullName!=StudioPackagePlan.StatePath)StudioPackagePlan.CheckPath(e.FullName);
                result.Add(e.FullName,e);
            }
            return result;
        }
        private static StudioPackageIndex Manifest(Dictionary<string,ZipArchiveEntry> entries)
        {
            if(!entries.TryGetValue(StudioPackagePlan.IndexName,out var file)||file.Length>4*1024*1024)
                throw new InvalidDataException("변경 검토용 목록이 없어요. 스튜디오에서 팩을 다시 내보내세요.");
            using(var input=file.Open())
            using(var reader=new StreamReader(input,Encoding.UTF8)) {
                var text=new char[(int)file.Length+1];
                int count=reader.ReadBlock(text,0,text.Length);
                if(count>=text.Length)throw new InvalidDataException("팩 목록 크기를 확인하세요.");
                return JsonUtility.FromJson<StudioPackageIndex>(new string(text,0,count));
            }
        }
        private void Review(string file, int? tabletRevision = null)
        {
            rows=null;message="";archivePath=file;tabletTarget=null;
            using(var stream=File.OpenRead(file)) {
                archiveHash=StudioPackagePlan.Digest(stream);stream.Position=0;
                using(var zip=new ZipArchive(stream,ZipArchiveMode.Read)) {
                    var entries=Entries(zip);incoming=Manifest(entries);
                    if(tabletRevision.HasValue)StudioPackagePlan.CheckTabletContent(incoming, tabletRevision.Value);
                    string state=StudioPackagePlan.SafePath(Root,StudioPackagePlan.StatePath);
                    stateHash=StudioPackagePlan.FileHash(state);
                    before=stateHash==null?new StudioPackageIndex():JsonUtility.FromJson<StudioPackageIndex>(File.ReadAllText(state));
                    var plan=StudioPackagePlan.Review(Root,before,incoming);
                    foreach(var f in incoming.files) {
                        if(!entries.TryGetValue(f.path,out var data)||data.Length!=f.bytes)throw new InvalidDataException("누락된 파일 "+f.path);
                    }
                    rows=plan;
                }
            }
        }
        private void Import()
        {
            using(var stream=File.OpenRead(archivePath)) {
                if(archiveHash!=StudioPackagePlan.Digest(stream))throw new IOException("선택한 ZIP이 바뀌었어요. 다시 검사하세요.");
                stream.Position=0;
                using(var zip=new ZipArchive(stream,ZipArchiveMode.Read)) {
                    var entries=Entries(zip);
                    var next=StudioPackagePlan.NextIndex(before,incoming,rows);
                    AssetDatabase.StartAssetEditing();
                    try {StudioPackagePlan.Apply(Root,rows,p=>entries[p].Open(),JsonUtility.ToJson(next,true),stateHash);}
                    finally {AssetDatabase.StopAssetEditing();AssetDatabase.Refresh();}
                }
            }
            rows=null;message="선택한 파일과 비교 이력을 저장했어요.";
        }
        private static string Label(StudioFileChange change)
        {
            switch(change){
                case StudioFileChange.New:return "새 파일";
                case StudioFileChange.Update:return "원본 갱신";
                case StudioFileChange.Removed:return "새 팩에서 삭제";
                case StudioFileChange.LocalEdit:return "로컬 수정";
                case StudioFileChange.LocalDeletion:return "로컬 삭제";
                case StudioFileChange.UntrackedCollision:return "기존 파일 충돌";
                default:return "동일";
            }
        }
        private void OnGUI()
        {
            DrawTabletTransfer();
            if(GUILayout.Button("스튜디오에서 내보낸 ZIP 열기")) {
                var path=EditorUtility.OpenFilePanel("드림워커 Unity 팩","","zip");
                if(!string.IsNullOrEmpty(path))try {Review(path);}catch(Exception e){message=e.Message;}
            }
            EditorGUILayout.HelpBox("로컬 수정·삭제, 기존 파일과 이름이 겹치는 항목은 직접 선택해야 적용돼요.",MessageType.Info);
            if(!string.IsNullOrEmpty(message))EditorGUILayout.HelpBox(message,MessageType.Info);
            if(rows==null)return;
            EditorGUILayout.LabelField((incoming.kind=="project"?"전체 프로젝트":"콘텐츠 팩")+" · 공유 v"+incoming.revision);
            EditorGUILayout.LabelField("검사한 파일 "+rows.Count+"개 · 동일 "+rows.Count(r=>r.Change==StudioFileChange.Unchanged)+"개");
            scroll=EditorGUILayout.BeginScrollView(scroll);
            foreach(var item in rows.Where(r=>r.Change!=StudioFileChange.Unchanged))
                item.Chosen=EditorGUILayout.ToggleLeft(Label(item.Change)+" · "+item.Path,item.Chosen);
            EditorGUILayout.EndScrollView();
            int count=rows.Count(r=>r.Chosen);
            if(GUILayout.Button("선택 "+count+"개 적용 · 가져오기 이력 저장")&&
                EditorUtility.DisplayDialog("드림워커 가져오기","공유 v"+incoming.revision+"에서 선택한 "+count+"개 파일의 변경 사항을 적용할까요?","적용","취소"))
                try {Import();}catch(Exception e){message=e.Message;}
        }
    }
}
#endif

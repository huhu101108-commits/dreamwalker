using System;
using System.IO;
using System.Text;
using Dreamwalker.Demo;
using UnityEditor;
using UnityEngine;

namespace Dreamwalker.Editor
{
    public static class ReplayStudioRules
    {
        [MenuItem("Tools/Dreamwalker/규칙 입력 기록 재생")]
        public static void Replay()
        {
            string input=EditorUtility.OpenFilePanel("드림워커 규칙 입력 기록", "", "json");
            if(string.IsNullOrEmpty(input))return;
            try{
                if(new FileInfo(input).Length>2_000_000)throw new InvalidDataException("입력 기록 파일의 크기를 확인하세요.");
                var asset=Resources.Load<TextAsset>("DreamwalkerStudio/release");
                if(asset==null)throw new InvalidDataException("이 프로젝트에 같은 공유 버전의 Unity 콘텐츠 팩을 가져오세요.");
                var release=JsonUtility.FromJson<StudioRelease>(asset.text);
                var request=JsonUtility.FromJson<StudioProbeRequest>(File.ReadAllText(input,Encoding.UTF8));
                var reply=StudioProgramInspection.Replay(release,request,"unity-editor");
                string path=EditorUtility.SaveFilePanel("규칙 검수 결과 저장",Path.GetDirectoryName(input),"Dreamwalker-Rule-Result-v"+reply.revision,"json");
                if(string.IsNullOrEmpty(path))return;
                string assetDir=Path.GetFullPath(Application.dataPath)+Path.DirectorySeparatorChar;
                if(Path.GetFullPath(path).StartsWith(assetDir,StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException("검수 결과는 게임 배포물과 분리해 Assets 밖에 저장하세요.");
                File.WriteAllText(path,JsonUtility.ToJson(reply,true),new UTF8Encoding(false));
                EditorUtility.DisplayDialog("규칙 입력 기록 재생","공유 버전 v"+reply.revision+"의 판정 "+reply.outcome.trace.Length+"건을 저장했어요.","확인");
            }catch(Exception error){EditorUtility.DisplayDialog("규칙 검증",error.Message,"확인");}
        }
    }
}

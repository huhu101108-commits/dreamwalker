#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Dreamwalker.EditorTools
{
    /// <summary>
    /// Cloud builds (GitHub Actions through GameCI, Unity Build Automation). The repository keeps no scene and no
    /// project settings, so every build first generates the demo scene and sets what its target needs.
    /// </summary>
    public static class StudioCloudBuild
    {
        public const string WebFolder = "Build/Web";

        // The generated scene is the build's only scene. Unity Build Automation calls this through
        // DreamwalkerCloudBuild.PreExport (Assets/Editor), GameCI through the Build methods.
        public static void Prepare(BuildTarget target)
        {
            if (!File.Exists(CreateCombatDemo.ScenePath)) CreateCombatDemo.Build();
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(CreateCombatDemo.ScenePath, true) };
            if (target == BuildTarget.WebGL)
            {
                // The studio hands the player's files to an isolated frame as plain blobs (Studio/src/unity-play.js):
                // Unity does not compress them (the upload does), the frame has no browser database and no threads.
                PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
                PlayerSettings.WebGL.decompressionFallback = false;
                PlayerSettings.WebGL.dataCaching = false;
                PlayerSettings.WebGL.nameFilesAsHashes = false;
                PlayerSettings.WebGL.threadsSupport = false;
                // The studio shows the player's log, so a C# error names its place instead of stopping the page.
                PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.FullWithStacktrace;
                PlayerSettings.runInBackground = true;
            }
            AssetDatabase.SaveAssets();
        }

        // Execute with -batchmode -buildTarget WebGL -executeMethod Dreamwalker.EditorTools.StudioCloudBuild.BuildWeb.
        // Studio/scripts/unity-cloud-upload.sh sends the result to the studio.
        public static void BuildWeb()
        {
            if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.WebGL, BuildTarget.WebGL))
                throw new InvalidOperationException("Web Build Support is not installed.");
            Prepare(BuildTarget.WebGL);
            Directory.CreateDirectory("Build");
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
                scenes = new[] { CreateCombatDemo.ScenePath }, locationPathName = WebFolder,
                target = BuildTarget.WebGL, options = BuildOptions.None
            });
            if (report.summary.result != BuildResult.Succeeded)
                throw new InvalidOperationException("Web build failed: " + report.summary.result);
            Debug.Log("Dreamwalker web build: " + WebFolder + ", " + report.summary.totalSize + " bytes");
        }
    }
}
#endif

#if UNITY_EDITOR
using UnityEditor;

// Unity Build Automation: enter DreamwalkerCloudBuild.PreExport as the «Pre-Export Method Name» in the build target's
// advanced settings. Before Unity exports the player it generates the scene and applies the target's settings
// (Dreamwalker.EditorTools.StudioCloudBuild). The class has no namespace and sits in Assets/Editor, where Build
// Automation looks for these methods.
public static class DreamwalkerCloudBuild
{
    public static void PreExport() =>
        Dreamwalker.EditorTools.StudioCloudBuild.Prepare(EditorUserBuildSettings.activeBuildTarget);
}
#endif

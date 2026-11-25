#if UNITY_EDITOR
using System.IO;
using Dreamwalker.Combat;
using Dreamwalker.Demo;
using Dreamwalker.Player;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Dreamwalker.EditorTools
{
    /// <summary>
    /// Tools > Dreamwalker > Create Combat Demo Scene
    /// Creates a deterministic, playable placeholder-art test scene.
    /// It never overwrites an existing scene without a prompt.
    /// </summary>
    public static class CreateCombatDemo
    {
        private const string Folder = "Assets/Dreamwalker/Demo/Generated";
        internal const string ScenePath = "Assets/Dreamwalker/Demo/BaekseolCombat.unity";

        [MenuItem("Tools/Dreamwalker/Create Combat Demo Scene")]
        public static void Build()
        {
            if (!Application.isBatchMode && File.Exists(ScenePath) &&
                !EditorUtility.DisplayDialog("Dreamwalker", "Recreate the demo scene? This will overwrite the existing demo scene.", "Recreate", "Cancel"))
                return;

            Directory.CreateDirectory(Folder);
            Sprite rounded = MakeSprite("rounded", true);
            Sprite square = MakeSprite("square", false);

            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            GameObject cam = new GameObject("Main Camera");
            cam.tag = "MainCamera";
            cam.transform.position = new Vector3(0f, .45f, -10f);
            Camera camera = cam.AddComponent<Camera>();
            camera.orthographic = true;
            camera.orthographicSize = 4.75f;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(.095f, .14f, .23f);
            cam.AddComponent<AudioListener>();

            // A few simple silhouettes convey a snowy test environment.
            MakePiece("Far mountain", null, square, new Vector2(-4.1f, -.25f),
                new Vector2(4.8f, 3f), new Color(.17f, .29f, .43f), -15, 22f);
            MakePiece("Far mountain 2", null, square, new Vector2(4.7f, -.38f),
                new Vector2(6f, 3.4f), new Color(.14f, .25f, .39f), -14, -18f);
            MakePiece("Snow platform", null, square, new Vector2(0f, -1.85f),
                new Vector2(26f, .9f), new Color(.57f, .73f, .84f), -5)
                .AddComponent<BoxCollider2D>();

            GameObject player = new GameObject("Baekseol - Player");
            player.transform.position = new Vector3(-3f, -1.4f);
            Rigidbody2D body = player.AddComponent<Rigidbody2D>();
            body.freezeRotation = true;
            body.gravityScale = 2.7f;
            CapsuleCollider2D capsule = player.AddComponent<CapsuleCollider2D>();
            capsule.size = new Vector2(.65f, 1.73f);
            capsule.offset = new Vector2(0f, .87f);

            GameObject root = new GameObject("Visual Root - replace with final art");
            root.transform.SetParent(player.transform, false);
            Transform v = root.transform;
            Color navy = new Color(.11f, .17f, .29f);
            Color blue = new Color(.28f, .39f, .60f);
            Color ice = new Color(.71f, .86f, .94f);
            MakePiece("Left coat tail", v, square, new Vector2(-.15f, .52f),
                new Vector2(.29f, .96f), blue, 9, 6f);
            MakePiece("Right coat tail", v, square, new Vector2(.17f, .52f),
                new Vector2(.29f, .96f), blue, 9, -6f);
            MakePiece("Left boot", v, rounded, new Vector2(-.17f, .16f),
                new Vector2(.24f, .37f), ice, 11);
            MakePiece("Right boot", v, rounded, new Vector2(.17f, .16f),
                new Vector2(.24f, .37f), ice, 11);
            MakePiece("Body", v, rounded, new Vector2(0f, 1.02f),
                new Vector2(.62f, .95f), navy, 12);
            MakePiece("Scarf", v, rounded, new Vector2(.02f, 1.47f),
                new Vector2(.72f, .20f), ice, 14);
            MakePiece("Scarf tail", v, square, new Vector2(-.31f, 1.17f),
                new Vector2(.17f, .58f), ice, 13, -12f);
            MakePiece("Head", v, rounded, new Vector2(0f, 1.77f),
                new Vector2(.49f, .51f), new Color(.92f, .88f, .84f), 16);
            MakePiece("Silver hair", v, rounded, new Vector2(0f, 1.99f),
                new Vector2(.59f, .18f), new Color(.87f, .90f, .96f), 17);
            MakePiece("Blue hair lock", v, rounded, new Vector2(.17f, 1.82f),
                new Vector2(.10f, .33f), new Color(.17f, .42f, .81f), 18);
            MakePiece("Orange badge", v, square, new Vector2(-.20f, 1.20f),
                new Vector2(.10f, .10f), new Color(.94f, .56f, .25f), 16);

            GameObject pivot = new GameObject("Sword Pivot");
            pivot.transform.SetParent(v, false);
            pivot.transform.localPosition = new Vector3(.25f, 1.01f);
            MakePiece("Sword blade (stand-in)", pivot.transform, rounded,
                new Vector2(0f, .75f), new Vector2(.11f, 1.35f),
                new Color(.82f, .96f, 1f), 21);
            MakePiece("Sword guard", pivot.transform, square,
                new Vector2(0f, .12f), new Vector2(.36f, .09f),
                new Color(.72f, .63f, .37f), 23);
            MakePiece("Sword grip", pivot.transform, rounded,
                new Vector2(0f, -.10f), new Vector2(.10f, .32f),
                new Color(.16f, .20f, .29f), 22);
            pivot.transform.localRotation = Quaternion.Euler(0f, 0f, -160f);

            BaekseolMotor motor = player.AddComponent<BaekseolMotor>();
            motor.SetVisualRoot(v);
            GameObject fx = new GameObject("Sword slash VFX");
            fx.transform.SetParent(v, false);
            SwordSlashVfx slashVfx = fx.AddComponent<SwordSlashVfx>();
            BaekseolSlash slash = player.AddComponent<BaekseolSlash>();
            slash.SetVisuals(pivot.transform, slashVfx);

            GameObject dummy = new GameObject("Training dummy - respawns");
            dummy.transform.position = new Vector3(.35f, -1.4f);
            BoxCollider2D dummyCollider = dummy.AddComponent<BoxCollider2D>();
            dummyCollider.size = new Vector2(.72f, 1.7f);
            dummyCollider.offset = new Vector2(0f, .85f);
            MakePiece("Training dummy body", dummy.transform, rounded,
                new Vector2(0f, .84f), new Vector2(.63f, 1.63f),
                new Color(.66f, .39f, .37f), 8);
            MakePiece("Target mark", dummy.transform, rounded,
                new Vector2(0f, 1.01f), new Vector2(.31f, .31f),
                new Color(.97f, .83f, .54f), 9);
            CombatTarget target = dummy.AddComponent<CombatTarget>();
            target.Setup(CombatFaction.Enemy, 54, true);

            GameObject hud = new GameObject("Combat Demo HUD");
            DemoHud display = hud.AddComponent<DemoHud>();
            display.motor = motor;
            display.attack = slash;
            display.trainingDummy = target;

            EditorSceneManager.MarkSceneDirty(SceneManager.GetActiveScene());
            EditorSceneManager.SaveScene(SceneManager.GetActiveScene(), ScenePath);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            if (!Application.isBatchMode) EditorUtility.DisplayDialog("Dreamwalker combat",
                "The demo scene is ready. Press Play. Move A/D, jump Space, dash Shift, attack J or Z.", "OK");
        }

        // Execute with -batchmode -buildTarget Android -executeMethod Dreamwalker.EditorTools.CreateCombatDemo.BuildAndroid.
        public static void BuildAndroid()
        {
            if (!File.Exists(ScenePath)) Build();
            if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.Android, BuildTarget.Android))
                throw new System.InvalidOperationException("Android Build Support is not installed.");
            Directory.CreateDirectory("Build");
            EditorUserBuildSettings.buildAppBundle = false;
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
                scenes = new[] { ScenePath }, locationPathName = "Build/Dreamwalker.apk",
                target = BuildTarget.Android, options = BuildOptions.Development
            });
            if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
                throw new System.InvalidOperationException("Android build failed: " + report.summary.result);
        }

        private static Sprite MakeSprite(string label, bool rounded)
        {
            string path = Folder + "/" + label + ".png";
            if (!File.Exists(path))
            {
                const int s = 64;
                Texture2D tex = new Texture2D(s, s, TextureFormat.RGBA32, false);
                for (int y = 0; y < s; y++)
                for (int x = 0; x < s; x++)
                {
                    float px = (x + .5f) / s * 2f - 1f;
                    float py = (y + .5f) / s * 2f - 1f;
                    float qx = Mathf.Max(Mathf.Abs(px) - .70f, 0f);
                    float qy = Mathf.Max(Mathf.Abs(py) - .70f, 0f);
                    float alpha = rounded ? Mathf.Clamp01((.29f - Mathf.Sqrt(qx*qx + qy*qy)) * s) : 1f;
                    tex.SetPixel(x, y, new Color(1f, 1f, 1f, alpha));
                }
                tex.Apply();
                File.WriteAllBytes(path, tex.EncodeToPNG());
                Object.DestroyImmediate(tex);
            }
            AssetDatabase.ImportAsset(path);
            TextureImporter importer = AssetImporter.GetAtPath(path) as TextureImporter;
            importer.textureType = TextureImporterType.Sprite;
            importer.spritePixelsPerUnit = 64;
            importer.filterMode = FilterMode.Bilinear;
            importer.SaveAndReimport();
            return AssetDatabase.LoadAssetAtPath<Sprite>(path);
        }

        private static GameObject MakePiece(string label, Transform parent, Sprite sprite,
            Vector2 position, Vector2 size, Color color, int order, float angle = 0f)
        {
            GameObject piece = new GameObject(label);
            if (parent != null) piece.transform.SetParent(parent, false);
            piece.transform.localPosition = position;
            piece.transform.localScale = new Vector3(size.x, size.y, 1f);
            piece.transform.localRotation = Quaternion.Euler(0f, 0f, angle);
            SpriteRenderer render = piece.AddComponent<SpriteRenderer>();
            render.sprite = sprite;
            render.color = color;
            render.sortingOrder = order;
            return piece;
        }
    }
}
#endif

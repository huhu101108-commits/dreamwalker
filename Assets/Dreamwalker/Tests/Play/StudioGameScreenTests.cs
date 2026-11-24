using System.Collections;
using System.IO;
using System.Linq;
using Dreamwalker.Demo;
using Dreamwalker.Player;
using Dreamwalker.Combat;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using UnityEngine.UI;

namespace Dreamwalker.Tests
{
    // Plays the studio's default project in a small scene and reads what the uGUI game screens show.
    // The project comes from Studio/scripts/unity-test-fixture.mjs (the same seed the tablet studio starts from).
    public sealed class StudioGameScreenTests
    {
        private GameObject camera, ground, player;

        [SetUp]
        public void Build()
        {
            camera = new GameObject("Main Camera", typeof(Camera));
            camera.tag = "MainCamera";
            camera.transform.position = new Vector3(0, .45f, -10);
            camera.GetComponent<Camera>().orthographic = true;
            ground = new GameObject("Ground", typeof(BoxCollider2D));
            ground.transform.position = new Vector3(0, -1.85f);
            ground.GetComponent<BoxCollider2D>().size = new Vector2(26, .9f);
            player = new GameObject("Player");
            player.transform.position = new Vector3(-3, -1.4f);
            player.AddComponent<Rigidbody2D>().freezeRotation = true;
            var visual = new GameObject("Visual Root").transform;
            visual.SetParent(player.transform, false);
            var pivot = new GameObject("Sword Pivot").transform;
            pivot.SetParent(visual, false);
            var fx = new GameObject("Sword slash VFX").AddComponent<SwordSlashVfx>();
            fx.transform.SetParent(visual, false);
            player.AddComponent<BaekseolMotor>().SetVisualRoot(visual);
            player.AddComponent<BaekseolSlash>().SetVisuals(pivot, fx);
        }
        [TearDown]
        public void Clear()
        {
            foreach (var o in new[] { player, ground, camera }) if (o != null) Object.Destroy(o);
        }

        private static string[] Shown(string canvas)
        {
            var root = GameObject.Find(canvas);
            Assert.IsNotNull(root, canvas + " canvas");
            return root.GetComponentsInChildren<Text>().Where(t => t.isActiveAndEnabled && !string.IsNullOrEmpty(t.text)).Select(t => t.text).ToArray();
        }
        private static IEnumerator Frames(int count) { for (int i = 0; i < count; i++) yield return null; }

        [UnityTest]
        public IEnumerator StartScreensAndHudAreDrawnWithUgui()
        {
            var json = File.ReadAllText(Path.Combine(Application.dataPath, "Dreamwalker/Tests/Play/studio-seed-release.json"));
            var release = JsonUtility.FromJson<StudioRelease>(json);
            // The connection only serves textures and sounds here; disabled, it neither starts bundled content nor shows the studio panel.
            var connection = player.AddComponent<StudioConnection>();
            connection.enabled = false;
            var world = player.AddComponent<StudioWorld>();
            world.Play(release.project, connection);
            yield return Frames(3);
            Assert.IsTrue(world.Running);
            var title = Shown("Dreamwalker Game UI");
            CollectionAssert.Contains(title, "Dreamwalker");
            CollectionAssert.Contains(title, "게임 시작");
            Assert.IsNotNull(GameObject.Find("Dreamwalker Game UI").GetComponent<Canvas>());

            world.Press("beginGame");
            yield return Frames(3);
            CollectionAssert.Contains(Shown("Dreamwalker Game UI"), "이 캐릭터로 시작");

            world.Press("confirmActor");
            // The seed's loading screen lasts 0.8 s (at most 8 s while pictures load) before the field and its HUD.
            float until = Time.realtimeSinceStartup + 12;
            while (world.CurrentLayout?.id != "default-hud" && Time.realtimeSinceStartup < until) yield return null;
            yield return Frames(3);
            Assert.AreEqual("default-hud", world.CurrentLayout.id);
            var hud = Shown("Dreamwalker Game UI");
            CollectionAssert.Contains(hud, "메뉴");
            Assert.IsTrue(hud.Any(t => t.StartsWith("백설", System.StringComparison.Ordinal)), "the HP widget names the character: " + string.Join(" | ", hud));

            world.Press("menu");
            yield return Frames(3);
            CollectionAssert.Contains(Shown("Dreamwalker Game UI"), "계속하기");
            world.Leave();
            yield return Frames(2);
            Assert.IsNull(GameObject.Find("Dreamwalker Game UI"), "leaving the game removes its canvas");
        }

        // The UI design tool's home, settings and standby screens (Studio/scripts/unity-test-fixture.mjs): the start
        // order reaches the home screen, a quiet second opens the standby screen, play goes to the map and the map menu
        // comes back home.
        [UnityTest]
        public IEnumerator HomeStandbyAndSettingsScreensFollowTheStudio()
        {
            var json = File.ReadAllText(Path.Combine(Application.dataPath, "Dreamwalker/Tests/Play/studio-menus-release.json"));
            var release = JsonUtility.FromJson<StudioRelease>(json);
            var connection = player.AddComponent<StudioConnection>();
            connection.enabled = false;
            var world = player.AddComponent<StudioWorld>();
            world.Play(release.project, connection);
            yield return Frames(3);
            world.Press("beginGame");
            yield return Frames(2);
            world.Press("confirmActor");
            yield return Frames(2);
            Assert.AreEqual("home", world.CurrentLayout.id, "a confirmed character goes to the home screen");
            CollectionAssert.Contains(Shown("Dreamwalker Game UI"), "출격");

            float until = Time.realtimeSinceStartup + 6;
            while (world.CurrentLayout?.id != "standby" && Time.realtimeSinceStartup < until) yield return null;
            Assert.AreEqual("standby", world.CurrentLayout.id, "a quiet second opens the standby screen");
            world.Press("back");
            yield return Frames(2);
            Assert.AreEqual("home", world.CurrentLayout.id);
            world.Press("open", "settings");
            yield return Frames(2);
            Assert.AreEqual("settings", world.CurrentLayout.id);
            world.Press("back");
            world.Press("back");
            yield return Frames(2);
            Assert.AreEqual("front-title", world.CurrentLayout.id, "back on the home screen goes to the title screen");
            world.Press("beginGame");
            world.Press("confirmActor");
            world.Press("play");
            until = Time.realtimeSinceStartup + 12;
            while (world.CurrentLayout?.id != "default-hud" && Time.realtimeSinceStartup < until) yield return null;
            Assert.AreEqual("default-hud", world.CurrentLayout.id, "play goes through loading to the map");
            world.Press("menu");
            world.Press("home");
            yield return Frames(2);
            Assert.AreEqual("home", world.CurrentLayout.id, "the map menu comes back home");
            world.Leave();
            yield return Frames(2);
        }
    }
}

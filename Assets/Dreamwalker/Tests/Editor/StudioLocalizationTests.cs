using Dreamwalker.Demo;
using NUnit.Framework;
using UnityEngine;

namespace Dreamwalker.Tests
{
    // Packed languages read through JsonUtility (the "base" field included) and applied to the loaded project.
    public sealed class StudioLocalizationTests
    {
        private const string Release = @"{""rev"":1,""project"":{""title"":""설원"",""startMap"":""m"",
""characters"":[{""id"":""c"",""name"":""백설"",""skills"":[{""name"":""설풍보""}]}],
""scenes"":[{""id"":""m"",""name"":""광산역"",""objects"":[]}],
""stories"":[{""id"":""s"",""name"":""대화"",""nodes"":[{""id"":""a"",""text"":""{언어} 대사"",""choices"":[]}]}],
""layouts"":[{""id"":""menu"",""name"":""메뉴"",""elements"":[{""id"":""level"",""type"":""input"",""text"":""난이도"",
  ""control"":{""mode"":""choice"",""options"":[""쉬움"",""어려움""],""initial"":""쉬움""}}]}],
""locale"":{""base"":""ko"",""baseName"":""한국어"",""keys"":[""character/c/name"",""screen/menu/level/option/1"",""system/button.jump""],
  ""languages"":[{""code"":""en"",""name"":""English"",""values"":[""Baekseol"",""Hard"",""Jump""]}],
  ""system"":[{""key"":""result.clear"",""text"":""탐험 성공""}]}}}";

        [Test]
        public void AppliesAndSwitchesLanguages()
        {
            var project = JsonUtility.FromJson<StudioRelease>(Release).project;
            Assert.AreEqual("ko", project.locale.@base);
            Assert.AreEqual("en", StudioLocalization.Apply(project, "en"));
            Assert.AreEqual("Baekseol", project.characters[0].name);
            Assert.AreEqual("English 대사", project.stories[0].nodes[0].text);
            var spec = project.layouts[0].elements[0].control;
            Assert.AreEqual("어려움", spec.options[1], "the stored value stays the original");
            Assert.AreEqual("Hard", spec.Label("어려움"), "only the label changes");
            Assert.AreEqual("Jump", StudioLocalization.Text("button.jump"));
            Assert.AreEqual("탐험 성공", StudioLocalization.Text("result.clear"));
            Assert.AreEqual(StudioSystemText.Default("button.menu"), StudioLocalization.Text("button.menu"));
            Assert.AreEqual("ko", StudioLocalization.Apply(project, "ko"));
            Assert.AreEqual("백설", project.characters[0].name);
            Assert.AreEqual("한국어 대사", project.stories[0].nodes[0].text);
            Assert.AreEqual("점프", StudioLocalization.Text("button.jump"));
        }

        [Test]
        public void PicksTheDeviceLanguage()
        {
            var codes = new[] { "ko", "en", "zh-Hant" };
            Assert.AreEqual("zh-Hant", StudioLocalization.Pick(codes, new[] { "", "zh-TW" }));
            Assert.AreEqual("en", StudioLocalization.Pick(codes, new[] { "en-GB" }));
            Assert.AreEqual("ko", StudioLocalization.Pick(codes, new[] { "de" }));
        }
    }
}

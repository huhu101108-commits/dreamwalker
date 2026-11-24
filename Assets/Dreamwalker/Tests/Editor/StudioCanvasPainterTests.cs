using System.Linq;
using System.Reflection;
using Dreamwalker.UI;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Dreamwalker.Tests
{
    // The uGUI painter without a play loop: object reuse, draw order, clicks, scroll lists and shape meshes.
    public sealed class StudioCanvasPainterTests
    {
        private StudioCanvasPainter painter;
        private Transform root;
        private static readonly StudioText Ink = new StudioText(20, StudioAlign.Center, Color.white);

        [SetUp]
        public void Open()
        {
            painter = new StudioCanvasPainter("Dreamwalker Test UI", 1);
            root = GameObject.Find("Dreamwalker Test UI").transform;
        }
        [TearDown]
        public void Close() => painter.Dispose();

        private Transform[] Active() => root.Cast<Transform>().Where(t => t.gameObject.activeSelf).ToArray();

        [Test]
        public void DrawingReusesObjectsInDrawOrder()
        {
            void Scene()
            {
                painter.Box(new Rect(10, 20, 30, 40), Color.red, 8);
                painter.Label(new Rect(0, 0, 200, 50), "게임 시작", Ink);
                painter.Box(new Rect(0, 0, 5, 5), Color.blue);
            }
            painter.Frame(Scene);
            var first = Active();
            Assert.AreEqual(3, first.Length);
            Assert.IsNotNull(first[0].GetComponent<StudioShapeGraphic>());
            Assert.AreEqual("게임 시작", first[1].GetComponent<Text>().text);
            Assert.IsNotNull(first[2].GetComponent<StudioShapeGraphic>());
            // Top-left rectangles become anchored centres, y down.
            var box = (RectTransform)first[0];
            Assert.AreEqual(new Vector2(25, -40), box.anchoredPosition);
            Assert.AreEqual(new Vector2(30, 40), box.sizeDelta);

            painter.Frame(Scene);
            CollectionAssert.AreEqual(first.Select(t => t.GetInstanceID()), Active().Select(t => t.GetInstanceID()));

            painter.Frame(() => painter.Box(new Rect(10, 20, 30, 40), Color.red, 8));
            Assert.AreEqual(1, Active().Length, "objects not drawn this frame are hidden");
        }

        [Test]
        public void ButtonsReportOneClickAfterPressAndRelease()
        {
            bool clicked = false;
            var area = new Rect(0, 0, 120, 48);
            painter.Frame(() => clicked = painter.Button("start", area, "게임 시작", Ink, true, StudioSkin.Standard(1)));
            Assert.IsFalse(clicked);
            var button = Active().Single(t => t.GetComponent<StudioPress>() != null).gameObject;
            var data = new PointerEventData(null) { button = PointerEventData.InputButton.Left };
            ExecuteEvents.Execute(button, data, ExecuteEvents.pointerDownHandler);
            ExecuteEvents.Execute(button, data, ExecuteEvents.pointerClickHandler);
            painter.Frame(() => clicked = painter.Button("start", area, "게임 시작", Ink, true, StudioSkin.Standard(1)));
            Assert.IsTrue(clicked);
            painter.Frame(() => clicked = painter.Button("start", area, "게임 시작", Ink, true, StudioSkin.Standard(1)));
            Assert.IsFalse(clicked, "a click is reported once");

            ExecuteEvents.Execute(button, data, ExecuteEvents.pointerDownHandler);
            ExecuteEvents.Execute(button, data, ExecuteEvents.pointerClickHandler);
            painter.Frame(() => clicked = painter.Button("start", area, "게임 시작", Ink, false, StudioSkin.Standard(1)));
            Assert.IsFalse(clicked, "a disabled button ignores clicks");
            Assert.AreEqual("게임 시작", button.GetComponentInChildren<Text>().text);
        }

        [Test]
        public void ScrollListsHoldTheirContentAndResetWhenAsked()
        {
            Vector2 position = Vector2.zero;
            void List(Vector2 at)
            {
                position = painter.BeginScroll("list", new Rect(0, 0, 100, 100), new Rect(0, 0, 100, 400), at);
                for (int i = 0; i < 8; i++) painter.Label(new Rect(0, i * 50, 100, 50), "줄 " + i, Ink);
                painter.EndScroll();
            }
            painter.Frame(() => List(Vector2.zero));
            var scroll = root.GetComponentInChildren<ScrollRect>();
            Assert.AreEqual(new Vector2(100, 400), scroll.content.sizeDelta);
            Assert.AreEqual(8, scroll.content.Cast<Transform>().Count(t => t.gameObject.activeSelf));
            painter.Frame(() => List(new Vector2(0, 250)));
            Assert.AreEqual(250, scroll.content.anchoredPosition.y, .01f);
            Assert.AreEqual(250, position.y, .01f);
            painter.Frame(() => List(new Vector2(0, 900)));
            Assert.AreEqual(300, position.y, .01f, "the position stays inside the list");
            painter.Frame(() => List(Vector2.zero));
            Assert.AreEqual(0, position.y, .01f, "a caller resets the list to the top");
        }

        [Test]
        public void FieldsShowTheValueUntilFocused()
        {
            string value = null;
            painter.Frame(() => value = painter.Field("name", new Rect(0, 0, 200, 40), "백설", 12, Ink, true));
            Assert.AreEqual("백설", value);
            var input = root.GetComponentInChildren<InputField>();
            Assert.AreEqual("백설", input.text);
            Assert.AreEqual(12, input.characterLimit);
            Assert.IsFalse(painter.Focused("name"));
            painter.Frame(() => value = painter.Field("name", new Rect(0, 0, 200, 40), "", 12, Ink, true, true));
            Assert.AreEqual(InputField.ContentType.Password, input.contentType);
        }

        private static int Vertices(StudioShapeGraphic graphic)
        {
            var populate = typeof(StudioShapeGraphic).GetMethod("OnPopulateMesh", BindingFlags.Instance | BindingFlags.NonPublic,
                null, new[] { typeof(VertexHelper) }, null);
            using (var vh = new VertexHelper())
            {
                populate.Invoke(graphic, new object[] { vh });
                return vh.currentVertCount;
            }
        }

        [Test]
        public void ShapesBuildRoundedFillsAndRings()
        {
            painter.Frame(() =>
            {
                painter.Box(new Rect(0, 0, 100, 60), Color.white, 12);
                painter.Box(new Rect(0, 0, 100, 60), Color.white, 12, 3);
                painter.Box(new Rect(0, 0, 100, 60), Color.white);
            });
            var shapes = Active().Select(t => t.GetComponent<StudioShapeGraphic>()).ToArray();
            int steps = StudioUiGeometry.CornerSteps(12);
            Assert.AreEqual(1 + 4 * (steps + 1), Vertices(shapes[0]), "fan from the centre");
            Assert.AreEqual(2 * 4 * (steps + 1), Vertices(shapes[1]), "outer and inner edge");
            Assert.AreEqual(1 + 4, Vertices(shapes[2]), "square corners");
        }

        [Test]
        public void PicturesFitOrCoverLikeTheStudio()
        {
            var wide = new Texture2D(200, 100);
            try
            {
                painter.Frame(() =>
                {
                    painter.Picture(new Rect(0, 0, 100, 100), wide, StudioFit.Fit, Color.white);
                    painter.Picture(new Rect(0, 0, 100, 100), wide, StudioFit.Cover, Color.white);
                });
                var drawn = Active();
                Assert.AreEqual(new Vector2(100, 50), ((RectTransform)drawn[0]).sizeDelta, "fit keeps the aspect inside the box");
                Assert.AreEqual(new Vector2(100, 100), ((RectTransform)drawn[1]).sizeDelta, "cover fills the box");
            }
            finally { Object.DestroyImmediate(wide); }
        }

        [Test]
        public void TextFollowsTheStudioPreviewOnDenseScreens()
        {
            // A 2560-pixel tablet at about 2× density lays the preview out 1280 CSS pixels wide: 16 × 1.4 CSS pixels.
            Assert.AreEqual(45, StudioUiGeometry.TextPixels(16, 2560, 2));
            Assert.AreEqual(16, StudioUiGeometry.TextPixels(16, 800, 1));
            Assert.AreEqual(8, StudioUiGeometry.TextPixels(4, 800, 1), "the 8 CSS pixel floor");
        }
    }
}

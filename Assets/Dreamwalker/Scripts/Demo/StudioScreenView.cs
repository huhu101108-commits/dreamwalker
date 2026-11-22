using System;
using System.Collections.Generic;
using Dreamwalker.Player;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace Dreamwalker.Demo
{
// Both the canvas bounds and draw order are read from the published UI layout.
internal sealed class StudioScreenView
{
    private readonly StudioWorld world;
    private readonly Dictionary<int, GUIStyle> textStyles = new Dictionary<int, GUIStyle>();
    private Font font;
    private bool triedFont;
    private int mouseDirection;
    private float mouseHeldAt = -1;
    private Vector2 dialogueScroll;
    private StudioLine drawnLine;
    internal StudioScreenView(StudioWorld world)
    {
        this.world = world;
    }
    internal void Dispose()
    {
        if (font != null)
            UnityEngine.Object.Destroy(font);
    }
    private StudioLayout Layout => world.Project.Layout(world.Story != null ? world.Map.dialogueId
                                                        : string.IsNullOrEmpty(world.Menu) ? world.Map.hudId
                                                                                           : world.Menu);
    private static Rect Bounds(StudioWidget w) => new Rect(w.x * Screen.width / 100, w.y *Screen.height / 100,
                                                           w.w *Screen.width / 100, w.h *Screen.height / 100);

    private void Touch(Vector2 position, bool began, ref int horizontal)
    {
        position.y = Screen.height - position.y;
        var widgets = Layout.elements;
        for (int i = widgets.Length - 1; i >= 0; i--)
        {
            var w = widgets[i];
            if (!w.visible || w.type != "button" || !Bounds(w).Contains(position))
                continue;
            if (w.action == "left")
                horizontal--;
            else if (w.action == "right")
                horizontal++;
            else if (began)
                world.Press(w.action, w.target);
            return;
        }
    }

    internal void ReadInput(BaekseolMotor motor)
    {
        int horizontal = 0;
#if ENABLE_INPUT_SYSTEM
        var screen = Touchscreen.current;
        if (screen != null)
            foreach (var touch in screen.touches)
                if (touch.press.isPressed)
                    Touch(touch.position.ReadValue(), touch.press.wasPressedThisFrame, ref horizontal);
        var k = Keyboard.current;
        if (k != null)
        {
            if (k.xKey.wasPressedThisFrame)
                world.Press("skill1");
            if (k.cKey.wasPressedThisFrame)
                world.Press("skill2");
            if (k.vKey.wasPressedThisFrame)
                world.Press("skill3");
            if (k.bKey.wasPressedThisFrame)
                world.Press("skill4");
            if (k.mKey.wasPressedThisFrame)
                world.Press(string.IsNullOrEmpty(world.Menu) ? "menu" : "resume");
            if (k.enterKey.wasPressedThisFrame && world.Line != null && world.Line.choices.Length == 0)
                world.Answer();
        }
#else
        for (int i = 0; i < UnityEngine.Input.touchCount; i++)
        {
            var touch = UnityEngine.Input.GetTouch(i);
            if (touch.phase != TouchPhase.Ended && touch.phase != TouchPhase.Canceled)
                Touch(touch.position, touch.phase == TouchPhase.Began, ref horizontal);
        }
        if (UnityEngine.Input.GetKeyDown(KeyCode.X))
            world.Press("skill1");
        if (UnityEngine.Input.GetKeyDown(KeyCode.C))
            world.Press("skill2");
        if (UnityEngine.Input.GetKeyDown(KeyCode.V))
            world.Press("skill3");
        if (UnityEngine.Input.GetKeyDown(KeyCode.B))
            world.Press("skill4");
        if (UnityEngine.Input.GetKeyDown(KeyCode.M))
            world.Press(string.IsNullOrEmpty(world.Menu) ? "menu" : "resume");
        if (UnityEngine.Input.GetKeyDown(KeyCode.Return) && world.Line != null &&
            world.Line.choices.Length == 0)
            world.Answer();
#endif
        if (!Application.isMobilePlatform && Time.unscaledTime - mouseHeldAt < .06f)
            horizontal += mouseDirection;
        motor.SetVirtualHorizontal(world.Paused ? 0 : Mathf.Clamp(horizontal, -1, 1));
    }

    private GUIStyle Style(int size, string align, Color color)
    {
        if (!triedFont)
        {
            triedFont = true;
            font = Font.CreateDynamicFontFromOSFont(new[] { "Noto Sans CJK KR", "Noto Sans KR", "Malgun Gothic",
                                                            "Apple SD Gothic Neo", "sans-serif" },
                                                    18);
        }
        var anchor = align == "left"    ? TextAnchor.MiddleLeft
                     : align == "right" ? TextAnchor.MiddleRight
                                        : TextAnchor.MiddleCenter;
        int key = size * 10 + (int)anchor;
        if (!textStyles.TryGetValue(key, out var style))
        {
            style = new GUIStyle(GUI.skin.label) { wordWrap = true, alignment = anchor, fontSize = size };
            if (font != null)
                style.font = font;
            style.padding = new RectOffset(5, 5, 2, 2);
            textStyles[key] = style;
        }
        style.normal.textColor = color;
        return style;
    }
    private static void Fill(Rect rect, Color color)
    {
        Color old = GUI.color;
        GUI.color = color;
        GUI.DrawTexture(rect, Texture2D.whiteTexture);
        GUI.color = old;
    }
    private string Label(StudioWidget w)
    {
        string value = w.text;
        if (w.type == "hp")
            return (string.IsNullOrEmpty(value) ? world.Actor.name : value) + "   " + world.Health + " / " +
                   world.Actor.health;
        if (w.type == "enemies")
            return (string.IsNullOrEmpty(value) ? "남은 적" : value) + " " + world.Remaining;
        if (!string.IsNullOrEmpty(value))
            return value;
        if (w.type == "character")
            return world.Actor.name;
        if (w.type == "map")
            return world.Map.name;
        if (w.type != "button")
            return "";
        if (w.action.StartsWith("skill", StringComparison.Ordinal) &&
            int.TryParse(w.action.Substring(5), out int slot) && slot >= 1 && slot <= 4)
            return world.Actor.skills[slot - 1].name;
        switch (w.action)
        {
        case "left":
            return "◀";
        case "right":
            return "▶";
        case "jump":
            return "점프";
        case "attack":
            return "베기";
        case "menu":
            return "메뉴";
        case "restart":
            return "다시 시작";
        case "resume":
            return "계속하기";
        case "switch":
            return "캐릭터 교대";
        case "open":
            return "화면 열기";
        case "skip":
            return "건너뛰기";
        case "nextLine":
            return "다음 대사";
        default:
            return "";
        }
    }

    private void DrawLine(Rect rect, GUIStyle style)
    {
        var node = world.Line;
        if (node == null)
            return;
        if (drawnLine != node)
        {
            drawnLine = node;
            dialogueScroll = Vector2.zero;
        }
        var speaker = world.Project.Character(node.speaker);
        if (speaker != null)
        {
            var path = !string.IsNullOrEmpty(speaker.portrait) ? speaker.portrait : speaker.sprite;
            if (string.IsNullOrEmpty(path) && speaker.id == "baekseol")
                path = "builtin-player";
            var texture = world.Connection.Texture(path);
            if (texture != null)
            {
                float width = rect.width * .16f;
                GUI.DrawTexture(new Rect(rect.x, rect.y, width, rect.height), texture, ScaleMode.ScaleToFit);
                rect.x += width;
                rect.width -= width;
            }
        }
        string text = (speaker != null ? speaker.name : "내레이션") + "\n" + node.text;
        float contentWidth = Mathf.Max(16, rect.width - 22),
              textHeight = style.CalcHeight(new GUIContent(text), contentWidth) + 8;
        float buttonHeight = Mathf.Max(34, style.fontSize * 2.2f);
        float contentHeight = textHeight + Mathf.Max(1, node.choices.Length) * (buttonHeight + 4);
        dialogueScroll = GUI.BeginScrollView(rect, dialogueScroll, new Rect(0, 0, contentWidth, contentHeight));
        GUI.Label(new Rect(0, 0, contentWidth, textHeight), text, style);
        int clicked = -2;
        if (node.choices.Length == 0)
        {
            if (GUI.Button(new Rect(0, textHeight, contentWidth, buttonHeight), "다음 →", style))
                clicked = -1;
        }
        else
            for (int i = 0; i < node.choices.Length; i++)
            {
                var r = new Rect(0, textHeight + i * (buttonHeight + 4), contentWidth, buttonHeight);
                Fill(r, new Color(.15f, .25f, .35f));
                if (GUI.Button(r, node.choices[i].label, style))
                    clicked = i;
            }
        GUI.EndScrollView();
        if (clicked != -2)
            world.Answer(clicked);
    }

    internal void Draw()
    {
        GUI.depth = 0;
        if (!string.IsNullOrEmpty(world.Result))
        {
            var panel =
                new Rect(Screen.width * .25f, Screen.height * .32f, Screen.width * .5f, Screen.height * .35f);
            Fill(panel, new Color(.07f, .12f, .2f, .95f));
            GUI.Label(panel, world.Result, Style(24, "center", Color.white));
            if (GUI.Button(new Rect(panel.x, panel.yMax - 48, panel.width, 48), "다시 시작"))
                world.Press("restart");
            return;
        }
        if (!string.IsNullOrEmpty(world.Menu))
            Fill(new Rect(0, 0, Screen.width, Screen.height), new Color(.04f, .08f, .14f, .7f));
        foreach (var w in Layout.elements)
        {
            if (!w.visible)
                continue;
            var r = Bounds(w);
            var background = StudioWorld.Tint(w.background, Color.black);
            background.a = w.opacity / 100;
            Fill(r, background);
            var style =
                Style(Mathf.Clamp(Mathf.RoundToInt(w.fontSize * Mathf.Min(Screen.width / 800f, 1.4f)), 8, 90),
                      w.align, StudioWorld.Tint(w.color, Color.white));
            if (w.type == "dialogue")
            {
                DrawLine(r, style);
                continue;
            }
            if (w.type == "image")
            {
                var texture = world.Connection.Texture(w.image);
                if (texture != null)
                    GUI.DrawTexture(r, texture, ScaleMode.ScaleToFit);
                continue;
            }
            if (w.type == "hp")
                Fill(new Rect(r.x, r.y, r.width * world.Health / world.Actor.health, r.height),
                     new Color(.12f, .5f, .56f));
            if (w.type == "button" && !Application.isMobilePlatform)
            {
                if (w.action == "left" || w.action == "right")
                {
                    if (GUI.RepeatButton(r, Label(w), style))
                    {
                        mouseDirection = w.action == "left" ? -1 : 1;
                        mouseHeldAt = Time.unscaledTime;
                    }
                }
                else if (GUI.Button(r, Label(w), style))
                {
                    world.Press(w.action, w.target);
                    return;
                }
            }
            else if (w.type != "panel")
                GUI.Label(r, Label(w), style);
        }
    }
}
}

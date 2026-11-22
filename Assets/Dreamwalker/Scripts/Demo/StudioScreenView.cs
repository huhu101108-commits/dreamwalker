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
    private float mouseDirection;
    private int stickOwner = -1;
    private bool sawStick;
    private Vector2 stickOffset;
    private StudioWidget heldStick;
    private StudioLayout touchLayout;
    private float mouseHeldAt = -1;
    private Vector2 dialogueScroll;
    private StudioLine drawnLine;
    private readonly Dictionary<string, Vector2> shotScroll = new Dictionary<string, Vector2>();
    private StudioShot ActiveShot => world.HasOverlay ? null : world.Line?.shot;
    private string pressedId;
    private float pressUntil;
#if ENABLE_INPUT_SYSTEM
    private static readonly Key[] SlotKeys = { Key.Digit1, Key.Digit2, Key.Digit3, Key.Digit4,
                                               Key.Digit5, Key.Digit6, Key.Digit7, Key.Digit8,
                                               Key.Digit9, Key.Digit0, Key.Minus,  Key.Equals };
#else
    private static readonly KeyCode[] SlotKeys = { KeyCode.Alpha1, KeyCode.Alpha2, KeyCode.Alpha3,
                                                   KeyCode.Alpha4, KeyCode.Alpha5, KeyCode.Alpha6,
                                                   KeyCode.Alpha7, KeyCode.Alpha8, KeyCode.Alpha9,
                                                   KeyCode.Alpha0, KeyCode.Minus,  KeyCode.Equals };
#endif
    internal StudioScreenView(StudioWorld world)
    {
        this.world = world;
    }
    internal void Dispose()
    {
        foreach (var shape in shapes.Values) shape.Release();
        shapes.Clear();
        if (font != null)
            UnityEngine.Object.Destroy(font);
    }
    private StudioLayout Layout => world.CurrentLayout;
    private static Rect Bounds(StudioWidget w) => new Rect(w.x * Screen.width / 100, w.y *Screen.height / 100,
                                                           w.w *Screen.width / 100, w.h *Screen.height / 100);

    private static Rect Ring(Rect rect)
    {
        float size = Mathf.Min(rect.width, rect.height);
        return new Rect(rect.center.x-size/2, rect.center.y-size/2, size, size);
    }
    private float StickAt(Rect rect, Vector2 pos)
    {
        stickOffset = Vector2.ClampMagnitude((pos - rect.center) / Mathf.Max(1, rect.width * .38f), 1);
        float x = stickOffset.x;
        return Mathf.Abs(x) < .14f ? 0 : Mathf.Sign(x) * (Mathf.Abs(x) - .14f) / .86f;
    }
    private static bool Hit(StudioWidget w, Rect r, Vector2 pos) =>
        r.Contains(pos) && StudioOutline.Contains(w,(pos.x-r.x)/r.width,(pos.y-r.y)/r.height,r.width/r.height);
    private void Touch(int finger, Vector2 position, bool began, ref float horizontal)
    {
        if (ActiveShot != null) return;
        position.y = Screen.height - position.y;
        if (finger == stickOwner && heldStick != null)
        {
            sawStick = true;
            horizontal += StickAt(Ring(Bounds(heldStick)),position);
            return;
        }
        var widgets = Layout.elements;
        for (int i = widgets.Length - 1; i >= 0; i--)
        {
            var w = widgets[i];
            var r = Bounds(w);
            if (!world.Visible(w) || !world.Enabled(w) || !r.Contains(position)) continue;
            if (w.type == "joystick" && began && stickOwner < 0 && !world.Paused)
            {
                stickOwner = finger;
                heldStick = w;
                sawStick = true;
                horizontal += StickAt(Ring(r),position);
                return;
            }
            if (w.type != "button" || !Hit(w,r,position)) continue;
            if (w.action == "left")
                horizontal--;
            else if (w.action == "right")
                horizontal++;
            if (began)
            {
                pressedId = w.id;
                pressUntil = Time.unscaledTime + .18f;
                world.Activate(w, w.action != "left" && w.action != "right");
            }
            return;
        }
    }

    internal void ReadInput(BaekseolMotor motor)
    {
        float horizontal = 0;
        sawStick = false;
        if (touchLayout != Layout || world.Paused) { stickOwner = -1; heldStick = null; stickOffset = Vector2.zero; }
        touchLayout = Layout;
#if ENABLE_INPUT_SYSTEM
        var screen = Touchscreen.current;
        if (screen != null)
            foreach (var touch in screen.touches)
                if (touch.press.isPressed)
                    Touch(touch.touchId.ReadValue(), touch.position.ReadValue(), touch.press.wasPressedThisFrame, ref horizontal);
        var k = Keyboard.current;
        if (k != null)
        {
            for (int i = 0; i < world.Actor.skills.Length && i < SlotKeys.Length; i++)
                if (k[SlotKeys[i]].wasPressedThisFrame)
                    world.Press("skill" + (i + 1));
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
                Touch(touch.fingerId, touch.position, touch.phase == TouchPhase.Began, ref horizontal);
        }
        for (int i = 0; i < world.Actor.skills.Length && i < SlotKeys.Length; i++)
            if (UnityEngine.Input.GetKeyDown(SlotKeys[i]))
                world.Press("skill" + (i + 1));
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
        if (!sawStick && stickOwner >= 0) { stickOwner = -1; heldStick = null; stickOffset = Vector2.zero; }
        if (!Application.isMobilePlatform && Time.unscaledTime - mouseHeldAt < .06f)
            horizontal += mouseDirection;
        motor.SetVirtualHorizontal(world.Paused ? 0 : Mathf.Clamp(horizontal, -1, 1));
    }

    private sealed class ShapeTexture
    {
        public Texture2D mask, artwork, edge, source;
        public Vector2 size;
        public void Release()
        {
            foreach (var t in new[] {mask,artwork,edge}) if (t != null) UnityEngine.Object.Destroy(t);
        }
    }
    private readonly Dictionary<StudioWidget,ShapeTexture> shapes = new Dictionary<StudioWidget,ShapeTexture>();
    private static Texture2D Pixels(int width, int height, Color32[] pixels)
    {
        var t = new Texture2D(width,height,TextureFormat.RGBA32,false);
        t.wrapMode = TextureWrapMode.Clamp; t.SetPixels32(pixels); t.Apply(false,true);
        return t;
    }
    private static Texture2D Readable(Texture2D source)
    {
        if (source == null || source.isReadable) return source;
        var prior = RenderTexture.active;
        float scale = Mathf.Min(1,512f/Mathf.Max(source.width,source.height));
        var rt = RenderTexture.GetTemporary(Mathf.Max(1,Mathf.RoundToInt(source.width*scale)),Mathf.Max(1,Mathf.RoundToInt(source.height*scale)));
        try
        {
            Graphics.Blit(source,rt); RenderTexture.active = rt;
            var copy = new Texture2D(rt.width,rt.height,TextureFormat.RGBA32,false);
            copy.ReadPixels(new Rect(0,0,rt.width,rt.height),0,0); copy.Apply(); return copy;
        }
        finally { RenderTexture.active = prior; RenderTexture.ReleaseTemporary(rt); }
    }
    private ShapeTexture MakeShape(StudioWidget w, Rect r, Texture2D art)
    {
        var result = new ShapeTexture {source=art,size=r.size};
        float scale = Mathf.Min(1,256f/Mathf.Max(r.width,r.height)), aspect = r.width/r.height;
        int width = Mathf.Max(2,Mathf.RoundToInt(r.width*scale)), height = Mathf.Max(2,Mathf.RoundToInt(r.height*scale));
        var mask = new Color32[width*height]; var edge = new Color32[mask.Length];
        var img = art == null ? null : new Color32[mask.Length];
        var readable = Readable(art);
        float artWidth = 1, artHeight = 1, bx = w.borderWidth/r.width, by = w.borderWidth/r.height;
        if (readable != null && w.imageFit != "stretch")
        {
            float ratio = ((float)art.width/art.height)/aspect;
            if ((w.imageFit == "cover") == (ratio > 1)) artWidth = ratio; else artHeight = 1/ratio;
        }
        for (int j=0; j<height; j++) for (int i=0; i<width; i++)
        {
            float x = (i+.5f)/width, y = 1-(j+.5f)/height;
            if (!StudioOutline.Contains(w,x,y,aspect)) continue;
            int at = i+j*width; mask[at] = Color.white;
            if (bx > 0 && (!StudioOutline.Contains(w,x-bx,y,aspect) || !StudioOutline.Contains(w,x+bx,y,aspect)
                || !StudioOutline.Contains(w,x,y-by,aspect) || !StudioOutline.Contains(w,x,y+by,aspect))) edge[at] = Color.white;
            if (readable != null)
            {
                float u = .5f + (x-.5f)/artWidth, v = .5f + (.5f-y)/artHeight;
                if (u >= 0 && u <= 1 && v >= 0 && v <= 1) img[at] = readable.GetPixelBilinear(u,v);
            }
        }
        if (readable != art && readable != null) UnityEngine.Object.Destroy(readable);
        result.mask = Pixels(width,height,mask);
        if (w.borderWidth > 0) result.edge = Pixels(width,height,edge);
        if (img != null) result.artwork = Pixels(width,height,img);
        return result;
    }
    private void DrawShape(StudioWidget w, Rect r, Color color)
    {
        if (Event.current.type != EventType.Repaint) return;
        var art = world.Connection.Texture(w.image);
        if (!shapes.TryGetValue(w,out var shape) || shape.size != r.size || shape.source != art)
        {
            shape?.Release(); shapes[w] = shape = MakeShape(w,r,art);
        }
        var prior = GUI.color;
        GUI.color = color; GUI.DrawTexture(r,shape.mask);
        GUI.color = Color.white; if (shape.artwork != null) GUI.DrawTexture(r,shape.artwork);
        GUI.color = StudioWorld.Tint(w.borderColor,Color.white); if (shape.edge != null) GUI.DrawTexture(r,shape.edge);
        GUI.color = prior;
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
        if (w.type == "loading") return (string.IsNullOrEmpty(value) ? "로딩" : value) + " " + Mathf.RoundToInt(100 * world.LoadingFraction) + "%";
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
            int.TryParse(w.action.Substring(5), out int slot) && slot >= 1 && slot <= world.Actor.skills.Length)
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
        case "previousActor": return "이전 캐릭터";
        case "beginGame": return "게임 시작";
        case "confirmActor": return "선택 확정";
        case "roadmap":
            return "캐릭터 스토리";
        case "newRun":
            return "게임 처음부터";
        case "back":
            return "뒤로";
        case "gotoMap":
            return "맵 이동";
        case "startStory":
            return "대화";
        case "selectActor":
            return "캐릭터 선택";
        case "flagOn":
            return "상태 켜기";
        case "flagOff":
            return "상태 끄기";
        case "signal":
            return "이벤트";
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
        if (node.side != "hidden")
        {
            var path = !string.IsNullOrEmpty(node.portrait) ? node.portrait : !string.IsNullOrEmpty(speaker?.portrait) ? speaker.portrait : speaker?.sprite;
            if (string.IsNullOrEmpty(path) && speaker?.id == "baekseol")
                path = "builtin-player";
            var texture = world.Connection.Texture(path);
            if (texture != null)
            {
                float width = rect.width * .16f;
                GUI.DrawTexture(new Rect(node.side == "right" ? rect.xMax - width : rect.x, rect.y, width, rect.height), texture, ScaleMode.ScaleToFit);
                if (node.side != "right") rect.x += width;
                rect.width -= width;
            }
        }
        string text = (!string.IsNullOrEmpty(node.speakerName) ? node.speakerName : speaker != null ? speaker.name : "내레이션") + "\n" + node.text;
        float contentWidth = Mathf.Max(16, rect.width - 22),
              textHeight = style.CalcHeight(new GUIContent(text), contentWidth) + 8;
        float buttonHeight = Mathf.Max(34, style.fontSize * 2.2f);
        float contentHeight = textHeight + Mathf.Max(1, node.choices.Length) * (buttonHeight + 4);
        dialogueScroll = GUI.BeginScrollView(rect, dialogueScroll, new Rect(0, 0, contentWidth, contentHeight));
        GUI.Label(new Rect(0, 0, contentWidth, textHeight), text, style);
        int clicked = -2;
        if (node.choices.Length == 0)
        {
            if (GUI.Button(new Rect(0, textHeight, contentWidth, buttonHeight), string.IsNullOrEmpty(node.nextLabel) ? "다음 →" : node.nextLabel, style))
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

    private Texture2D ShotImage(StudioShotLayer layer, StudioLine line, StudioCharacter speaker)
    {
        string path = layer.image;
        if (string.IsNullOrEmpty(path) && layer.kind == "portrait")
        {
            path = !string.IsNullOrEmpty(line.portrait) ? line.portrait :
                !string.IsNullOrEmpty(speaker?.portrait) ? speaker.portrait : speaker?.sprite;
            if (string.IsNullOrEmpty(path) && speaker?.id == "baekseol") path = "builtin-player";
        }
        if (string.IsNullOrEmpty(path) && layer.kind == "backdrop")
        {
            path = !string.IsNullOrEmpty(line.backdrop) ? line.backdrop : world.Map.backdrop;
            if (string.IsNullOrEmpty(path) && world.Map.floorMode != "drawn") path = "builtin-stage";
        }
        return world.Connection.Texture(path);
    }
    private int DrawShotChoices(StudioShotLayer layer, StudioLine line, Rect rect, GUIStyle style, Color fill, float radius)
    {
        int count = Mathf.Max(1, line.choices.Length), columns = layer.ChoiceColumns(count);
        float gap = style.fontSize * .35f, rowHeight = Mathf.Max(20, style.fontSize * 1.9f);
        int rows = (count + columns - 1) / columns;
        float height = rows * (rowHeight + gap) - gap;
        float width = Mathf.Max(2, rect.width - (height > rect.height ? 18 : 0));
        float cellWidth = (width - gap * (columns - 1)) / columns;
        shotScroll.TryGetValue(layer.id, out var scroll);
        shotScroll[layer.id] = GUI.BeginScrollView(rect, scroll, new Rect(0, 0, width, height));
        int chosen = -2;
        for (int i = 0; i < count; i++)
        {
            var area = new Rect((i % columns) * (cellWidth + gap), (i / columns) * (rowHeight + gap), cellWidth, rowHeight);
            GUI.DrawTexture(area, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, fill, 0, radius);
            string label = line.choices.Length > 0 ? line.choices[i].label : string.IsNullOrEmpty(line.nextLabel) ? "다음" : line.nextLabel;
            if (GUI.Button(area, label, style)) chosen = line.choices.Length > 0 ? i : -1;
        }
        GUI.EndScrollView();
        return chosen;
    }
    private void DrawShot(StudioShot shot)
    {
        var line = world.Line;
        if (drawnLine != line) { drawnLine = line; shotScroll.Clear(); dialogueScroll = Vector2.zero; }
        var speaker = world.Project.Character(line.speaker);
        int chosen = -2;
        foreach (var p in shot.layers)
        {
            if (!p.visible || p.opacity <= 0) continue;
            var r = new Rect(Screen.width*p.x/100, Screen.height*p.y/100, Screen.width*p.w/100, Screen.height*p.h/100);
            float opacity = p.opacity / 100, radius = Screen.width * p.radius / 800;
            var fill = StudioWorld.Tint(p.fill, Color.black);
            fill.a = p.fillOpacity / 100 * opacity;
            var ink = StudioWorld.Tint(p.color, Color.white);
            ink.a = opacity;
            if (p.kind != "choices" && fill.a > 0)
                GUI.DrawTexture(r, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, fill, 0, radius);
            if (p.kind == "backdrop" || p.kind == "portrait" || p.kind == "art" || p.kind == "panel")
            {
                var tex = ShotImage(p,line,speaker);
                if (tex == null) continue;
                var matrix = GUI.matrix;
                if (p.flip) GUIUtility.ScaleAroundPivot(new Vector2(-1,1),r.center);
                var mode = p.fit == "cover" ? ScaleMode.ScaleAndCrop : p.fit == "stretch" ? ScaleMode.StretchToFill : ScaleMode.ScaleToFit;
                GUI.DrawTexture(r,tex,mode,true,0,new Color(1,1,1,opacity),0,radius);
                GUI.matrix = matrix;
                continue;
            }
            var style = Style(Mathf.Clamp(Mathf.RoundToInt(p.size*Screen.width/800),8,180), p.align, ink);
            if (p.kind == "choices")
            {
                chosen = DrawShotChoices(p,line,r,style,fill,radius);
                continue;
            }
            string text = p.kind == "text" ? line.text : p.kind == "caption" ? p.caption :
                !string.IsNullOrEmpty(line.speakerName) ? line.speakerName : speaker?.name ?? "내레이션";
            var content = new GUIContent(text);
            float height = style.CalcHeight(content, r.width);
            if (height <= r.height) GUI.Label(new Rect(r.x,r.y,r.width,height),content,style);
            else {
                float width = Mathf.Max(8,r.width-18);
                var area = new Rect(0,0,width,style.CalcHeight(content,width));
                shotScroll.TryGetValue(p.id,out var scroll);
                shotScroll[p.id]=GUI.BeginScrollView(r,scroll,area);
                GUI.Label(area,content,style);
                GUI.EndScrollView();
            }
        }
        if (chosen != -2) world.Answer(chosen);
    }

    internal void Draw()
    {
        GUI.depth = 0;
        if (!string.IsNullOrEmpty(world.Result) && !world.HasOverlay)
        {
            var panel =
                new Rect(Screen.width * .25f, Screen.height * .32f, Screen.width * .5f, Screen.height * .35f);
            Fill(panel, new Color(.07f, .12f, .2f, .95f));
            GUI.Label(panel, world.Result, Style(24, "center", Color.white));
            if (GUI.Button(new Rect(panel.x, panel.yMax - 48, panel.width, 48), "다시 시작"))
                world.Press("restart");
            return;
        }
        if (ActiveShot?.layers != null) { DrawShot(ActiveShot); return; }
        var full = new Rect(0, 0, Screen.width, Screen.height);
        var sceneArt = world.HasOverlay ? null : world.Connection.Texture(world.Line?.backdrop);
        if (sceneArt != null) GUI.DrawTexture(full, sceneArt, ScaleMode.ScaleAndCrop);
        Color tint = StudioWorld.Tint(Layout.tint, new Color(.04f, .08f, .14f));
        tint.a = world.Project.schema < 4 && !string.IsNullOrEmpty(world.Menu) ? .7f : Layout.shade / 100;
        if (tint.a > 0)
            Fill(full, tint);
        var skin = world.Connection.Texture(Layout.skin);
        if (skin != null)
            GUI.DrawTexture(full, skin, ScaleMode.ScaleAndCrop);
        foreach (var w in Layout.elements)
        {
            if (!world.Visible(w))
                continue;
            var r = Bounds(w);
            var background = StudioWorld.Tint(w.background, Color.black);
            background.a = w.opacity / 100;
            if (w.type == "joystick")
            {
                var ring = Ring(r);
                GUI.DrawTexture(ring, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, background, 0, ring.width/2);
                var color = StudioWorld.Tint(w.color,Color.white);
                GUI.DrawTexture(ring, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, color, 2, ring.width/2);
                var offset = heldStick == w || (!Application.isMobilePlatform && Time.unscaledTime-mouseHeldAt < .06f) ? stickOffset : Vector2.zero;
                var center = ring.center + offset*ring.width*.32f;
                float radius = ring.width*.19f;
                GUI.DrawTexture(new Rect(center.x-radius,center.y-radius,radius*2,radius*2),Texture2D.whiteTexture,ScaleMode.StretchToFill,true,0,color,0,radius);
                if (!Application.isMobilePlatform && GUI.RepeatButton(r, "", GUIStyle.none))
                { mouseDirection = StickAt(ring, Event.current.mousePosition); mouseHeldAt = Time.unscaledTime; }
                continue;
            }
            if (w.type == "button" && !string.IsNullOrEmpty(w.shape) && w.shape != "rect")
            {
                if (w.id == pressedId && Time.unscaledTime < pressUntil) background = StudioWorld.Tint(w.pressedColor, background);
                DrawShape(w, r, background);
            }
            else if (w.type == "button" && world.Project.schema >= 4)
            {
                float radius = Mathf.Min(r.width, r.height) * w.radius / 100;
                if (w.id == pressedId && Time.unscaledTime < pressUntil)
                    background = StudioWorld.Tint(w.pressedColor, background);
                GUI.DrawTexture(r, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, background, 0,
                                radius);
                var art = world.Connection.Texture(w.image);
                if (art != null)
                    GUI.DrawTexture(r, art,
                                    w.imageFit == "cover"     ? ScaleMode.ScaleAndCrop
                                    : w.imageFit == "stretch" ? ScaleMode.StretchToFill
                                                              : ScaleMode.ScaleToFit);
                if (w.borderWidth > 0)
                    GUI.DrawTexture(r, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0,
                                    StudioWorld.Tint(w.borderColor, Color.white), w.borderWidth, radius);
            }
            else
                Fill(r, background);
            var style =
                Style(Mathf.Clamp(Mathf.RoundToInt(w.fontSize * Mathf.Min(Screen.width / 800f, 1.4f)), 8, 90),
                      w.align, StudioWorld.Tint(w.color, Color.white));
            if (w.type == "inventory" || w.type == "quests")
            {
                world.DrawProgressWidget(w,r,style);
                continue;
            }
            if (w.type == "dialogue")
            {
                DrawLine(r, style);
                continue;
            }
            if (w.type == "image" || w.type == "portrait")
            {
                var actor = world.Actor;
                var path = w.type == "image" ? w.image : !string.IsNullOrEmpty(actor.portrait) ? actor.portrait : actor.sprite;
                if (w.type == "portrait" && string.IsNullOrEmpty(path) && actor.id == "baekseol") path = "builtin-player";
                var texture = world.Connection.Texture(path);
                if (texture == null && w.type == "portrait") GUI.Label(r, actor.name, style);
                if (texture != null)
                    GUI.DrawTexture(r, texture, ScaleMode.ScaleToFit);
                continue;
            }
            if (w.type == "loading") Fill(new Rect(r.x,r.y,r.width*world.LoadingFraction,r.height), new Color(.12f,.5f,.56f));
            if (w.type == "hp")
                Fill(new Rect(r.x, r.y, r.width * world.Health / world.Actor.health, r.height),
                     new Color(.12f, .5f, .56f));
            if (w.type == "button" && !world.Enabled(w))
            {
                Fill(r, new Color(.1f, .12f, .15f, .5f));
                GUI.Label(r, Label(w), style);
                continue;
            }
            if (w.type == "button" && !Application.isMobilePlatform)
            {
                if (w.action == "left" || w.action == "right")
                {
                    if (GUI.RepeatButton(r, Label(w), style))
                    {
                        if (mouseDirection == 0 || Time.unscaledTime - mouseHeldAt >= .06f)
                            world.Activate(w, false);
                        mouseDirection = w.action == "left" ? -1 : 1;
                        mouseHeldAt = Time.unscaledTime;
                    }
                }
                else if (GUI.Button(r, Label(w), style) && Hit(w,r,Event.current.mousePosition))
                {
                    pressedId = w.id;
                    pressUntil = Time.unscaledTime + .18f;
                    world.Activate(w);
                    return;
                }
            }
            else if (w.type != "panel")
                GUI.Label(r, Label(w), style);
        }
    }
}
}

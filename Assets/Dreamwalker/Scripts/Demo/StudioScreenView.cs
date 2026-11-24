using System;
using System.Collections.Generic;
using Dreamwalker.Player;
using Dreamwalker.UI;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace Dreamwalker.Demo
{
// Both the canvas bounds and draw order are read from the published UI layout.
internal sealed partial class StudioScreenView
{
    private readonly StudioWorld world;
    private bool stickAllowed=true;
    private int stickSign;
    private int stickOwner = -1;
    private bool sawStick;
    private Vector2 stickOffset;
    private StudioWidget heldStick;
    private StudioLayout touchLayout;
    private Vector2 dialogueScroll;
    private StudioLine drawnLine;
    private readonly Dictionary<string, Vector2> shotScroll = new Dictionary<string, Vector2>();
    private StudioShot ActiveShot => world.HasOverlay ? null : world.Line?.shot;
    private string pressedId;
    private float pressUntil;
    // Every screen draws through the world's painter: uGUI for players, IMGUI only when the Editor compares the two.
    private StudioPainter ui => world.Painter;

    internal StudioScreenView(StudioWorld world)
    {
        this.world = world;
        Dreamwalker.Input.DreamwalkerInput.MaskKey = MaskGameKey;
    }
    internal void Dispose()
    {
#if ENABLE_INPUT_SYSTEM
        DetachIme();
#endif
        if (Dreamwalker.Input.DreamwalkerInput.MaskKey == MaskGameKey) Dreamwalker.Input.DreamwalkerInput.MaskKey=null;
        foreach (var shape in shapes.Values) shape.Release();
        shapes.Clear();
    }
    private StudioLayout Layout => world.CurrentLayout;
    private static Rect Bounds(StudioWidget w)
    {
        float x=w.x,y=w.y,scale=Mathf.Min(Screen.width/800f,Screen.height/450f);
        if(w.anchor!=null){x=StudioAnchor.Resolve(w.anchor.horizontal,w.anchor.dx,Screen.width,w.w,x,scale);y=StudioAnchor.Resolve(w.anchor.vertical,w.anchor.dy,Screen.height,w.h,y,scale);}
        return new Rect(x*Screen.width/100,y*Screen.height/100,w.w*Screen.width/100,w.h*Screen.height/100);
    }

    private static Rect Ring(Rect rect)
    {
        float size = Mathf.Min(rect.width, rect.height);
        return new Rect(rect.center.x-size/2, rect.center.y-size/2, size, size);
    }
    private float StickAt(StudioWidget widget, Rect rect, Vector2 pos)
    {
        stickOffset = Vector2.ClampMagnitude((pos - rect.center) / Mathf.Max(1, rect.width * .38f), 1);
        float x = stickOffset.x;
        float dead=(widget.stick!=null && widget.stick.thumb>=15 ? widget.stick.dead : 14) / 100f;
        float value=Mathf.Abs(x)<=dead?0:Mathf.Sign(x)*(Mathf.Abs(x)-dead)/(1-dead);
        int sign=Math.Sign(value);
        if(sign!=stickSign){stickSign=sign;stickAllowed=sign==0||world.AllowProgramInput(sign<0?"left":"right");}
        return stickAllowed?value:0;
    }
    private static bool Hit(StudioWidget w, Rect r, Vector2 pos) =>
        r.Contains(pos) && StudioOutline.Contains(w,(pos.x-r.x)/r.width,(pos.y-r.y)/r.height,r.width/r.height);
    // The mouse is finger -2 with its own gesture group, so a desktop click acts like a tap on the same widget.
    private void Touch(int finger, Vector2 position, bool began, ref float horizontal,string group="touch")
    {
        if (ActiveShot != null || openChoices != null) return;
        position.y = Screen.height - position.y;
        liveFingers.Add(finger);
        if(fingerWidgets.TryGetValue(finger,out var captured)){
            string token="touch"+finger;
            if(!world.Enabled(captured)||!world.Visible(captured)||(captured.gesture.cancelOutside&&!Hit(captured,Bounds(captured),position)))gestureClock.End(token,InputMs,true);
            else {
                gestureClock.Tick(token,InputMs);
                if(gestureClock.Active(token)&&allowedMoves.Contains(token))horizontal+=captured.action=="left"?-1:1;
            }
            return;
        }
        if (finger == stickOwner && heldStick != null)
        {
            sawStick = true;
            horizontal += StickAt(heldStick,Ring(Bounds(heldStick)),position);
            return;
        }
        var widgets = Layout.elements;
        for (int i = widgets.Length - 1; i >= 0; i--)
        {
            var w = widgets[i];
            var r = Bounds(w);
            if (!world.Visible(w) || !world.Enabled(w) || !r.Contains(position)) continue;
            // Fields, dialogue and lists answer the press themselves; widgets underneath them do not.
            if (w.type == "input" || w.type == "dialogue" || w.type == "inventory" || w.type == "quests") return;
            if(w.type=="button"&&w.gesture!=null&&Hit(w,r,position)){
                if(began){fingerWidgets[finger]=w;GestureDown("touch"+finger,group,w);if(allowedMoves.Contains("touch"+finger))horizontal+=w.action=="left"?-1:1;}
                return;
            }
            if (w.type == "joystick" && began && stickOwner < 0 && !world.Paused)
            {
                stickOwner = finger;
                heldStick = w;
                sawStick = true;
                horizontal += StickAt(w,Ring(r),position);
                return;
            }
            if (w.type != "button" || !Hit(w,r,position)) continue;
            if(Movement(w)){
                string key="touch"+finger;
                if(began && world.AllowProgramInput(w.action))allowedMoves.Add(key);
                if(!allowedMoves.Contains(key))return;
                horizontal+=w.action=="left"?-1:1;
            }
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
        if(touchLayout!=Layout||!Application.isFocused){gestureClock.Clear();fingerWidgets.Clear();allowedMoves.Clear();}
        touchLayout=Layout;liveFingers.Clear();
        if(!Application.isFocused){motor.SetVirtualHorizontal(0);return;}
#if ENABLE_INPUT_SYSTEM
        var screen = Touchscreen.current;
        if (screen != null)
            foreach (var touch in screen.touches)
                if (touch.press.isPressed)
                    Touch(touch.touchId.ReadValue(), touch.position.ReadValue(), touch.press.wasPressedThisFrame, ref horizontal);
                else if(touch.press.wasReleasedThisFrame)FinishTouch(touch.touchId.ReadValue(),touch.position.ReadValue(),touch.phase.ReadValue()==UnityEngine.InputSystem.TouchPhase.Canceled);
        var mouse=Mouse.current;
        if(!Application.isMobilePlatform&&mouse!=null){if(mouse.leftButton.isPressed)Touch(-2,mouse.position.ReadValue(),mouse.leftButton.wasPressedThisFrame,ref horizontal,"mouse");else if(mouse.leftButton.wasReleasedThisFrame)FinishTouch(-2,mouse.position.ReadValue(),false);}
#else
        for (int i = 0; i < UnityEngine.Input.touchCount; i++)
        {
            var touch = UnityEngine.Input.GetTouch(i);
            if (touch.phase != TouchPhase.Ended && touch.phase != TouchPhase.Canceled)
                Touch(touch.fingerId, touch.position, touch.phase == TouchPhase.Began, ref horizontal);
            else FinishTouch(touch.fingerId,touch.position,touch.phase==TouchPhase.Canceled);
        }
        if(!Application.isMobilePlatform){if(UnityEngine.Input.GetMouseButton(0))Touch(-2,UnityEngine.Input.mousePosition,UnityEngine.Input.GetMouseButtonDown(0),ref horizontal,"mouse");else if(UnityEngine.Input.GetMouseButtonUp(0))FinishTouch(-2,UnityEngine.Input.mousePosition,false);}
#endif
        lostFingers.Clear();foreach(var finger in fingerWidgets.Keys)if(!liveFingers.Contains(finger))lostFingers.Add(finger);
        foreach(int finger in lostFingers)EndFinger(finger,true);
        ReadScreenKeys(ref horizontal);
        if (!sawStick && stickOwner >= 0) { stickOwner = -1; heldStick = null; stickOffset = Vector2.zero;stickSign=0;stickAllowed=true; }
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
        var art = world.Connection.Texture(w.image);
        if (!shapes.TryGetValue(w,out var shape) || shape.size != r.size || shape.source != art)
        {
            shape?.Release(); shapes[w] = shape = MakeShape(w,r,art);
        }
        ui.Picture(r, shape.mask, StudioFit.Stretch, color);
        if (shape.artwork != null) ui.Picture(r, shape.artwork, StudioFit.Stretch, Color.white);
        if (shape.edge != null) ui.Picture(r, shape.edge, StudioFit.Stretch, StudioWorld.Tint(w.borderColor,Color.white));
    }
    // Authored sizes follow the studio preview: CSS pixels scaled with the screen, then device pixels.
    private StudioText Text(float authored, string align, Color color, string family = null, float max = 90) =>
        new StudioText(ui.TextSize(authored, max), StudioText.Align(align), color, StudioText.Family(family));
    private StudioText Fixed(float cssPixels, StudioAlign align, Color color) =>
        new StudioText(Mathf.RoundToInt(ui.Dp(cssPixels)), align, color);
    private int Clamped(float pixels, float min, float max) => Mathf.RoundToInt(Mathf.Clamp(pixels, ui.Dp(min), ui.Dp(max)));
    internal static StudioFit Fit(string authored) => authored == "cover" ? StudioFit.Cover : authored == "stretch" ? StudioFit.Stretch : StudioFit.Fit;
    // Cooldown shade, gauge charge and a ready outline over a skill button.
    private void DrawMeter(StudioWidget w, Rect r)
    {
        if (!world.SkillMeter(w.action, out float wait, out float waitFraction, out float charge, out int cost)) return;
        if (waitFraction > 0)
            ui.Box(new Rect(r.x, r.yMax - r.height * waitFraction, r.width, r.height * waitFraction), new Color(0, 0, 0, .66f));
        if (wait > 0)
        {
            string seconds = wait >= 10 ? Mathf.CeilToInt(wait).ToString(System.Globalization.CultureInfo.InvariantCulture)
                                        : (Mathf.Ceil(wait * 10) / 10).ToString(System.Globalization.CultureInfo.InvariantCulture);
            var badge = Text(w.fontSize * .82f, "center", Color.white, null, 60);
            float size = Mathf.Max(ui.Dp(18), badge.size * 1.9f);
            var spot = new Rect(r.xMax - size - r.width * .05f, r.y + r.height * .06f, size, size * .72f);
            ui.Box(spot, new Color(.04f, .08f, .11f, .87f), spot.height / 2);
            ui.Label(spot, seconds, badge);
            return;
        }
        float bar = Mathf.Max(ui.Dp(3), r.height * .07f);
        ui.Box(new Rect(r.x, r.yMax - bar, r.width * charge, bar), cost > 0 && charge < 1 ? new Color(.55f, .65f, 1f) : new Color(1f, .84f, .42f));
        if (charge >= 1)
            ui.Box(r, new Color(1f, .89f, .54f), Mathf.Min(r.width, r.height) * w.radius / 100, ui.Dp(2));
    }
    // Skill cut-in and shout, drawn over the HUD from the field's cast clock.
    internal void DrawCast()
    {
        if (world.ShoutVisible)
        {
            var at = world.HeroScreen();
            var talk = new StudioText(Clamped(Screen.width * .017f, 11, 22), StudioAlign.Center, new Color(.09f, .13f, .18f));
            string shout = world.ShoutText;
            float width = Mathf.Min(Screen.width * .34f, ui.Width(shout, talk) + ui.Dp(24));
            float height = ui.Height(shout, talk, width - ui.Dp(16)) + ui.Dp(12);
            var bubble = new Rect(at.x - width / 2, at.y - height, width, height);
            ui.Box(bubble, new Color(1, 1, 1, .94f), ui.Dp(12));
            ui.Label(new Rect(bubble.x + ui.Dp(8), bubble.y + ui.Dp(6), bubble.width - ui.Dp(16), bubble.height - ui.Dp(12)), shout, talk);
        }
        var c = world.Cast;
        if (!c.ShowsCutIn || c.skill?.cast == null || !c.skill.cast.cutin) return;
        var cast = c.skill.cast;
        float p = c.Progress, enter = Mathf.Min(1, p / .18f), leave = Mathf.Max(0, (p - .82f) / .18f);
        float ease = 1 - (1 - enter) * (1 - enter), alpha = 1 - leave;
        var band = StudioWorld.Tint(cast.color, new Color(.11f, .23f, .34f));
        band.a = .94f * alpha;
        float bandHeight = Screen.height * .46f * ease;
        // The band is tilted 5° counter-clockwise around the screen centre.
        ui.Box(new Rect(-Screen.width * .06f, Screen.height / 2f - bandHeight / 2, Screen.width * 1.12f, bandHeight), band, 0, 0, -5);
        string reference = !string.IsNullOrEmpty(cast.image) ? cast.image : c.actor?.Face();
        if (string.IsNullOrEmpty(reference) && c.actor?.id == "baekseol") reference = "builtin-player";
        var art = world.Connection.Texture(reference);
        if (art != null)
        {
            float shift = ((1 - ease) * 45 - p * 5 - leave * 14) / 100 * Screen.width * .52f;
            ui.Picture(new Rect(Screen.width * .44f + shift, Screen.height * .02f, Screen.width * .52f, Screen.height * .86f),
                       art, StudioFit.Fit, new Color(1, 1, 1, alpha));
        }
        var title = new StudioText(Clamped(Screen.width * .054f, 18, 72), StudioAlign.Left, new Color(1, 1, 1, alpha));
        ui.Label(new Rect(Screen.width * .06f, Screen.height * .34f, Screen.width * .5f, Screen.height * .16f),
                 string.IsNullOrEmpty(cast.caption) ? c.skill.name : cast.caption, title);
        if (!string.IsNullOrEmpty(cast.line))
            ui.Label(new Rect(Screen.width * .06f, Screen.height * .5f, Screen.width * .5f, Screen.height * .1f), cast.line,
                     new StudioText(Clamped(Screen.width * .022f, 12, 30), StudioAlign.Left, new Color(1, 1, 1, alpha)));
    }
    private string Label(StudioWidget w)
    {
        string value = w.type=="text" || w.type=="button" ? world.FieldText(w.text) : w.text;
        if (w.hotspot) return "";
        string mark=!world.Enabled(w)?w.states?.disabledMark:world.Selected(w)?w.states?.selectedMark:null;
        if(!string.IsNullOrEmpty(mark))value=mark+" "+(string.IsNullOrEmpty(value)?w.action:value);
        if (w.type == "hp")
            return (string.IsNullOrEmpty(value) ? world.Actor.name : value) + "   " + world.Health + " / " +
                   world.Actor.health;
        if (w.type == "loading") return (string.IsNullOrEmpty(value) ? "로딩" : value) + " " + Mathf.RoundToInt(100 * world.LoadingFraction) + "%";
        if (w.type == "enemies")
            return (string.IsNullOrEmpty(value) ? "남은 적" : value) + " " + world.Remaining;
        if (w.type == "energy")
        {
            string title = world.Actor.ProfileText(value);
            return (string.IsNullOrEmpty(title) ? "스킬 게이지" : title) + "   " +
                   (world.Actor.HasEnergy ? world.Energy + " / " + world.Actor.energy.max : "없음");
        }
        if (w.type == "boss")
        {
            world.Boss(out string bossName, out int bossHp, out int bossMax, out _);
            return (!string.IsNullOrEmpty(value) ? value : !string.IsNullOrEmpty(bossName) ? bossName : "보스") + "   " + bossHp + " / " + bossMax;
        }
        if (w.type == "character" && !string.IsNullOrEmpty(value))
            value = world.Actor.ProfileText(value);
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
        case "online":
            return "온라인 친선전";
        default:
            return "";
        }
    }

    private string Key(StudioWidget w, string part) => string.Concat(Layout.id, "/", w.id, "/", part);
    private void DrawLine(StudioWidget w, Rect rect, StudioText style)
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
            float breath = 1;
            var path = !string.IsNullOrEmpty(node.portrait) ? node.portrait : MovingFace(speaker, node.expression, true, out breath);
            if (string.IsNullOrEmpty(path) && speaker?.id == "baekseol")
                path = "builtin-player";
            var texture = world.Connection.Texture(path);
            if (texture != null)
            {
                float width = rect.width * .16f;
                ui.Picture(Breathe(new Rect(node.side == "right" ? rect.xMax - width : rect.x, rect.y, width, rect.height), breath), texture, StudioFit.Fit, Color.white);
                if (node.side != "right") rect.x += width;
                rect.width -= width;
            }
        }
        string text = (!string.IsNullOrEmpty(node.speakerName) ? node.speakerName : speaker != null ? speaker.name : "내레이션") + "\n" + world.StageText;
        float contentWidth = Mathf.Max(ui.Dp(16), rect.width - ui.Dp(22)),
              textHeight = ui.Height(text, style, contentWidth) + ui.Dp(8);
        float itemSize = w.itemSkin != null && w.itemSkin.size >= 8 ? ui.TextSize(w.itemSkin.size) : style.size;
        float buttonHeight = Mathf.Max(ui.Dp(34), itemSize * 2.2f), gap = ui.Dp(4);
        float contentHeight = textHeight + Mathf.Max(1, node.choices.Length) * (buttonHeight + gap);
        dialogueScroll = ui.BeginScroll(Key(w, "line"), rect, new Rect(0, 0, contentWidth, contentHeight), dialogueScroll);
        ui.Label(new Rect(0, 0, contentWidth, textHeight), text, style);
        int clicked = -2;
        if (node.choices.Length == 0)
        {
            if (ItemButton(w, Key(w, "next"), new Rect(0, textHeight, contentWidth, buttonHeight), string.IsNullOrEmpty(node.nextLabel) ? "다음 →" : node.nextLabel, style))
                clicked = -1;
        }
        else
            for (int i = 0; i < node.choices.Length; i++)
            {
                var r = new Rect(0, textHeight + i * (buttonHeight + gap), contentWidth, buttonHeight);
                if (w.itemSkin == null || w.itemSkin.size == 0) ui.Box(r, new Color(.15f, .25f, .35f));
                if (ItemButton(w, Key(w, "choice" + i), r, node.choices[i].label, style, world.StageChoiceAllowed(i))) clicked = i;
            }
        ui.EndScroll();
        if (clicked != -2)
            world.Answer(clicked);
    }

    // A character's face with its portrait motion: the eyes-closed or speaking picture when one applies, and the
    // breathing scale. Only the line's speaker talks, and only while the line's text is still appearing.
    private string MovingFace(StudioCharacter actor, string expression, bool speaking, out float scale)
    {
        scale = 1;
        if (actor == null) return "";
        string image = actor.FaceSet(expression, out string blink, out string talk);
        var line = world.Line;
        bool revealing = speaking && line != null && (world.StageText?.Length ?? 0) < (line.text?.Length ?? 0);
        string pose = StudioPortraitMotion.Pose(actor.faceMotion?.breathe ?? 0, !string.IsNullOrEmpty(blink), !string.IsNullOrEmpty(talk),
            Time.unscaledTimeAsDouble * 1000, revealing, StudioPortraitMotion.Seed(actor.id), out double breath);
        scale = (float)breath;
        return pose == "blink" ? blink : pose == "talk" ? talk : image;
    }
    // Breathing grows and shrinks the picture around its bottom centre.
    private static Rect Breathe(Rect r, float scale) =>
        scale == 1 ? r : new Rect(r.x + r.width * (1 - scale) / 2, r.yMax - r.height * scale, r.width * scale, r.height * scale);
    private Texture2D ShotImage(StudioShotLayer layer, StudioLine line, StudioCharacter speaker, out float scale)
    {
        scale = 1;
        string path = layer.image;
        if (string.IsNullOrEmpty(path) && layer.kind == "portrait")
        {
            path = !string.IsNullOrEmpty(line.portrait) ? line.portrait : MovingFace(speaker, line.expression, true, out scale);
            if (string.IsNullOrEmpty(path) && speaker?.id == "baekseol") path = "builtin-player";
        }
        if (string.IsNullOrEmpty(path) && layer.kind == "art" && !string.IsNullOrEmpty(layer.actor))
        {
            var member = world.Project.Character(layer.actor);
            path = MovingFace(member, layer.expression, layer.actor == line.speaker, out scale);
            if (string.IsNullOrEmpty(path) && member?.id == "baekseol") path = "builtin-player";
        }
        if (string.IsNullOrEmpty(path) && layer.kind == "backdrop")
        {
            path = !string.IsNullOrEmpty(line.backdrop) ? line.backdrop : world.Map.backdrop;
            if (string.IsNullOrEmpty(path) && world.Map.floorMode != "drawn") path = "builtin-stage";
        }
        return world.Connection.Texture(path);
    }
    private int DrawShotChoices(StudioShotLayer layer, StudioLine line, Rect rect, StudioText style, Color fill, float radius)
    {
        int count = Mathf.Max(1, line.choices.Length), columns = layer.ChoiceColumns(count);
        if(layer.manualChoices){
            int answer=-2;
            for(int i=0;i<count;i++){
                var s=layer.Slot(count,i);
                var area=new Rect(rect.x+s.x*rect.width/100,rect.y+s.y*rect.height/100,s.w*rect.width/100,s.h*rect.height/100);
                Color baseColor=StudioWorld.Tint(s.fill,fill);baseColor.a=fill.a;
                var skin=StudioSkin.Of(baseColor,StudioWorld.Tint(s.press,baseColor),Color.clear,0,Mathf.Min(area.width,area.height)*s.radius/100);
                string text=line.choices.Length>0?line.choices[i].label:string.IsNullOrEmpty(line.nextLabel)?"다음":line.nextLabel;
                bool allowed=line.choices.Length==0 || world.StageChoiceAllowed(i);
                var ink=new StudioText(style.size,StudioText.Align(layer.align),StudioWorld.Tint(s.color,Color.white));
                if(ui.Button(string.Concat("shot/",layer.id,"/",i.ToString(System.Globalization.CultureInfo.InvariantCulture)),area,text,ink,allowed,skin))answer=line.choices.Length>0?i:-1;
            }
            return answer;
        }
        float gap = style.size * .35f, rowHeight = Mathf.Max(ui.Dp(20), style.size * 1.9f);
        int rows = (count + columns - 1) / columns;
        float height = rows * (rowHeight + gap) - gap;
        float width = Mathf.Max(2, rect.width - (height > rect.height ? ui.Dp(18) : 0));
        float cellWidth = (width - gap * (columns - 1)) / columns;
        shotScroll.TryGetValue(layer.id, out var scroll);
        shotScroll[layer.id] = ui.BeginScroll("shot/" + layer.id, rect, new Rect(0, 0, width, height), scroll);
        int chosen = -2;
        var cell = StudioSkin.Of(fill, fill, Color.clear, 0, radius);
        for (int i = 0; i < count; i++)
        {
            var area = new Rect((i % columns) * (cellWidth + gap), (i / columns) * (rowHeight + gap), cellWidth, rowHeight);
            string label = line.choices.Length > 0 ? line.choices[i].label : string.IsNullOrEmpty(line.nextLabel) ? "다음" : line.nextLabel;
            bool allowed = line.choices.Length==0 || world.StageChoiceAllowed(i);
            if (ui.Button(string.Concat("shot/", layer.id, "/", i.ToString(System.Globalization.CultureInfo.InvariantCulture)), area, label, style, allowed, cell)) chosen = line.choices.Length > 0 ? i : -1;
        }
        ui.EndScroll();
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
            if (!world.StageLayerVisible(p) || p.opacity <= 0)continue;
            var offset=world.StageLayerOffset(p);
            var r = new Rect(Screen.width*(p.x+offset.x)/100, Screen.height*(p.y+offset.y)/100, Screen.width*p.w/100, Screen.height*p.h/100);
            float opacity = p.opacity / 100, radius = Screen.width * p.radius / 800;
            var fill = StudioWorld.Tint(p.fill, Color.black);
            fill.a = p.fillOpacity / 100 * opacity;
            var ink = StudioWorld.Tint(p.color, Color.white);
            ink.a = opacity;
            if (p.kind != "choices" && fill.a > 0)
                ui.Box(r, fill, radius);
            if (p.kind == "backdrop" || p.kind == "portrait" || p.kind == "art" || p.kind == "panel")
            {
                var tex = ShotImage(p,line,speaker,out float breath);
                if (tex == null) continue;
                // Speaker focus darkens cast members who are not speaking on this line.
                float light = shot.focus && !string.IsNullOrEmpty(p.actor) && !string.IsNullOrEmpty(line.speaker) && p.actor != line.speaker ? .42f : 1;
                ui.Picture(Breathe(r, breath), tex, Fit(p.fit), new Color(light,light,light,opacity), radius, p.flip);
                continue;
            }
            // Shot text keeps scaling with the screen width, as in the studio's line composer.
            var style = new StudioText(Mathf.Clamp(Mathf.RoundToInt(p.size*Screen.width/800),8,180), StudioText.Align(p.align), ink);
            if (p.kind == "choices")
            {
                chosen = DrawShotChoices(p,line,r,style,fill,radius);
                continue;
            }
            string text = p.kind == "text" ? world.StageText : p.kind == "caption" ? p.caption :
                !string.IsNullOrEmpty(line.speakerName) ? line.speakerName : speaker?.name ?? "내레이션";
            float height = ui.Height(text, style, r.width);
            if (height <= r.height) ui.Label(new Rect(r.x,r.y,r.width,height),text,style);
            else {
                float width = Mathf.Max(ui.Dp(8),r.width-ui.Dp(18));
                var area = new Rect(0,0,width,ui.Height(text,style,width));
                shotScroll.TryGetValue(p.id,out var scroll);
                shotScroll[p.id]=ui.BeginScroll("shot/"+p.id,r,area,scroll);
                ui.Label(area,text,style);
                ui.EndScroll();
            }
        }
        if (chosen != -2) world.Answer(chosen);
    }

    internal void Draw()
    {
        PrepareFields();
        if (openChoices != null) { DrawChoices(); return; }
        if (!string.IsNullOrEmpty(world.Result) && !world.HasOverlay)
        {
            var panel =
                new Rect(Screen.width * .25f, Screen.height * .32f, Screen.width * .5f, Screen.height * .35f);
            ui.Box(panel, new Color(.07f, .12f, .2f, .95f));
            ui.Label(panel, world.Result, Fixed(24, StudioAlign.Center, Color.white));
            if (ui.Button("world/result/restart", new Rect(panel.x, panel.yMax - ui.Dp(48), panel.width, ui.Dp(48)), "다시 시작",
                          Fixed(16, StudioAlign.Center, Color.white), true, StudioSkin.Standard(ui.Density)))
                world.Press("restart");
            return;
        }
        if (ActiveShot?.layers != null) { DrawShot(ActiveShot); return; }
        var full = new Rect(0, 0, Screen.width, Screen.height);
        var sceneArt = world.HasOverlay ? null : world.Connection.Texture(world.Line?.backdrop);
        if (sceneArt != null) ui.Picture(full, sceneArt, StudioFit.Cover, Color.white);
        Color tint = StudioWorld.Tint(Layout.tint, new Color(.04f, .08f, .14f));
        tint.a = world.Project.schema < 4 && !string.IsNullOrEmpty(world.Menu) ? .7f : Layout.shade / 100;
        if (tint.a > 0)
            ui.Box(full, tint);
        var skin = world.Connection.Texture(Layout.skin);
        if (skin != null)
            ui.Picture(full, skin, StudioFit.Cover, Color.white);
        foreach (var w in Layout.elements)
        {
            if (!world.Visible(w))
                continue;
            var r = Bounds(w);
            if (w.type == "boss" && !world.Boss(out _, out _, out _, out _))
                continue;
            var background = StudioWorld.Tint(w.background, Color.black);
            background.a = w.opacity / 100;
            if(w.states!=null && !string.IsNullOrEmpty(w.states.disabled)){if(!world.Enabled(w))background=StudioWorld.Tint(w.states.disabled,background);else if(world.Selected(w))background=StudioWorld.Tint(w.states.selected,background);}
            if (w.type == "input" && w.control != null) { DrawField(w,r,background); continue; }
            if (w.type == "joystick")
            {
                var ring = Ring(r);
                ui.Box(ring, background, ring.width/2);
                var color = StudioWorld.Tint(w.stick?.ring ?? w.color,Color.white);
                ui.Box(ring, color, ring.width/2, ui.Dp(2));
                var offset = heldStick == w ? stickOffset : Vector2.zero;
                float thumb=(w.stick!=null && w.stick.thumb>=15 ? w.stick.thumb : 38)/100f;
                var center = ring.center + offset*ring.width*(w.stick == null ? .32f : (1-thumb)*.5f);
                float radius = ring.width*thumb*.5f;
                color=StudioWorld.Tint(w.stick?.knob ?? w.color,Color.white);
                ui.Box(new Rect(center.x-radius,center.y-radius,radius*2,radius*2), color, radius);
                continue;
            }
            if(w.type=="button" && w.hotspot){ /* The authored shape remains the hit region. */ }
            else if (w.type == "button" && !string.IsNullOrEmpty(w.shape) && w.shape != "rect")
            {
                if (w.id == pressedId && Time.unscaledTime < pressUntil) background = StudioWorld.Tint(w.pressedColor, background);
                DrawShape(w, r, background);
            }
            else if (w.type == "button" && world.Project.schema >= 4)
            {
                float radius = Mathf.Min(r.width, r.height) * w.radius / 100;
                if (w.id == pressedId && Time.unscaledTime < pressUntil)
                    background = StudioWorld.Tint(w.pressedColor, background);
                ui.Box(r, background, radius);
                var art = world.Connection.Texture(w.image);
                if (art != null)
                    ui.Picture(r, art, Fit(w.imageFit), Color.white);
                if (w.borderWidth > 0)
                    ui.Box(r, StudioWorld.Tint(w.borderColor, Color.white), radius, ui.Dp(w.borderWidth));
            }
            else
                ui.Box(r, background);
            if (w.type == "button" && w.meter) DrawMeter(w, r);
            var style = Text(w.fontSize, w.align, StudioWorld.Tint(w.color, Color.white), w.fontFamily);
            if (w.type == "inventory" || w.type == "quests")
            {
                world.DrawProgressWidget(w,r,style);
                continue;
            }
            if (w.type == "dialogue")
            {
                DrawLine(w,r, style);
                continue;
            }
            if (w.type == "image" || w.type == "portrait")
            {
                var actor = world.Actor;
                var path = w.type == "image" ? w.image : actor.Face();
                if (w.type == "portrait" && string.IsNullOrEmpty(path) && actor.id == "baekseol") path = "builtin-player";
                var texture = world.Connection.Texture(path);
                if (texture == null && w.type == "portrait") ui.Label(r, actor.name, style);
                if (texture != null)
                    ui.Picture(r, texture, StudioFit.Fit, Color.white);
                continue;
            }
            if (w.type == "loading") ui.Box(new Rect(r.x,r.y,r.width*world.LoadingFraction,r.height), new Color(.12f,.5f,.56f));
            if (w.type == "hp")
                ui.Box(new Rect(r.x, r.y, r.width * world.Health / world.Actor.health, r.height),
                     new Color(.12f, .5f, .56f));
            if (w.type == "energy" && world.Actor.HasEnergy)
                ui.Box(new Rect(r.x, r.y, r.width * Mathf.Clamp01((float)world.Energy / world.Actor.energy.max), r.height),
                     world.Energy >= world.Actor.energy.max ? new Color(.95f, .72f, .26f) : new Color(.3f, .4f, .82f));
            if (w.type == "boss" && world.Boss(out _, out int bossHp, out int bossMax, out int bossPhase))
            {
                ui.Box(new Rect(r.x, r.y, r.width * Mathf.Clamp01((float)bossHp / bossMax), r.height), new Color(.72f, .17f, .27f));
                ui.Box(new Rect(r.x + r.width * Mathf.Clamp(bossPhase, 1, 99) / 100f - 1, r.y, ui.Dp(2), r.height), new Color(1f, .91f, .66f, .85f));
            }
            if (w.type == "button" && !world.Enabled(w) && !w.hotspot && w.states == null)
                ui.Box(r, new Color(.1f, .12f, .15f, .5f));
            // Buttons are pressed through the touch path in ReadInput, for fingers and the mouse alike.
            if (w.type != "panel")
                ui.Label(r, Label(w), style);
        }
    }
}
}

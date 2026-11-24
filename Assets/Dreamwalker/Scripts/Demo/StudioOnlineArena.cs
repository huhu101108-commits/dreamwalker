using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using Dreamwalker.Input;
using Dreamwalker.UI;
using static Dreamwalker.Demo.StudioArenaProtocol;
using UnityEngine;
using UnityEngine.Networking;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace Dreamwalker.Demo
{
    // The native client sends inputs and renders confirmed server snapshots.
    public sealed class StudioOnlineArena : MonoBehaviour
    {
        public static bool Visible { get; private set; }
        private const string Key = StudioWorld.GuestTokenKey;
        private Snapshot room;
        private Wallet wallet;
        private Listing[] listings = Array.Empty<Listing>();
        private Actor[] actors = Array.Empty<Actor>();
        private Command pending;
        private int selected, sequence, edges, axis;
        private string token, joinCode = "", price = "5", message = "";
        private bool working, market, leaving;
        private float previousScale, nextPoll;
        private Vector2 scroll;
        private Texture2D stage, sprite;
        private readonly Rect[] pads = new Rect[5];
        private static readonly string[] PadIds={"left","right","jump","dodge","attack"};
        private static readonly string[] PadLabels={"<",">","Jump","Dodge","Attack"};
        private readonly Dictionary<string,ArenaControl> designs=new Dictionary<string,ArenaControl>();
        private bool customPad;
        private readonly System.Collections.Generic.HashSet<int> held = new System.Collections.Generic.HashSet<int>();

        public void Open()
        {
            if (Visible) return;
            Visible = true; previousScale = Time.timeScale; Time.timeScale = 0;
            ui ??= StudioPainter.Create(this, "Dreamwalker Online UI", 40, Paint);
            token = PlayerPrefs.GetString(Key, "");
            stage = Resources.Load<Texture2D>("DreamwalkerStudio/Images/builtin-stage");
            sprite = Resources.Load<Texture2D>("DreamwalkerStudio/Images/builtin-player");
            Run(Connect());
        }
        private void Close()
        {
            if (!Visible) return;
            StopAllCoroutines(); working = leaving = false; held.Clear(); edges = axis = 0; pending = null;
            Visible = false; Time.timeScale = previousScale;
        }
        private void OnDestroy() { if (Visible) Close(); ui?.Dispose(); ui = null; }
        private void Run(IEnumerator job) { if (!working && Visible) StartCoroutine(Work(job)); }
        private IEnumerator Work(IEnumerator job)
        {
            working = true;
            try { yield return job; } finally { working = false; }
        }
        private IEnumerator Call(string path, Command data, Action<string> accept)
        {
            using (var req = new UnityWebRequest(StudioConnection.Origin + "/api/arena/" + path, data == null ? "GET" : "POST"))
            {
                req.downloadHandler = new DownloadHandlerBuffer(); req.timeout = 10;
                if (data != null) {
                    req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(JsonUtility.ToJson(data)));
                    req.SetRequestHeader("Content-Type","application/json");
                }
                if (!string.IsNullOrEmpty(token)) req.SetRequestHeader("Authorization", "Bearer " + token);
                yield return req.SendWebRequest();
                if (req.result != UnityWebRequest.Result.Success) {
                    message = "Connection: " + req.error;
                    try { var error = JsonUtility.FromJson<Reply>(req.downloadHandler.text); if (!string.IsNullOrEmpty(error?.error)) message = error.error; } catch (ArgumentException) { }
                    nextPoll = Time.realtimeSinceStartup + 1;
                    yield break;
                }
                message = ""; accept(req.downloadHandler.text);
            }
        }
        private IEnumerator Connect()
        {
            bool ready = false;
            yield return Call("status",null,text=>{
                var info = JsonUtility.FromJson<Reply>(text);
                LoadControls(info.controls);
                var choices = info.actors ?? Array.Empty<Actor>();
                actors = new Actor[choices.Length+1]; actors[0]=new Actor { id="",name="Room default" };
                Array.Copy(choices,0,actors,1,choices.Length); selected = 0; ready = info.protocol == 1;
            });
            if (!ready) yield break;
            if (string.IsNullOrEmpty(token)) {
                yield return Call("session",new Command { native=true },text=>{
                    token=JsonUtility.FromJson<Reply>(text).token;
                    if (!string.IsNullOrEmpty(token)) { PlayerPrefs.SetString(Key,token); PlayerPrefs.Save(); }
                });
            }
            if (string.IsNullOrEmpty(token)) yield break;
            yield return Call("me",null,text=>{ var me=JsonUtility.FromJson<Reply>(text); wallet=me.wallet; Adopt(me.room); });
        }
        private void Adopt(Snapshot value)
        {
            if (room?.code != value?.code) { pending=null; sequence=edges=0; held.Clear(); }
            room=value;
            if (room?.players!=null && room.seat>=0 && room.seat<room.players.Length)
                sequence=Math.Max(sequence,room.players[room.seat].seq);
        }
        private IEnumerator RoomAction(string path, Command data)
        {
            yield return Call(path,data,text=>{
                var value=JsonUtility.FromJson<Snapshot>(text); pending=null;
                Adopt(path=="leave" ? null : value);
                if (value.status=="finished") wallet=null;
            });
            if (wallet==null) yield return Call("me",null,text=>wallet=JsonUtility.FromJson<Reply>(text).wallet);
        }
        private IEnumerator Market(string path, Command data)
        {
            yield return Call(path,data,text=>{ var r=JsonUtility.FromJson<Reply>(text);
                wallet=r.wallet; listings=r.listings ?? Array.Empty<Listing>(); market=true; });
        }
        private void Update()
        {
            if (!Visible || room==null) return;
            if (leaving) {
                if (!working) { leaving=false; Run(RoomAction("leave",new Command { code=room.code })); }
                return;
            }
            if (room.status=="finished" || market) return;
            if (room.status=="playing") {
                axis=(int)DreamwalkerInput.Horizontal; held.Clear();
#if ENABLE_INPUT_SYSTEM
                var touches=Touchscreen.current;
                bool touched=false;
                if (touches!=null) foreach (var touch in touches.touches) {
                    if (touch.press.isPressed) { touched=true; Touch(touch.position.ReadValue(),touch.press.wasPressedThisFrame); }
                }
                var mouse=Mouse.current;
                if (!touched && mouse!=null && mouse.leftButton.isPressed)
                    Touch(mouse.position.ReadValue(),mouse.leftButton.wasPressedThisFrame);
#else
                foreach (var touch in UnityEngine.Input.touches)
                    if (touch.phase!=TouchPhase.Ended && touch.phase!=TouchPhase.Canceled)
                        Touch(touch.position,touch.phase==TouchPhase.Began);
                if (UnityEngine.Input.touchCount==0 && UnityEngine.Input.GetMouseButton(0))
                    Touch(UnityEngine.Input.mousePosition,UnityEngine.Input.GetMouseButtonDown(0));
#endif
                if (held.Contains(0) || held.Contains(1)) axis=(held.Contains(1)?1:0)-(held.Contains(0)?1:0);
                if (DreamwalkerInput.AttackPressed()) edges|=1;
                if (DreamwalkerInput.JumpPressed()) edges|=2;
                if (DreamwalkerInput.DashPressed()) edges|=4;
            }
            if (working || Time.realtimeSinceStartup<nextPoll) return;
            bool play=room.status=="playing";
            nextPoll=Time.realtimeSinceStartup+(play ? 0.105f : 0.65f);
            if (play && pending==null) { pending=new Command { code=room.code,seq=++sequence,axis=axis,press=edges }; edges=0; }
            Run(RoomAction(play?"input":"room",play?pending:new Command { code=room.code }));
        }
        private void Touch(Vector2 position,bool began)
        {
            position.y=Screen.height-position.y;
            for (int i=0;i<pads.Length;i++) if (pads[i].Contains(position)) {
                held.Add(i);
                if (began && i>=2) edges|=i==2?2:i==3?4:1;
            }
        }

        private void LoadControls(ArenaControl[] values)
        {
            designs.Clear(); customPad=false;
            if(values==null)return;
            foreach(var value in values) {
                if(value==null || string.IsNullOrEmpty(value.id))continue;
                designs[value.id]=value;
                if(Array.IndexOf(PadIds,value.id)>=0)customPad=true;
            }
        }
        // ---- screen ----
        private StudioPainter ui;
        private Rect area;
        private float flowY;
        private void LateUpdate() => ui?.Frame(Paint);
        // Rows from the top of the panel, in place of the previous IMGUI auto-layout.
        private Rect Row(float height) { var r = new Rect(area.x, flowY, area.width, height); flowY += height + ui.Dp(6); return r; }
        private Rect Slice(Rect row, int index, int count)
        {
            float gap = ui.Dp(6), w = (row.width - gap * (count - 1)) / count;
            return new Rect(row.x + index * (w + gap), row.y, w, row.height);
        }
        private StudioText Plain(StudioAlign align = StudioAlign.Left) => new StudioText(Mathf.RoundToInt(ui.Dp(15)), align, new Color(.9f, .95f, 1f));
        private StudioText Ink(ArenaControl value, StudioAlign align = StudioAlign.Center) =>
            new StudioText(Mathf.RoundToInt(ui.Dp(value.size > 0 ? value.size : 15)), align, StudioWorld.Tint(value.color, Color.white));
        // A creator-designed control keeps its height and width share inside its slot.
        private Rect Shape(ArenaControl value, Rect slot)
        {
            float h = value.height > 0 ? Mathf.Min(slot.height, ui.Dp(value.height)) : slot.height;
            float w = value.span > 0 ? Mathf.Min(slot.width, Mathf.Max(ui.Dp(12), Screen.width * .9f * value.span / 100f)) : slot.width;
            return new Rect(slot.x, slot.y + slot.height - h, w, h);
        }
        private float Height(string id, float fallback) => designs.TryGetValue(id, out var s) && s.height > 0 ? Mathf.Max(fallback, ui.Dp(s.height)) : fallback;
        private void PaintControl(Rect r, ArenaControl value, bool pressed)
        {
            float radius = Mathf.Min(r.width, r.height) * value.radius / 100f;
            ui.Box(r, StudioWorld.Tint(pressed ? value.press : value.fill, Color.gray), radius);
            if (value.width > 0) ui.Box(r, StudioWorld.Tint(value.edge, Color.white), radius, ui.Dp(value.width));
        }
        private bool ArenaButton(string id, string fallback, Rect slot, string suffix = "", string instance = "")
        {
            string key = "arena/" + id + instance;
            if (!designs.TryGetValue(id, out var s))
                return ui.Button(key, slot, fallback + suffix, Plain(StudioAlign.Center), true, StudioSkin.Standard(ui.Density));
            var r = Shape(s, slot);
            float radius = Mathf.Min(r.width, r.height) * s.radius / 100f;
            var skin = StudioSkin.Of(StudioWorld.Tint(s.fill, Color.gray), StudioWorld.Tint(s.press, Color.gray), StudioWorld.Tint(s.edge, Color.white), ui.Dp(s.width), radius);
            return ui.Button(key, r, s.label + suffix, Ink(s), true, skin);
        }
        private string ArenaEntry(string id, string value, int limit, Rect slot)
        {
            string key = "arena/" + id;
            if (!designs.TryGetValue(id, out var s))
            {
                ui.Box(slot, new Color(.1f, .13f, .17f, .95f), ui.Dp(4));
                ui.Box(slot, new Color(.5f, .58f, .66f, .9f), ui.Dp(4), ui.Dp(1));
                return ui.Field(key, slot, value, limit, Plain(), true);
            }
            // The design's label sits above its field.
            float labelHeight = ui.Dp(20);
            ui.Label(new Rect(slot.x, slot.y, slot.width, labelHeight), s.label, Plain());
            var r = Shape(s, new Rect(slot.x, slot.y + labelHeight, slot.width, slot.height - labelHeight));
            PaintControl(r, s, ui.Focused(key));
            string next = ui.Field(key, r, value, limit, Ink(s, StudioAlign.Left), true);
            if (next.Length == 0 && !ui.Focused(key)) ui.Label(r, s.hint, Ink(s, StudioAlign.Left));
            return next;
        }
        private void PaintMatch()
        {
            float w=Screen.width, h=Screen.height;
            var field=new Rect(w*.05f,h*.27f,w*.9f,h*.49f);
            if (stage!=null) ui.Picture(field,stage,StudioFit.Cover,Color.white);
            else { ui.Box(field,new Color(.12f,.16f,.2f,.9f)); ui.Label(field,"Snowfield",Plain(StudioAlign.Center)); }
            if (room.players==null) return;
            foreach(var f in room.players) {
                float x=field.x+field.width*f.x/Math.Max(1,room.width), y=field.yMax-field.height*(.08f+f.y*.0013f);
                Rect figure=new Rect(x-field.height*.13f,y-field.height*.32f,field.height*.26f,field.height*.32f);
                if (sprite!=null) ui.Picture(figure,sprite,StudioFit.Fit,f.dodging ? Color.gray : Color.white);
                else { ui.Box(figure,new Color(.2f,.25f,.31f,.9f)); ui.Label(figure,f.name,Plain(StudioAlign.Center)); }
                ui.Label(new Rect(Mathf.Clamp(x-ui.Dp(45),field.x,field.xMax-ui.Dp(95)),y-field.height*.32f-ui.Dp(22),ui.Dp(140),ui.Dp(25)),
                    f.hp+"/"+f.maxHp+(f.shield>0?" +"+f.shield:"")+(f.attacking?" *":""),Plain());
            }
            var pad=new Rect(field.x,h*.77f,field.width,h*.2f);
            for(int i=0;i<PadIds.Length;i++) {
                designs.TryGetValue(PadIds[i],out var s);
                pads[i]=customPad?new Rect(pad.x+pad.width*(s?.x??i*20+1)/100f,pad.y+pad.height*(s?.y??7)/100f,
                    pad.width*(s?.w??18)/100f,pad.height*(s?.h??86)/100f):new Rect(field.x+i*field.width/5,h*.79f,field.width/5-ui.Dp(3),h*.09f);
                if(s==null) { ui.Box(pads[i],new Color(.2f,.25f,.31f,held.Contains(i)?1:.9f),ui.Dp(6)); ui.Label(pads[i],PadLabels[i],Plain(StudioAlign.Center)); }
                else { PaintControl(pads[i],s,held.Contains(i)); ui.Label(pads[i],s.label,Ink(s)); }
            }
        }
        private void Paint()
        {
            if (!Visible) return;
            ui.Box(new Rect(0,0,Screen.width,Screen.height),new Color(.04f,.06f,.09f,.92f));
            area=new Rect(Screen.width*.05f,ui.Dp(8),Screen.width*.9f,Screen.height-ui.Dp(16));
            flowY=area.y;
            float line=ui.Dp(36);
            var header=Row(Height("home",line));
            ui.Label(new Rect(header.x,header.y,header.width-ui.Dp(140),header.height),"DREAMWALKER / ONLINE",Plain());
            if (ArenaButton("home","Back to Studio",new Rect(header.xMax-ui.Dp(130),header.y,ui.Dp(130),header.height))) Close();
            if (room!=null && !market) {
                ui.Label(Row(ui.Dp(26)),"Room "+room.code+"    P"+(room.seat+1)+"    v"+room.revision+"    "+room.remaining+"s",Plain());
                string state=room.status=="waiting"?"Share the room code":room.status=="finished"?
                    (room.reason=="ko"&&room.winner>=0?(room.winner==room.seat?"Victory":"Defeat"):room.reason):
                    room.countdown>0?"Ready":"Fight";
                ui.Label(Row(ui.Dp(26)),state+"    "+message,Plain());
                if (ArenaButton("leave","Leave room",Row(Height("leave",line)))) leaving=true;
            } else if (market) {
                ui.Label(Row(ui.Dp(26)),"Mine medals    "+(wallet?.medals??0)+"    Credits    "+(wallet?.credits??0),Plain());
                var bar=Row(Mathf.Max(Height("sell",line),designs.ContainsKey("price")?Height("price",line)+ui.Dp(20):line));
                price=ArenaEntry("price",price,4,Slice(bar,0,4));
                if (ArenaButton("sell","List one medal",Slice(bar,1,4)) && int.TryParse(price,out int n))
                    Run(Market("sell",new Command { id=Guid.NewGuid().ToString(),price=n }));
                if (ArenaButton("refresh","Refresh",Slice(bar,2,4))) Run(Market("market",null));
                if (ArenaButton("lobbyView","Lobby",Slice(bar,3,4))) market=false;
                float rowHeight=Mathf.Max(Height("buy",line),Height("cancel",line)), gap=ui.Dp(4);
                var list=new Rect(area.x,flowY,area.width,Mathf.Max(line,area.yMax-flowY-ui.Dp(36)));
                float inner=area.width-ui.Dp(18);
                scroll=ui.BeginScroll("arena/listings",list,new Rect(0,0,inner,listings.Length*(rowHeight+gap)),scroll);
                for (int i=0;i<listings.Length;i++) {
                    var item=listings[i];
                    if (ArenaButton(item.mine?"cancel":"buy",item.mine?"Cancel":"Buy",new Rect(0,i*(rowHeight+gap),inner,rowHeight),"    "+item.price+" credits","/"+item.id))
                        Run(Market(item.mine?"cancel":"buy",new Command { id=item.id }));
                }
                ui.EndScroll();
                flowY=list.yMax+ui.Dp(6);
                ui.Label(Row(ui.Dp(26)),message,Plain());
            } else {
                if (actors.Length>0 && ArenaButton("actor","Character",Row(Height("actor",line)),"   "+actors[selected].name)) selected=(selected+1)%actors.Length;
                string actor=actors.Length>0?actors[selected].id:"";
                if (wallet!=null) {
                    if (ArenaButton("create","Create room",Row(Height("create",line)))) Run(RoomAction("create",new Command { actor=actor }));
                    var bar=Row(Mathf.Max(Height("join",line),designs.ContainsKey("code")?Height("code",line)+ui.Dp(20):line));
                    joinCode=ArenaEntry("code",joinCode,8,Slice(bar,0,2));
                    if (ArenaButton("join","Join room",Slice(bar,1,2))) Run(RoomAction("join",new Command { actor=actor, code=joinCode.Trim().ToUpperInvariant() }));
                    if (ArenaButton("marketView","Medal exchange",Row(Height("marketView",line)))) Run(Market("market",null));
                } else if (ArenaButton("enter","Connect",Row(Height("enter",line)))) Run(Connect());
                ui.Label(Row(ui.Dp(26)),message,Plain());
            }
            if(room!=null && !market)PaintMatch();
        }
    }
}

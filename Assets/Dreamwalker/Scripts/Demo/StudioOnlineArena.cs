using System;
using System.Collections;
using System.Text;
using Dreamwalker.Input;
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
        private const string Key = "dreamwalker-arena-guest-v1";
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
        private Rect[] pads = new Rect[5];
        private readonly System.Collections.Generic.HashSet<int> held = new System.Collections.Generic.HashSet<int>();

        public void Open()
        {
            if (Visible) return;
            Visible = true; previousScale = Time.timeScale; Time.timeScale = 0;
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
        private void OnDestroy() { if (Visible) Close(); }
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
        private void PaintMatch()
        {
            float w=Screen.width, h=Screen.height;
            var field=new Rect(w*.05f,h*.27f,w*.9f,h*.49f);
            if (stage!=null) GUI.DrawTexture(field,stage,ScaleMode.ScaleAndCrop);
            else GUI.Box(field,"Snowfield");
            if (room.players==null) return;
            foreach(var f in room.players) {
                float x=field.x+field.width*f.x/Math.Max(1,room.width), y=field.yMax-field.height*(.08f+f.y*.0013f);
                Rect figure=new Rect(x-field.height*.13f,y-field.height*.32f,field.height*.26f,field.height*.32f);
                if (sprite!=null) {
                    GUI.color=f.dodging ? Color.gray : Color.white;
                    GUI.DrawTexture(figure,sprite,ScaleMode.ScaleToFit); GUI.color=Color.white;
                } else GUI.Box(figure,f.name);
                GUI.Label(new Rect(Mathf.Clamp(x-45,field.x,field.xMax-95),y-field.height*.32f-22,140,25),
                    f.hp+"/"+f.maxHp+(f.shield>0?" +"+f.shield:"")+(f.attacking?" *":""));
            }
            string[] keys={"<",">","Jump","Dodge","Attack"};
            for(int i=0;i<5;i++) {
                pads[i]=new Rect(field.x+i*field.width/5,h*.79f,field.width/5-3,h*.09f);
                GUI.Box(pads[i],keys[i]);
            }
        }
        private void OnGUI()
        {
            if (!Visible) return;
            GUI.depth=-250; GUI.Box(new Rect(0,0,Screen.width,Screen.height),"");
            GUILayout.BeginArea(new Rect(Screen.width*.05f,8,Screen.width*.9f,Screen.height-16));
            GUILayout.BeginHorizontal(); GUILayout.Label("DREAMWALKER / ONLINE");
            if (GUILayout.Button("Back to Studio",GUILayout.Width(130))) Close();
            GUILayout.EndHorizontal();
            if (room!=null && !market) {
                GUILayout.Label("Room "+room.code+"    P"+(room.seat+1)+"    v"+room.revision+"    "+room.remaining+"s");
                string state=room.status=="waiting"?"Share the room code":room.status=="finished"?
                    (room.reason=="ko"&&room.winner>=0?(room.winner==room.seat?"Victory":"Defeat"):room.reason):
                    room.countdown>0?"Ready":"Fight";
                GUILayout.Label(state+"    "+message);
                if (GUILayout.Button("Leave room")) leaving=true;
                PaintMatch();
            } else if (market) {
                GUILayout.Label("Mine medals    "+(wallet?.medals??0)+"    Credits    "+(wallet?.credits??0));
                GUILayout.BeginHorizontal(); price=GUILayout.TextField(price,4);
                if (GUILayout.Button("List one medal") && int.TryParse(price,out int n))
                    Run(Market("sell",new Command { id=Guid.NewGuid().ToString(),price=n }));
                if (GUILayout.Button("Refresh")) Run(Market("market",null));
                if (GUILayout.Button("Lobby")) market=false; GUILayout.EndHorizontal();
                scroll=GUILayout.BeginScrollView(scroll);
                foreach(var item in listings) if (GUILayout.Button((item.mine?"Cancel":"Buy")+"    "+item.price+" credits"))
                    Run(Market(item.mine?"cancel":"buy",new Command { id=item.id }));
                GUILayout.EndScrollView(); GUILayout.Label(message);
            } else {
                if (actors.Length>0 && GUILayout.Button("Character   "+actors[selected].name)) selected=(selected+1)%actors.Length;
                string actor=actors.Length>0?actors[selected].id:"";
                if (wallet!=null) {
                    if (GUILayout.Button("Create room")) Run(RoomAction("create",new Command { actor=actor }));
                    GUILayout.BeginHorizontal(); joinCode=GUILayout.TextField(joinCode,8);
                    if (GUILayout.Button("Join room")) Run(RoomAction("join",new Command { actor=actor, code=joinCode.Trim().ToUpperInvariant() }));
                    GUILayout.EndHorizontal();
                    if (GUILayout.Button("Medal exchange")) Run(Market("market",null));
                } else if (GUILayout.Button("Connect")) Run(Connect());
                GUILayout.Label(message);
            }
            GUILayout.EndArea();
        }
    }
}

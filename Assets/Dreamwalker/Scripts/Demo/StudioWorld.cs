using System;
using System.Collections.Generic;
using Dreamwalker.Combat;
using Dreamwalker.Player;
using UnityEngine;

namespace Dreamwalker.Demo
{
// Materializes a published map beside the existing demo. The original player,
// motor, hit geometry and target component remain the native gameplay entry points.
public sealed partial class StudioWorld : MonoBehaviour
{
    internal const float UnitX = 1f / 3.5f, UnitY = .16f, OriginX = 1000f;
    private class Foe
    {
        public string id, state;
        public int stateTicks;
        public CombatTarget target;
        public StudioEnemy config;
        public int stacks;
        public float frozenUntil, slowUntil;
    }
    private class ImagePart
    {
        public SpriteRenderer renderer;
        public string reference;
        public Vector2 size;
        public bool keepAspect;
        public bool loaded;
    }
    public StudioProject Project { get; private set; }
    public StudioMap Map { get; private set; }
    public StudioCharacter Actor { get; private set; }
    public StudioStory Story { get; private set; }
    public StudioLine Line => Story == null ? null : Story.nodes[lineIndex];
    public string Menu { get; private set; }
    public string Result { get; private set; }
    public int Health { get; private set; }
    public int Remaining { get; private set; }
    private bool hasTimers, deferExit;
    private int dodgeStart=-1,dodgeFacing;
    private StudioScreenFlow flow = new StudioScreenFlow();
    private string front;
    private int frontDepth, loadingAssets;
    private float frontAge;
    internal bool ShowingFront => !string.IsNullOrEmpty(front) && flow.Depth <= frontDepth;
    internal float LoadingFraction => Mathf.Min(Mathf.Clamp01(frontAge / Mathf.Max(.2f, Project.frontScreens?.seconds ?? .8f)),
        loadingAssets == 0 ? 1 : Mathf.Clamp01(1f - (float)Connection.PendingTextures / loadingAssets));
    public bool HasOverlay => ShowingFront || !string.IsNullOrEmpty(flow.Top);
    public StudioLayout CurrentLayout => Project.Layout(ShowingFront ? front : HasOverlay ? flow.Top
                                                        : Story != null ? (string.IsNullOrEmpty(Line.layout) ? Map.dialogueId : Line.layout)
                                                        : string.IsNullOrEmpty(Menu) ? Map.hudId
                                                                                     : Menu);
    public bool Paused => !string.IsNullOrEmpty(front) || Story != null || !string.IsNullOrEmpty(Result) ||
                          (Project.schema < 4 ? !string.IsNullOrEmpty(Menu) : CurrentLayout.pauseGame);
    public bool Running { get; private set; }
    public StudioConnection Connection { get; private set; }

    private BaekseolMotor motor;
    private BaekseolSlash slash;
    private Rigidbody2D body;
    private DemoHud demoHud;
    private Camera view;
    private GameObject sceneRoot;
    private Sprite white;
    private SpriteRenderer sky, bodyImage;
    private readonly Dictionary<Texture2D, Sprite> sprites = new Dictionary<Texture2D, Sprite>();
    private readonly List<Foe> foes = new List<Foe>();
    private readonly List<ImagePart> parts = new List<ImagePart>();
    private readonly HashSet<string> triggers = new HashSet<string>();
    private readonly List<Foe> targets = new List<Foe>();
    private readonly HashSet<Foe> dashed = new HashSet<Foe>();
    private readonly float[] cooldowns = new float[12];
    private SpriteRenderer[] originalArt;
    private bool[] originalArtEnabled;
    private Vector4 originalMovement;
    private int originalDamage;
    private float originalReach;
    private Vector3 returnPos, cameraPos;
    private float cameraSize, previousStep;
    private Color cameraColor;
    private bool hudEnabled, motorEnabled, slashEnabled, wasSimulated;
    private StudioSkill skill;
    private Vector2 cameraOffset;
    private StudioCamera cameraSettings;
    private sealed class Lift
    {
        public Transform surface;
        public StudioObject data;
        public Vector2 origin;
    }
    private readonly List<Lift> lifts = new List<Lift>();
    private readonly Dictionary<Foe,int> slashHits = new Dictionary<Foe,int>();
    private Vector2 skillOrigin;
    private int skillFacing, hitIndex, lineIndex;
    private float clock, started, nextHit, lastDamage;
    private StudioObject pendingExit;
    private StudioScreenView screenView;

    public void Play(StudioProject project, StudioConnection connection)
    {
        if (!Running)
        {
            motor = GetComponent<BaekseolMotor>();
            slash = GetComponent<BaekseolSlash>();
            body = GetComponent<Rigidbody2D>();
            view = Camera.main;
            if (motor == null || slash == null || body == null || view == null)
                return;
            Connection = connection;
            originalMovement = motor.MovementTuning;
            originalDamage = slash.Damage;
            originalReach = slash.Reach;
            demoHud = FindFirstObjectByType<DemoHud>();
            hudEnabled = demoHud != null && demoHud.enabled;
            if (demoHud != null)
                demoHud.enabled = false;
            motorEnabled = motor.enabled;
            slashEnabled = slash.enabled;
            wasSimulated = body.simulated;
            returnPos = transform.position;
            cameraPos = view.transform.position;
            cameraSize = view.orthographicSize;
            previousStep = Time.fixedDeltaTime;
            Time.fixedDeltaTime = 1f / 60f;
            cameraColor = view.backgroundColor;
            originalArt = GetComponentsInChildren<SpriteRenderer>(true);
            originalArtEnabled = Array.ConvertAll(originalArt, renderer => renderer.enabled);
            foreach (var renderer in originalArt)
                renderer.enabled = false;
            white = MakeSprite(Texture2D.whiteTexture);
            slash.TargetHit += OnBasicHit;
            screenView = new StudioScreenView(this);
            Running = true;
        }
        Project = project;
        flow = new StudioScreenFlow();
        hasTimers = Array.Exists(project.layouts,
                                 l => l.rules != null && Array.Exists(l.rules, r => r.@event == "elapsed"));
        ResetProgress();
        if (!RestoreProgress()) { Enter(project.Map(project.startMap)); Fire("start"); }
        StartPresentation();
    }
    private void StartPresentation()
    {
        var f = Project.frontScreens;
        if(!string.IsNullOrEmpty(f?.entry)){
            if(f.entry=="$field")return;
            if(f.entry==f.title||f.entry==f.roster||f.entry==f.loading)Present(f.entry);
            else {flow.Open(f.entry);SyncControls();}return;
        }
        if (f != null) Present(!string.IsNullOrEmpty(f.title) ? f.title : !string.IsNullOrEmpty(f.roster) ? f.roster : f.loading);
    }
    private void Present(string id)
    {
        if (!string.IsNullOrEmpty(front)) while (flow.Depth > frontDepth) flow.Back();
        front = !string.IsNullOrEmpty(id) && Project.Layout(id) != null ? id : null;
        frontDepth = flow.Depth;
        frontAge = 0;
        if (front != null && front == Project.frontScreens?.loading)
        {
            foreach (var part in parts) Connection.Texture(part.reference);
            foreach (var screen in new[] { Map.hudId, Map.menuId, Map.dialogueId })
            {
                var layout = Project.Layout(screen);
                Connection.Texture(layout.skin);
                foreach (var w in layout.elements) Connection.Texture(w.image);
            }
            loadingAssets = Connection.PendingTextures;
        }
        SyncControls();
    }

    private static Sprite MakeSprite(Texture2D texture) =>
        Sprite.Create(texture, new Rect(0, 0, texture.width, texture.height), new Vector2(.5f, .5f), 100, 0,
                      SpriteMeshType.FullRect);
    private static Vector2 Point(StudioObject o) => new Vector2(OriginX + o.x * UnitX, o.y *UnitY);
    internal static Color Tint(string hex, Color fallback) =>
        !string.IsNullOrEmpty(hex) && ColorUtility.TryParseHtmlString(hex, out var color) ? color : fallback;

    private void ClearMap()
    {
        if (sceneRoot != null)
        {
            sceneRoot.SetActive(false);
            Destroy(sceneRoot);
        }
        if (bodyImage != null)
        {
            bodyImage.gameObject.SetActive(false);
            Destroy(bodyImage.gameObject);
        }
        foes.Clear();
        lifts.Clear();
        slashHits.Clear();
        targets.Clear();
        dashed.Clear();
        parts.Clear();
        triggers.Clear();
        skill = null;
        Story = null;
        pendingExit = null;
    }

    private void Enter(StudioMap map, bool preserveHealth = false, bool restoring = false)
    {
        front = null;
        if (preserveHealth) RememberMap();
        ClearMap();
        flow.EnterMap();
        eventMachine?.Enter();
        deferExit = false;
        Map = map;
        sceneAge=restoring?float.PositiveInfinity:0;
        sceneRoot = new GameObject("Studio map - " + map.name);
        clock = 0;
        lastDamage = float.NegativeInfinity;
        Menu = "";
        Result = "";
        Remaining = 0;
        Array.Clear(cooldowns, 0, cooldowns.Length);
        var spawn = Array.Find(map.objects, o => o.type == "spawn");
        body.position = Point(spawn);
        transform.position = Point(spawn);
        if (body.simulated)
            body.linearVelocity = Vector2.zero;
        sky = Piece("Backdrop", Vector2.zero, new Vector2(100 * UnitX, 20), -25, Color.white,
                    string.IsNullOrEmpty(map.backdrop) && map.floorMode != "drawn" ? "builtin-stage" : map.backdrop, false);
        sky.color = map.theme == "night"  ? new Color(.37f, .44f, .62f)
                    : map.theme == "dusk" ? new Color(.99f, .76f, .68f)
                                          : Color.white;
        sky.color = Tint(map.sky, sky.color);
        if (map.floorMode != "drawn") Solid("Ground", new Vector2(OriginX + map.width * UnitX / 2, -2), new Vector2(map.width * UnitX + 1, 4),
              false);
        foreach (var o in map.objects)
        {
            var pos = Point(o);
            if (o.tileSize > 0 && (o.type == "platform" || o.type == "prop"))
            {
                PaintTileRow(o, pos);
                continue;
            }
            switch (o.type)
            {
            case "enemy":
                AddEnemy(pos, o);
                break;
            case "platform":
                var surface = Solid("Platform", pos - Vector2.up * .1f, new Vector2(o.width * UnitX, .2f), true);
                var groundArt = surface.GetComponent<SpriteRenderer>();
                groundArt.color = Tint(o.tint, groundArt.color);
                if (o.motion != null) lifts.Add(new Lift { surface = surface, data = o, origin = surface.position });
                break;
            case "exit":
                Piece("Exit", pos + Vector2.up * .65f, new Vector2(.3f, 1.3f), 1, new Color(.44f, .92f, .84f));
                break;
            case "trigger":
                if (!string.IsNullOrEmpty(o.storyId) || !string.IsNullOrEmpty(o.eventKey))
                    Piece("Dialogue point", pos + Vector2.up * .5f, new Vector2(.4f, 1), 0,
                          new Color(.99f, .81f, .45f));
                break;
            case "prop":
                Piece(o.label, pos + Vector2.up * o.height * UnitY * .5f,
                      new Vector2(o.width * UnitX, o.height * UnitY), -3,
                      string.IsNullOrEmpty(o.image) ? new Color(.35f, .48f, .57f) : Color.white, o.image, true);
                break;
            }
        }
        cameraSettings = map.camera ?? new StudioCamera();
        cameraOffset=CameraClamp(new Vector2(spawn.x-46/CameraZoom,spawn.y-36/CameraZoom));
        SetCharacter(Project.Character(map.characterId), preserveHealth);
        ApplyMapMemory();
        if (!restoring) { OpenStory(map.entryStory); Fire("enter"); }
        if (preserveHealth && !restoring && !string.IsNullOrEmpty(Project.frontScreens?.loading)) Present(Project.frontScreens.loading);
        SyncControls();
        UpdateCamera();
    }

    private void PaintTileRow(StudioObject tile, Vector2 origin)
    {
        bool solid = tile.type == "platform";
        var row = new GameObject(solid ? "Collision tiles" : "Scenery tiles").transform;
        row.SetParent(sceneRoot.transform, false);
        row.position = origin;
        if (solid)
        {
            var collider = row.gameObject.AddComponent<BoxCollider2D>();
            collider.size = new Vector2(tile.width * UnitX, .2f);
            collider.offset = Vector2.down * .1f;
            var effector = row.gameObject.AddComponent<PlatformEffector2D>();
            effector.useOneWay = true;
            collider.usedByEffector = true;
            if (tile.motion != null) lifts.Add(new Lift { surface = row, data = tile, origin = origin });
        }
        float height = (solid ? tile.tileSize : tile.height) * UnitY;
        for (float left = 0; left < tile.width; left += tile.tileSize)
        {
            float width = Mathf.Min(tile.tileSize, tile.width - left);
            var center = origin + new Vector2((left + width / 2 - tile.width / 2) * UnitX, (solid ? -1 : 1) * height / 2);
            var art = Piece("Tile", center, new Vector2(width * UnitX, height), solid ? -4 : -5,
                string.IsNullOrEmpty(tile.image) ? Tint(tile.tint, Color.gray) : Color.white, tile.image);
            art.transform.SetParent(row, true);
        }
    }

    private void SetCharacter(StudioCharacter character, bool preserveHealth)
    {
        float fraction = preserveHealth && Actor != null ? (float)Health / Actor.health : 1;
        Actor = character;dodgeStart=-1;
        if (Actor.motionClips != null) foreach (var clip in Actor.motionClips) Connection.Sound(clip.sound);
        Health = Mathf.Clamp(Mathf.CeilToInt(fraction * Actor.health), 1, Actor.health);
        var t = Project.tuning;
        motor.ApplyStudioMovement(t.runSpeed * Actor.speedScale, t.jumpSpeed * Actor.jumpScale, t.dashSpeed,
                                  t.dashDuration);
        motor.StudioHardwareGate=AllowHardwareAction;
        slash.StudioHardwareGate=AllowProgramInput;
        slash.StudioSweep = SweepStroke;
        var strike=Actor.strike;
        slash.StudioStrike=strike!=null&&strike.active>0?strike:null;
        slash.SetStudioTiming(slash.StudioStrike?.startup??t.startupTicks,slash.StudioStrike?.active??t.activeTicks,slash.StudioStrike?.recovery??t.recoveryTicks);
        slash.ApplyStudioAttack(Mathf.Max(1, Mathf.RoundToInt(t.damage * Actor.attackScale)),
                                t.reach * Actor.reachScale);
        Array.Clear(cooldowns, 0, cooldowns.Length);
        if (bodyImage != null)
        {
            parts.RemoveAll(p => p.renderer == bodyImage);
            bodyImage.gameObject.SetActive(false);
            Destroy(bodyImage.gameObject);
        }
        string reference =
            string.IsNullOrEmpty(Actor.sprite) && Actor.id == "baekseol" ? "builtin-player" : Actor.sprite;
        bodyImage = Piece(
            Actor.name, (Vector2)transform.position + Vector2.up * 1.15f, new Vector2(1.65f, 2.3f), 15,
            string.IsNullOrEmpty(reference) ? Tint(Actor.color, Color.cyan) : Color.white, reference, true);
        bodyImage.transform.SetParent(transform, true);
        lastSpriteRef = lastPose = null;
    }

    private SpriteRenderer Piece(string label, Vector2 center, Vector2 size, int order, Color color,
                                 string image = "", bool fit = false)
    {
        var go = new GameObject(label);
        go.transform.SetParent(sceneRoot.transform, false);
        go.transform.position = center;
        var renderer = go.AddComponent<SpriteRenderer>();
        renderer.sprite = white;
        renderer.color = color;
        renderer.sortingOrder = order;
        Fit(renderer, size, false);
        if (!string.IsNullOrEmpty(image))
            parts.Add(new ImagePart { renderer = renderer, reference = image, size = size, keepAspect = fit });
        return renderer;
    }
    private static void Fit(SpriteRenderer renderer, Vector2 size, bool keepAspect)
    {
        Vector2 bounds = renderer.sprite.bounds.size;
        float sx = size.x / bounds.x, sy = size.y / bounds.y;
        if (keepAspect)
            sx = sy = Mathf.Min(sx, sy);
        renderer.transform.localScale = new Vector3(sx, sy, 1);
    }
    private Transform Solid(string name, Vector2 center, Vector2 size, bool oneWay)
    {
        var r = Piece(name, center, size, -4, new Color(.58f, .72f, .8f));
        var collider = r.gameObject.AddComponent<BoxCollider2D>();
        collider.size = r.sprite.bounds.size;
        if (oneWay)
        {
            r.gameObject.AddComponent<PlatformEffector2D>().useOneWay = true;
            collider.usedByEffector = true;
        }
        return r.transform;
    }
    private void AddEnemy(Vector2 pos, StudioObject data)
    {
        CombatTarget target;
        if (demoHud != null && demoHud.trainingDummy != null)
        {
            target = Instantiate(demoHud.trainingDummy, pos, Quaternion.identity, sceneRoot.transform);
            target.gameObject.SetActive(true);
        }
        else
        {
            var go = new GameObject("Studio enemy");
            go.transform.SetParent(sceneRoot.transform, false);
            go.transform.position = pos;
            var collider = go.AddComponent<BoxCollider2D>();
            collider.size = new Vector2(.7f, 1.6f);
            collider.offset = Vector2.up * .8f;
            var r =
                Piece("Enemy", pos + Vector2.up * .8f, new Vector2(.7f, 1.6f), 4, new Color(.4f, .55f, .68f));
            r.transform.SetParent(go.transform, true);
            target = go.AddComponent<CombatTarget>();
        }
        var config = data.enemy ?? new StudioEnemy();
        if (!string.IsNullOrEmpty(data.label))
            target.name = data.label;
        if (!string.IsNullOrEmpty(data.image))
        {
            foreach (var r in target.GetComponentsInChildren<SpriteRenderer>())
                r.enabled = false;
            var art = Piece("Enemy art", pos + Vector2.up * .8f, new Vector2(1.5f, 1.6f), 5, Color.white,
                            data.image, true);
            art.transform.SetParent(target.transform, true);
        }
        target.Setup(CombatFaction.Enemy, config.health > 0 ? config.health : Project.tuning.hp);
        foreach (var collider in target.GetComponentsInChildren<Collider2D>())
        {
            collider.isTrigger = true;
            collider.enabled = true;
        }
        foes.Add(new Foe { id = data.id, target = target, config = config });
        Remaining++;
    }
    private void LoadParts()
    {
        foreach (var part in parts)
        {
            if (part.loaded)
                continue;
            var texture = Connection.Texture(part.reference);
            if (texture == null)
                continue;
            if (!sprites.TryGetValue(texture, out var sprite))
            {
                sprite = MakeSprite(texture);
                sprites[texture] = sprite;
            }
            part.renderer.sprite = sprite;
            Fit(part.renderer, part.size, part.keepAspect);
            part.loaded = true;
        }
    }

    private void OpenStory(string id, int startLine = 0)
    {
        Story = string.IsNullOrEmpty(id) ? null : Project.Story(id);
        lineIndex = startLine;
        BeginStage();
        if (Story != null){Fire("storyStart", id);DispatchProgram("line",Line.id);}
        SyncControls();
    }
    public void Answer(int choice = -1, bool skip = false)
    {
        if (Story == null)
            return;
        if (skip) {
            FinishStageFlags();
            lineIndex=Line.stageTrack?.Destination(Story)??-1;
        }
        else if (Line.choices.Length > 0)
        {
            if (!StageChoiceAllowed(choice))
                return;
            string next = Line.choices[choice].to;
            DispatchProgram("choice",next??"");
            lineIndex = Array.FindIndex(Story.nodes, n => n.id == next);
        }
        else
            lineIndex++;
        if (lineIndex >= 0 && lineIndex < Story.nodes.Length) { BeginStage(); DispatchProgram("line",Line.id); return; }
        string storyId = Story.id;
        storiesDone.Add(storyId); GrantRewards();
        Story = null;
        flow.CloseAll();
        if (Fire("storyEnd", storyId) && pendingExit != null)
        {
            deferExit = true;
            return;
        }
        if (pendingExit != null)
        {
            var exit = pendingExit;
            pendingExit = null;
            Travel(exit);
        }
        SyncControls();
    }
    private void Travel(StudioObject exit)
    {
        mapsDone.Add(Map.id); GrantRewards();
        var dest = Project.Map(exit.to);
        if (exit.to == "next")
        {
            int index = Array.IndexOf(Project.scenes, Map) + 1;
            dest = index < Project.scenes.Length ? Project.scenes[index] : null;
        }
        if (dest != null)
            Enter(dest, true);
        else
        {
            Result = "맵 탐험 완료";
            Fire("clear");
            SyncControls();
        }
    }
    private void SyncControls()
    {
        if (!Running)
            return;
        bool movable = !Paused && skill == null;
        motor.SetVirtualHorizontal(0);
        motor.enabled = movable && dodgeStart<0;
        slash.enabled = movable && dodgeStart<0;
        if (!movable && body.simulated)
            body.linearVelocity = Vector2.zero;
        body.simulated = movable;
    }

    private void OnBasicHit(CombatTarget target)
    {
        var e = foes.Find(v => v.target == target);
        if (e != null)
            AddStack(e);
    }
    private void AddStack(Foe e)
    {
        if (Actor.passive == "frost")
            e.stacks = Math.Min(Project.tuning.frostMax, e.stacks + 1);
    }
    private void Hit(Foe e, float damage, bool stack = true)
    {
        if (e == null || e.target.Health <= 0)
            return;
        int baseDamage = Mathf.Max(1, Mathf.FloorToInt(damage * (1 + (float)GearPower() / Project.tuning.damage) * Actor.attackScale + .5f));
        if (!e.target.TakeDamage(baseDamage + CombatEvent("hit",e.config.tag??""), CombatFaction.Player, Vector2.zero)) return;
        if (stack) AddStack(e);
        if (e.target.Health == 0)
        {
            CombatEvent("kill",e.config.tag??"");
            kills[Map.id + "/" + e.id] = e.config.tag ?? "";
            GrantRewards();
        }
    }
    private StudioProgramResult DispatchProgram(string signal,string key="")
    {
        if(eventMachine==null||Actor==null||Map==null||!eventMachine.Handles(signal))return null;
        var result=eventMachine.Dispatch(signal,key,combatTick,Actor.id,Map.id,Health,Actor.health,name=>flow.Matches(name,true),flow.Flag);
        Health=result.hp;
        if(result.shield>0){var memory=RuleState();memory.shield=Math.Min(9999,memory.shield+result.shield);}
        foreach(var emitted in result.signals)if(FireScreen("signal",emitted))result.opened=true;
        return result;
    }
    private bool Fire(string signal,string key="",float previous=101)
    {
        var result=DispatchProgram(signal,key);
        return FireScreen(signal,key,previous)||(result?.opened??false);
    }
    private bool FireScreen(string signal, string key = "", float previous = 101)
    {
        if (Actor == null ||
            !flow.Fire(Project, Map.id, Actor.id, signal, key, 100f * Health / Actor.health, previous, clock))
            return false;
        SyncControls();
        return true;
    }
    private void FinishOverlay()
    {
        if (!deferExit || HasOverlay || pendingExit == null)
            return;
        var exit = pendingExit;
        pendingExit = null;
        deferExit = false;
        Travel(exit);
    }
    public bool Visible(StudioWidget w) => w.visible && flow.Matches(w.showFlag, w.showValue);
    public bool Enabled(StudioWidget w) => flow.Matches(w.enableFlag, w.enableValue);
    public void Activate(StudioWidget widget, bool primary = true)
    {
        if (!Visible(widget) || !Enabled(widget))
            return;
        if(primary){
            if(!Running||!AllowProgramInput(widget.action))return;
            PressCore(widget.action,widget.target);
        }
        if (widget.steps == null)
            return;
        foreach (var step in widget.steps)
            if (flow.Matches(step.flag, step.flagState))
                Press(step.action, step.target);
    }
    private bool FollowScreenRoute(string key)
    {
        string target=CurrentLayout?.navigation?.Route(key);if(string.IsNullOrEmpty(target))return false;
        Present(null);flow.CloseAll();Menu="";
        var f=Project.frontScreens;
        if(target=="$field")FinishOverlay();
        else if(target==f?.title||target==f?.roster||target==f?.loading)Present(target);
        else flow.Open(target);
        SyncControls();return true;
    }
    internal bool Selected(StudioWidget w) => !string.IsNullOrEmpty(w.states?.flag) && flow.Matches(w.states.flag,true);
    private bool AllowHardwareAction(string action)
    {
        if(!AllowProgramInput(action))return false;
        if(action=="dodge"&&Actor?.dodge?.enabled==true){BeginDodge();return false;}
        return true;
    }
    private void BeginDodge()
    {
        var d=Actor.dodge;
        if(d?.enabled!=true||d.ticks<1||Paused||skill!=null||dodgeStart>=0||combatTick<RuleState().dodgeReady)return;
        if(slash.IsAttacking){if(slash.StudioStrike==null||!slash.StudioStrike.Cancel(slash.StudioTick))return;slash.ResetStudioAttack();}
        RuleState().dodgeReady=combatTick+d.cooldown;
        dodgeStart=combatTick;dodgeFacing=motor.Facing;motionEpoch++;
        body.linearVelocity=new Vector2(0,body.linearVelocity.y);SyncControls();
    }
    private void StepDodge()
    {
        if(dodgeStart<0)return;
        var d=Actor.dodge;
        if(combatTick-dodgeStart>d.ticks){dodgeStart=-1;SyncControls();return;}
        Warp(body.position+Vector2.right*(dodgeFacing*d.distance/d.ticks));
    }
    internal bool AllowProgramInput(string action)=>!(DispatchProgram("input",action)?.consumed??false);
    public void Press(string action, string target = "")
    {
        if(Running&&AllowProgramInput(action))PressCore(action,target);
    }
    private void PressCore(string action,string target)
    {
        var f = Project.frontScreens;
        if ((action=="beginGame"||action=="confirmActor")&&FollowScreenRoute("next"))return;
        if ((action=="back"||action=="resume")&&FollowScreenRoute(action))return;
        if (action == "beginGame" || action == "confirmActor")
        {
            Present(action == "beginGame" && !string.IsNullOrEmpty(f?.roster) ? f.roster : f?.loading);
            return;
        }
        if (action == "previousActor" || (action == "switch" && ShowingFront))
        {
            int count = Project.characters.Length, at = Array.IndexOf(Project.characters, Actor);
            Press("selectActor", Project.characters[(at + count + (action == "previousActor" ? -1 : 1)) % count].id);
            return;
        }
        if (ShowingFront && (action == "back" || action == "resume"))
        {
            Present(action == "back" && front == f?.roster ? f?.title : null);
            return;
        }
        if (action == "newRun")
        {
            PlayerPrefs.DeleteKey(SaveKey);
            lastCheckpoint = null;
            ResetProgress();
            flow = new StudioScreenFlow();
            Enter(Project.Map(Project.startMap));
            Fire("start");
            StartPresentation();
            return;
        }
        if (action == "open")
        {
            if (Project.Layout(target) != null) {
                if (target == f?.title || target == f?.roster || target == f?.loading) Present(target);
                else flow.Open(target);
            }
            SyncControls();
            return;
        }
        if (action == "back")
        {
            if (HasOverlay)
                flow.Back();
            else
                Menu = "";
            SyncControls();
            FinishOverlay();
            return;
        }
        if (action == "flagOn" || action == "flagOff")
        {
            flow.Flag(target, action == "flagOn");
            return;
        }
        if (action == "signal")
        {
            Fire("signal", target);
            return;
        }
        if (action == "gotoMap")
        {
            var m = Project.Map(target);
            if (m != null)
                Enter(m, true);
            return;
        }
        if (action == "startStory")
        {
            if (Project.Story(target) != null)
            {
                front = null;
                flow.CloseAll();
                Menu = "";
                pendingExit = null;
                deferExit = false;
                OpenStory(target);
            }
            return;
        }
        if (action == "selectActor")
        {
            var actor = Project.Character(target);
            if (actor != null)
            {
                skill = null;
                SetCharacter(actor, true);
                Fire("switch");
                SyncControls();
            }
            return;
        }
        if (action == "resume")
        {
            flow.CloseAll();
            Menu = "";
            SyncControls();
            FinishOverlay();
            return;
        }
        if (action == "restart")
        {
            mapHistory.Remove(Map.id);
            Enter(Map);
            return;
        }
        if (action == "nextLine" || action == "skip")
        {
            Answer(-1, action == "skip");
            return;
        }
        if (Story != null || !string.IsNullOrEmpty(Result))
            return;
        if (action == "roadmap")
        {
            var route = Actor.roadmap?.Build(Project, Actor);
            if (route != null)
            {
                flow.CloseAll();
                Menu = "";
                Story = route;
                lineIndex = 0;
                BeginStage();
                Fire("storyStart",Story.id);DispatchProgram("line",Line.id);
                SyncControls();
            }
            return;
        }
        if (action == "menu")
        {
            if (!Fire("menu"))
            {
                Menu = Map.menuId;
                SyncControls();
            }
            return;
        }
        if (action == "switch")
        {
            int at = Array.IndexOf(Project.characters, Actor);
            skill = null;
            SetCharacter(Project.characters[(at + 1) % Project.characters.Length], true);
            Fire("switch");
            SyncControls();
            return;
        }
        if (Paused || skill != null || dodgeStart>=0)
            return;
        if(action=="dodge"){BeginDodge();return;}
        if (action == "jump")
        {
            motor.RequestJump();
            return;
        }
        if (action == "attack")
        {
            if (!slash.IsAttacking) motionEpoch++;
            slash.RequestAttack();
            return;
        }
        if (!action.StartsWith("skill", StringComparison.Ordinal) ||
            !int.TryParse(action.Substring(5), out int slot) || slot < 1 || slot > Actor.skills.Length ||
            slot > cooldowns.Length)
            return;
        slot--;
        var next = Actor.skills[slot];
        if(next.mechanic=="none" || clock<cooldowns[slot])return;
        if(slash.IsAttacking){if(slash.StudioStrike==null||!slash.StudioStrike.Cancel(slash.StudioTick))return;slash.ResetStudioAttack();}
        skill = next;
        activeSkillKey = action;
        motionEpoch++;
        started = nextHit = clock;
        hitIndex = 0;
        skillOrigin = body.position;
        skillFacing = motor.Facing;
        targets.Clear();
        dashed.Clear();
        var t = Project.tuning;
        float radius = next.mechanic == "flurry"   ? t.reach * Actor.reachScale + 2 * UnitX
                       : next.mechanic == "shadow" ? t.shadowRange * UnitX
                       : next.mechanic == "nova"   ? t.radius
                                                   : 38 * UnitX;
        foreach (var e in foes)
        {
            Vector2 delta = (Vector2)e.target.transform.position - skillOrigin;
            if (e.target.Health <= 0 || Mathf.Abs(delta.x) > radius || Mathf.Abs(delta.y) > 19 * UnitY)
                continue;
            if ((next.mechanic == "hook" || next.mechanic == "shot") && delta.x * skillFacing < 0)
                continue;
            targets.Add(e);
        }
        targets.Sort((a, b) => Mathf.Abs(a.target.transform.position.x - skillOrigin.x)
                                   .CompareTo(Mathf.Abs(b.target.transform.position.x - skillOrigin.x)));
        Fire("skill", action);
        cooldowns[slot] = clock + (next.cooldown >= 0 ? next.cooldown : t.Cooldown(next.mechanic));
        SyncControls();
    }

    private void Warp(Vector2 pos)
    {
        pos.x = Mathf.Clamp(pos.x, OriginX + UnitX, OriginX + (Map.width - 1) * UnitX);
        body.position = pos;
        transform.position = pos;
    }
    private void StepSkill()
    {
        if (skill == null)
            return;
        var t = Project.tuning;
        float damage = t.damage * skill.power;
        string kind = skill.mechanic;
        if (kind == "sequence")
        {
            if (clock < nextHit)
                return;
            if (hitIndex < skill.steps.Length)
            {
                RunStep(skill.steps[hitIndex++], damage);
                return;
            }
        }
        else if (kind == "dash")
        {
            float previous = transform.position.x, elapsed = clock - started;
            Warp(skillOrigin +
                 Vector2.right * (skillFacing * t.dashSpeed * Mathf.Min(elapsed, t.dashDuration)));
            foreach (var e in foes)
            {
                var pos = e.target.transform.position;
                if (pos.x >= Mathf.Min(previous, transform.position.x) - UnitX &&
                    pos.x <= Mathf.Max(previous, transform.position.x) + UnitX &&
                    Mathf.Abs(pos.y - skillOrigin.y) < 13 * UnitY && dashed.Add(e))
                    Hit(e, damage * t.dashPower);
            }
            if (elapsed < t.dashDuration)
                return;
        }
        else if (clock >= nextHit)
        {
            int count = kind == "flurry"   ? t.flurry
                        : kind == "shadow" ? t.shadow
                        : kind == "nova"   ? t.ultHits
                                           : 1;
            bool final = hitIndex == count - 1;
            if (kind == "flurry" && targets.Count > 0)
            {
                var e = targets[0];
                Hit(e, damage * (final ? t.flurryFinal : t.flurryPower));
                if (final && Actor.passive == "frost" && e.stacks == t.frostMax)
                {
                    e.stacks = 0;
                    e.frozenUntil = clock + t.freeze;
                    e.slowUntil = e.frozenUntil + t.afterSlow;
                }
            }
            if (kind == "shadow")
            {
                targets.RemoveAll(e => e.target.Health <= 0);
                if (targets.Count > 0)
                {
                    var e = targets[hitIndex % targets.Count];
                    Warp((Vector2)e.target.transform.position - Vector2.right * skillFacing * 2 * UnitX);
                    Hit(e, damage * t.shadowPower);
                }
                if (final)
                    Warp(skillOrigin);
            }
            if (kind == "nova")
                foreach (var e in targets)
                {
                    Hit(e, final ? damage * t.ultFinal + t.bonus * e.stacks * skill.power : damage * t.ultPower,
                        !final);
                    if (final)
                        e.stacks = 0;
                }
            if ((kind == "hook" || kind == "shot") && targets.Count > 0)
            {
                var e = targets[0];
                if (kind == "hook")
                    Warp((Vector2)e.target.transform.position - Vector2.right * skillFacing * 2 * UnitX);
                Hit(e, damage);
            }
            hitIndex++;
            nextHit = clock + t.interval;
            if (!final)
                return;
        }
        else
            return;
        skill = null;
        SyncControls();
    }

    private void RunStep(StudioStep step, float damage)
    {
        var pos = body.position;
        switch (step.kind)
        {
        case "wait":
            nextHit = clock + step.value;
            return;
        case "advance":
            Warp(pos + Vector2.right * skillFacing * step.value * UnitX);
            return;
        case "origin":
            Warp(skillOrigin);
            return;
        case "heal":
            Health = Math.Min(Actor.health, Health + Mathf.RoundToInt(step.value));
            return;
        }
        Foe closest = null;
        float distance = float.PositiveInfinity;
        foreach (var e in foes)
        {
            Vector2 delta = (Vector2)e.target.transform.position - pos;
            float dx = Mathf.Abs(delta.x);
            if (e.target.Health <= 0 || dx > step.range * UnitX || Mathf.Abs(delta.y) >= 19 * UnitY)
                continue;
            if (step.kind == "area" || (step.kind == "front" && delta.x * skillFacing >= 0))
                Hit(e, damage * step.value);
            if (dx < distance)
            {
                distance = dx;
                closest = e;
            }
        }
        if (closest == null)
            return;
        if (step.kind == "strike")
            Hit(closest, damage * step.value);
        if (step.kind == "seek")
            Warp((Vector2)closest.target.transform.position - Vector2.right * skillFacing * step.value * UnitX);
    }

    private void SweepStroke(float from, float to)
    {
        if (from <= -slash.HalfAngle + .001f) slashHits.Clear();
        int face = motor.Facing;
        var player=body.position;
        foreach (var e in foes)
        {
            var strike=slash.StudioStrike;
            if(e.target.Health<=0 || (slashHits.TryGetValue(e,out int prior) && (strike==null||strike.repeat==0||slash.StudioTick-prior<strike.repeat)))continue;
            var pos=e.target.transform.position;
            bool contact=strike?.shape=="box"?strike.Touches(player.x,player.y,pos.x,pos.y,face,e.config.hurtWidth,e.config.hurtHeight):
                StudioCombatClock.SweepTouches(player.x,player.y,pos.x,pos.y,face,slash.Reach,from,to,e.config.hurtWidth,e.config.hurtHeight);
            if(!contact)continue;
            Hit(e,Project.tuning.damage);slashHits[e]=slash.StudioTick;
        }
    }
    private void MovePlatforms()
    {
        foreach (var lift in lifts)
        {
            var o = lift.data;
            float phase = (1 - Mathf.Cos(2 * Mathf.PI * clock / Mathf.Max(.5f, o.motion.period))) / 2;
            Vector2 p = new Vector2(OriginX + Mathf.Clamp(o.x + o.motion.dx * phase, 1, Map.width - 1) * UnitX,
                Mathf.Clamp(o.y + o.motion.dy * phase, 0, Mathf.Max(82, Map.height - 18)) * UnitY - .1f);
            Vector2 old = lift.surface.position;
            if (Mathf.Abs(body.position.x - old.x) <= o.width * UnitX / 2 &&
                Mathf.Abs(body.position.y - old.y - .1f) < .13f && body.linearVelocity.y <= .01f)
                body.position += p - old;
            lift.surface.position = p;
        }
    }
    private bool FoeTouches(float dx,float dy,float reach){
        var strike=slash.StudioStrike;
        if(strike==null)return Mathf.Abs(dx)<reach&&Mathf.Abs(dy)<8*UnitY;
        return strike.EnemyContact(slash.IsAttacking?slash.StudioTick:0,motor.Facing,dx,dy,reach,8*UnitY);
    }
    private void FixedUpdate()
    {
        if (!Running || Paused)
            return;
        combatTick++;
        if(eventMachine!=null){foreach(string key in eventMachine.Due(combatTick))Fire("timer",key);if(Paused)return;}
        float previousHp = Health * 100f / Actor.health;
        int previousFoes = Remaining;
        float priorClock = clock;
        clock += Time.fixedDeltaTime;
        if (hasTimers && Fire("elapsed", "", priorClock) && Paused)
            return;
        MovePlatforms();
        StepDodge();StepSkill();
        slash.AdvanceStudioAttack();
        Vector2 pos = transform.position;
        if (Map.floorMode == "drawn" && pos.y < -20 * UnitY)
        {
            pos = Point(Array.Find(Map.objects, item => item.type == "spawn"));
            skill = null;dodgeStart=-1;
            Warp(pos);
            SyncControls();
            body.linearVelocity = Vector2.zero;
        }
        if (pos.x < OriginX + UnitX || pos.x > OriginX + (Map.width - 1) * UnitX)
            Warp(pos);
        Remaining = 0;
        foreach (var e in foes)
        {
            if (e.target.Health <= 0)
            {
                e.target.gameObject.SetActive(false);
                continue;
            }
            Remaining++;
            if (e.frozenUntil > clock)
                continue;
            Vector2 p = e.target.transform.position;
            float dx = pos.x - p.x;
            float slow =
                Mathf.Min(.9f, Mathf.Max(e.stacks, e.slowUntil > clock ? 1 : 0) * Project.tuning.slow / 100);
            if (e.config.style == "guard" || e.config.style == "boss")
            {
                bool phaseTwo = e.config.style == "boss" && e.target.Health * 100 <=
                    (e.config.health > 0 ? e.config.health : Project.tuning.hp) * Math.Max(1,e.config.phase);
                bool close = FoeTouches(dx,pos.y-p.y,e.config.reach*UnitX*(phaseTwo?1.5f:1));
                if (e.state == "windup")
                {
                    if (--e.stateTicks <= 0) {
                        if (close) { ReceiveDamage(e.config.damage * (phaseTwo ? 2 : 1)); lastDamage=clock; }
                        e.state="recovery"; e.stateTicks=Math.Max(1,e.config.recovery);
                    }
                }
                else if (e.state == "recovery") { if (--e.stateTicks <= 0) e.state="idle"; }
                else if (close) { e.state="windup"; e.stateTicks=Math.Max(1,Mathf.RoundToInt(e.config.windup*(phaseTwo ? .6f : 1))); }
                else if (Mathf.Abs(dx)<e.config.sight*UnitX) e.target.transform.position=p+Vector2.right*Mathf.Sign(dx)*e.config.speed*UnitX*(1-slow)*Time.fixedDeltaTime;
                continue;
            }
            if (Mathf.Abs(dx) > 2 * UnitX && Mathf.Abs(dx) < e.config.sight * UnitX)
                p.x += Mathf.Sign(dx) * e.config.speed * UnitX * (1 - slow) * Time.fixedDeltaTime;
            e.target.transform.position = p;
            if (e.config.damage > 0 && FoeTouches(dx,pos.y-p.y,e.config.reach*UnitX) && clock-lastDamage>e.config.interval)
            {
                ReceiveDamage(e.config.damage);
                lastDamage = clock;
            }
        }
        if (Health <= 0)
        {
            Result = "전투 종료";
            Fire("defeat");
            SyncControls();
            return;
        }
        if (Health * 100f / Actor.health < previousHp && Fire("lowHp", "", previousHp))
            return;
        if (previousFoes > 0 && Remaining == 0 && Fire("enemies"))
            return;
        foreach (var o in Map.objects)
        {
            if (o.type != "exit" && o.type != "trigger")
                continue;
            Vector2 delta = Point(o) - pos;
            if (Mathf.Abs(delta.x) >= 4 * UnitX || Mathf.Abs(delta.y) >= 10 * UnitY)
                continue;
            if (o.type == "trigger" &&
                (!string.IsNullOrEmpty(o.storyId) || !string.IsNullOrEmpty(o.eventKey)) && triggers.Add(o.id))
            {
                OpenStory(o.storyId);
                if (!string.IsNullOrEmpty(o.eventKey))
                    Fire("signal", o.eventKey);
                return;
            }
            if (o.type == "exit" && (Remaining == 0 || !Map.requireClear))
            {
                if (!string.IsNullOrEmpty(Map.exitStory))
                {
                    pendingExit = o;
                    OpenStory(Map.exitStory);
                }
                else
                    Travel(o);
                return;
            }
        }
    }
    private float CameraZoom => cameraSettings?.frame!=null?Mathf.Clamp(cameraSettings.frame.zoom,1,3):1;
    private Vector2 CameraClamp(Vector2 p){
        var f=cameraSettings?.frame;float span=100/CameraZoom,w=Mathf.Max(0,Map.width-span),h=Mathf.Max(0,Map.height-span);
        return new Vector2(Mathf.Clamp(p.x,w*(f?.left??0)/100,w*(f?.right??100)/100),Mathf.Clamp(p.y,h*(f?.bottom??0)/100,h*(f?.top??100)/100));
    }
    private void UpdateCamera()
    {
        float zoom=CameraZoom,width=100*UnitX/zoom;
        view.orthographicSize = width / (2 * view.aspect);
        Vector2 player = new Vector2((transform.position.x - OriginX) / UnitX - 46/zoom, transform.position.y / UnitY - 36/zoom);
        Vector2 delta = player - cameraOffset;
        Vector2 goal=CameraClamp(new Vector2(player.x-Mathf.Clamp(delta.x,-cameraSettings.deadX/zoom,cameraSettings.deadX/zoom),
            player.y-Mathf.Clamp(delta.y,-cameraSettings.deadY/zoom,cameraSettings.deadY/zoom)));
        float mix = cameraSettings.follow <= 0 ? 1 : 1 - Mathf.Exp(-cameraSettings.follow * Time.deltaTime);
        cameraOffset = Vector2.Lerp(cameraOffset, goal, mix);
        view.transform.position = new Vector3(OriginX + cameraOffset.x * UnitX + width / 2,
            .64f * view.orthographicSize + cameraOffset.y * UnitY, cameraPos.z);
        float px = -cameraSettings.parallax * cameraOffset.x / Map.width * .15f * width;
        float py = -cameraSettings.parallax * cameraOffset.y / Mathf.Max(100, Map.height) * .12f * view.orthographicSize;
        float drift = Mathf.Sin(clock * .65f) * cameraSettings.drift / 100 * width;
        sky.transform.position = new Vector3(view.transform.position.x + px + drift, view.transform.position.y + py, 0);
        float pad = 1 + .3f * cameraSettings.parallax + cameraSettings.drift / 50;
        Fit(sky, new Vector2(width * pad, 2 * view.orthographicSize * pad), false);
    }
    private void Update()
    {
        if (StudioOnlineArena.Visible) return;
        if (!Running) return;
        if (ShowingFront && front == Project.frontScreens?.loading)
        {
            frontAge += Time.unscaledDeltaTime;
            if (LoadingFraction >= 1 || frontAge >= Mathf.Max(8, Project.frontScreens.seconds)) {if(!FollowScreenRoute("next"))Present(null);}
        }
        if(!ShowingFront)sceneAge+=Time.unscaledDeltaTime*60;
        if(Line!=null && !HasOverlay)StepStage(Time.unscaledDeltaTime);
        screenView.ReadInput(motor);
    }
    private void LateUpdate()
    {
        if (Running)
        {
            LoadParts();
            bodyImage.flipX = motor.Facing < 0;
            UpdateCamera();
            PaintSoundscape();
            PaintMotion();
            RecordFrame();
            if (Time.unscaledTime >= nextProgressSave) { SaveProgress(); nextProgressSave = Time.unscaledTime + 5; }
        }
    }
    private void OnGUI()
    {
        if (StudioOnlineArena.Visible) return;
        if (!Running) return;
        screenView.Draw(); DrawSceneTransition(); DrawDiagnostics();
        if (!Paused || CurrentLayout == null || (!HasOverlay && Line?.shot?.layers != null) ||
            (ShowingFront && front == Project.frontScreens?.loading)) return;
        bool recovery = Array.Exists(CurrentLayout.elements, w => Visible(w) && Enabled(w) &&
            (w.type == "dialogue" && Story != null || w.type == "button" && (w.action == "back" || w.action == "resume" ||
             w.action == "restart" || w.action == "newRun" || w.action == "gotoMap" || w.action == "open" ||
             w.action == "beginGame" || w.action == "confirmActor" ||
             (Story != null && (w.action == "skip" || w.action == "nextLine")))));
        if (!recovery && GUI.Button(new Rect(Screen.width-104,4,100,38),"화면 닫기"))
            Press(HasOverlay || Story == null ? "back" : "skip");
    }
    private void OnDestroy()
    {
        Leave();
    }
    public void Leave()
    {
        if (!Running)
            return;
        SaveProgress();
        Running = false;
        Time.fixedDeltaTime = previousStep;
        ClearMap();
        if (slash != null)
            slash.TargetHit -= OnBasicHit;
        if (body != null)
        {
            body.simulated = wasSimulated;
            body.position = returnPos;
            transform.position = returnPos;
            if (wasSimulated)
                body.linearVelocity = Vector2.zero;
        }
        if (motor != null)
        {
            motor.StudioHardwareGate=null;
            motor.ApplyStudioMovement(originalMovement.x, originalMovement.y, originalMovement.z, originalMovement.w);
            motor.enabled = motorEnabled;
            motor.SetVirtualHorizontal(0);
        }
        if (slash != null)
        {
            slash.StudioHardwareGate=null;
            slash.StudioStrike=null;
            slash.StudioSweep = null;
            slash.ResetStudioAttack();
            slash.ApplyStudioAttack(originalDamage, originalReach);
            slash.enabled = slashEnabled;
        }
        for (int i = 0; i < originalArt.Length; i++)
            if (originalArt[i] != null)
                originalArt[i].enabled = originalArtEnabled[i];
        if (view != null)
        {
            view.transform.position = cameraPos;
            view.orthographicSize = cameraSize;
            view.backgroundColor = cameraColor;
        }
        if (demoHud != null)
            demoHud.enabled = hudEnabled;
        ReleaseSound();
        screenView.Dispose();
        foreach (var sprite in sprites.Values)
            Destroy(sprite);
        sprites.Clear();
        if (white != null)
            Destroy(white);
    }
}
}

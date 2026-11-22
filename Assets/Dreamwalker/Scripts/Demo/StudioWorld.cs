using System;
using System.Collections.Generic;
using Dreamwalker.Combat;
using Dreamwalker.Player;
using UnityEngine;

namespace Dreamwalker.Demo
{
// Materializes a published map beside the existing demo. The original player,
// motor, hit geometry and target component remain the native gameplay entry points.
public sealed class StudioWorld : MonoBehaviour
{
    internal const float UnitX = 1f / 3.5f, UnitY = .16f, OriginX = 1000f;
    private class Foe
    {
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
    private StudioScreenFlow flow = new StudioScreenFlow();
    public bool HasOverlay => !string.IsNullOrEmpty(flow.Top);
    public StudioLayout CurrentLayout => Project.Layout(HasOverlay                   ? flow.Top
                                                        : Story != null              ? Map.dialogueId
                                                        : string.IsNullOrEmpty(Menu) ? Map.hudId
                                                                                     : Menu);
    public bool Paused => Story != null || !string.IsNullOrEmpty(Result) ||
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
        Enter(project.Map(project.startMap));
        Fire("start");
    }

    private static Sprite MakeSprite(Texture2D texture) =>
        Sprite.Create(texture, new Rect(0, 0, texture.width, texture.height), new Vector2(.5f, .5f), 100, 0,
                      SpriteMeshType.FullRect);
    private static Vector2 Point(StudioObject o) => new Vector2(OriginX + o.x * UnitX, o.y *UnitY);
    internal static Color Tint(string hex, Color fallback) => ColorUtility.TryParseHtmlString(hex,
                                                                                              out var color)
                                                                  ? color
                                                                  : fallback;

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
        targets.Clear();
        dashed.Clear();
        parts.Clear();
        triggers.Clear();
        skill = null;
        Story = null;
        pendingExit = null;
    }

    private void Enter(StudioMap map)
    {
        ClearMap();
        flow.EnterMap();
        deferExit = false;
        Map = map;
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
                    string.IsNullOrEmpty(map.backdrop) ? "builtin-stage" : map.backdrop, false);
        sky.color = map.theme == "night"  ? new Color(.37f, .44f, .62f)
                    : map.theme == "dusk" ? new Color(.99f, .76f, .68f)
                                          : Color.white;
        Solid("Ground", new Vector2(OriginX + map.width * UnitX / 2, -2), new Vector2(map.width * UnitX + 1, 4),
              false);
        foreach (var o in map.objects)
        {
            var pos = Point(o);
            switch (o.type)
            {
            case "enemy":
                AddEnemy(pos, o);
                break;
            case "platform":
                Solid("Platform", pos - Vector2.up * .1f, new Vector2(o.width * UnitX, .2f), true);
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
        SetCharacter(Project.Character(map.characterId), false);
        OpenStory(map.entryStory);
        Fire("enter");
        SyncControls();
        UpdateCamera();
    }

    private void SetCharacter(StudioCharacter character, bool preserveHealth)
    {
        float fraction = preserveHealth && Actor != null ? (float)Health / Actor.health : 1;
        Actor = character;
        Health = Mathf.Clamp(Mathf.CeilToInt(fraction * Actor.health), 1, Actor.health);
        var t = Project.tuning;
        motor.ApplyStudioMovement(t.runSpeed * Actor.speedScale, t.jumpSpeed * Actor.jumpScale, t.dashSpeed,
                                  t.dashDuration);
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
    private void Solid(string name, Vector2 center, Vector2 size, bool oneWay)
    {
        var r = Piece(name, center, size, -4, new Color(.58f, .72f, .8f));
        var collider = r.gameObject.AddComponent<BoxCollider2D>();
        collider.size = r.sprite.bounds.size;
        if (oneWay)
        {
            r.gameObject.AddComponent<PlatformEffector2D>().useOneWay = true;
            collider.usedByEffector = true;
        }
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
        foes.Add(new Foe { target = target, config = config });
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

    private void OpenStory(string id)
    {
        Story = string.IsNullOrEmpty(id) ? null : Project.Story(id);
        lineIndex = 0;
        if (Story != null)
            Fire("storyStart", id);
        SyncControls();
    }
    public void Answer(int choice = -1, bool skip = false)
    {
        if (Story == null)
            return;
        if (skip)
            lineIndex = Story.nodes.Length;
        else if (Line.choices.Length > 0)
        {
            if (choice < 0 || choice >= Line.choices.Length)
                return;
            string next = Line.choices[choice].to;
            lineIndex = Array.FindIndex(Story.nodes, n => n.id == next);
        }
        else
            lineIndex++;
        if (lineIndex >= 0 && lineIndex < Story.nodes.Length)
            return;
        string storyId = Story.id;
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
        var dest = Project.Map(exit.to);
        if (exit.to == "next")
        {
            int index = Array.IndexOf(Project.scenes, Map) + 1;
            dest = index < Project.scenes.Length ? Project.scenes[index] : null;
        }
        if (dest != null)
            Enter(dest);
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
        motor.enabled = movable;
        slash.enabled = movable;
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
        if (e.target.TakeDamage(Mathf.Max(1, Mathf.RoundToInt(damage * Actor.attackScale)),
                                CombatFaction.Player, Vector2.zero) &&
            stack)
            AddStack(e);
    }
    private bool Fire(string signal, string key = "", float previous = 101)
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
        if (primary)
            Press(widget.action, widget.target);
        if (widget.steps == null)
            return;
        foreach (var step in widget.steps)
            if (flow.Matches(step.flag, step.flagState))
                Press(step.action, step.target);
    }
    public void Press(string action, string target = "")
    {
        if (!Running)
            return;
        if (action == "newRun")
        {
            flow = new StudioScreenFlow();
            Enter(Project.Map(Project.startMap));
            Fire("start");
            return;
        }
        if (action == "open")
        {
            if (Project.Layout(target) != null)
                flow.Open(target);
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
                Enter(m);
            return;
        }
        if (action == "startStory")
        {
            if (Project.Story(target) != null)
            {
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
        if (Paused || skill != null)
            return;
        if (action == "jump")
        {
            motor.RequestJump();
            return;
        }
        if (action == "attack")
        {
            slash.RequestAttack();
            return;
        }
        if (!action.StartsWith("skill", StringComparison.Ordinal) ||
            !int.TryParse(action.Substring(5), out int slot) || slot < 1 || slot > Actor.skills.Length ||
            slot > cooldowns.Length)
            return;
        slot--;
        var next = Actor.skills[slot];
        if (next.mechanic == "none" || clock < cooldowns[slot] || slash.IsAttacking)
            return;
        skill = next;
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

    private void FixedUpdate()
    {
        if (!Running || Paused)
            return;
        float previousHp = Health * 100f / Actor.health;
        int previousFoes = Remaining;
        float priorClock = clock;
        clock += Time.fixedDeltaTime;
        if (hasTimers && Fire("elapsed", "", priorClock) && Paused)
            return;
        StepSkill();
        Vector2 pos = transform.position;
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
            if (Mathf.Abs(dx) > 2 * UnitX && Mathf.Abs(dx) < e.config.sight * UnitX)
                p.x += Mathf.Sign(dx) * e.config.speed * UnitX * (1 - slow) * Time.fixedDeltaTime;
            e.target.transform.position = p;
            if (e.config.damage > 0 && Mathf.Abs(dx) < e.config.reach * UnitX &&
                Mathf.Abs(pos.y - p.y) < 8 * UnitY && clock - lastDamage > e.config.interval)
            {
                Health = Math.Max(0, Health - e.config.damage);
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
    private void UpdateCamera()
    {
        float width = 100 * UnitX;
        view.orthographicSize = width / (2 * view.aspect);
        float left = Mathf.Clamp(transform.position.x - OriginX - 46 * UnitX, 0, (Map.width - 100) * UnitX);
        view.transform.position =
            new Vector3(OriginX + left + width / 2, .64f * view.orthographicSize, cameraPos.z);
        sky.transform.position = new Vector3(view.transform.position.x, view.transform.position.y, 0);
        Fit(sky, new Vector2(width, 2 * view.orthographicSize), false);
    }
    private void Update()
    {
        if (Running)
            screenView.ReadInput(motor);
    }
    private void LateUpdate()
    {
        if (Running)
        {
            LoadParts();
            bodyImage.flipX = motor.Facing < 0;
            UpdateCamera();
        }
    }
    private void OnGUI()
    {
        if (Running)
            screenView.Draw();
    }
    private void OnDestroy()
    {
        Leave();
    }
    public void Leave()
    {
        if (!Running)
            return;
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
            motor.ApplyStudioMovement(originalMovement.x, originalMovement.y, originalMovement.z, originalMovement.w);
            motor.enabled = motorEnabled;
            motor.SetVirtualHorizontal(0);
        }
        if (slash != null)
        {
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
        screenView.Dispose();
        foreach (var sprite in sprites.Values)
            Destroy(sprite);
        sprites.Clear();
        if (white != null)
            Destroy(white);
    }
}
}

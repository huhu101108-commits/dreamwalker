using System;
using System.Collections.Generic;
using UnityEngine;

namespace Dreamwalker.Demo
{
[Serializable]
public class StudioMapMemory
{
    public string id;
    public string[] seen, defeated;
}
[Serializable]
public class StudioFoeMemory
{
    public string id;
    public int hp, stacks;
    public float x, ice, slow;
}
[Serializable]
public class StudioBagEntry
{
    public string id;
    public int count;
}
[Serializable]
public class StudioEquipEntry
{
    public string key, id;
}
[Serializable]
public class StudioPlayerSave
{
    public int version, hp;
    public float x, y;
    public string map, actor, result;
    public string[] flags, runRules, mapRules, cleared, stories, rewards;
    public StudioMapMemory[] maps;
    public StudioFoeMemory[] foes;
    public StudioBagEntry[] bag;
    public StudioEquipEntry[] gear, kills, inputs;
    public int combatTick;
    public StudioActorRules[] combatStates;
    public StudioProgramBucket eventState;
}
public sealed partial class StudioWorld
{
    private readonly Dictionary<string, StudioMapMemory> mapHistory =
        new Dictionary<string, StudioMapMemory>();
    private readonly HashSet<string> mapsDone = new HashSet<string>(), storiesDone = new HashSet<string>(),
                                     rewards = new HashSet<string>();
    private readonly Dictionary<string,string> formValues = new Dictionary<string,string>();
    private readonly Dictionary<string,string> formDefaults = new Dictionary<string,string>();
    internal string FieldValue(StudioWidget w) {
        string key = w.control.Name(CurrentLayout.id,w.id);
        return formValues.TryGetValue(key,out string value) ? w.control.Value(value) ?? w.control.initial : w.control.initial;
    }
    internal string FieldText(string text) {
        if(!string.IsNullOrEmpty(text)&&eventMachine!=null&&text.Contains("{변수:"))
            text=System.Text.RegularExpressions.Regex.Replace(text,@"\{변수:(?:(save|session|map):)?([a-zA-Z0-9_가-힣-]{1,50})\}", m=>
                eventMachine.Value(m.Groups[1].Success?m.Groups[1].Value:"save",m.Groups[2].Value).ToString(System.Globalization.CultureInfo.InvariantCulture));
        if (!string.IsNullOrEmpty(text) && text.Contains("{입력:"))
            text = System.Text.RegularExpressions.Regex.Replace(text,@"\{입력:([a-zA-Z0-9_가-힣-]{1,50})\}",
                m => formValues.TryGetValue(m.Groups[1].Value,out string value) || formDefaults.TryGetValue(m.Groups[1].Value,out value) ? value : "");
        return Actor != null ? Actor.ProfileText(text) : text;
    }
    internal void CommitField(StudioWidget w,string raw) {
        if (!Visible(w) || !Enabled(w) || Array.IndexOf(CurrentLayout.elements,w)<0) return;
        string key=w.control.Name(CurrentLayout.id,w.id), value=w.control.Value(raw);
        if (value==null || (formValues.TryGetValue(key,out string old) && old==value)) return;
        formValues[key]=value;
        if (!string.IsNullOrEmpty(w.control.signal)) Fire("signal",w.control.signal);
    }
    private readonly Dictionary<string, int> bag = new Dictionary<string, int>();
    private readonly Dictionary<string, string> gear = new Dictionary<string, string>();
    private float nextProgressSave, poseStart;
    private int motionEpoch, lastEpoch;
    private string activeSkillKey, lastPose, lastSpriteRef;
    private bool playedCue,shownEffect;
    private SpriteRenderer motionFx;
    private float fxUntil;
    private AudioSource cuePlayer, musicPlayer, voicePlayer, castVoicePlayer;
    private string pendingCastVoice;
    private float castVoiceUntil;
    private void QueueCastVoice(string reference)
    {
        pendingCastVoice = string.IsNullOrEmpty(reference) ? null : reference;
        castVoiceUntil = Time.unscaledTime + 1;
    }
    // A skill shout plays once at the voice volume; a clip that is still loading may start within one second.
    private void PlayCastVoice()
    {
        if (string.IsNullOrEmpty(pendingCastVoice)) return;
        if (Time.unscaledTime > castVoiceUntil) { pendingCastVoice = null; return; }
        var clip = Connection.Sound(pendingCastVoice);
        if (clip == null) return;
        pendingCastVoice = null;
        SoundChannel(ref castVoicePlayer);
        castVoicePlayer.Stop();
        castVoicePlayer.clip = clip;
        castVoicePlayer.loop = false;
        castVoicePlayer.volume = Mathf.Clamp01((Project.mix?.voice ?? 100) / 100f);
        castVoicePlayer.Play();
    }
    private string currentMusic;
    private StudioLine speakingLine;
    private bool musicStarted, voiceStarted;

    private AudioSource SoundChannel(ref AudioSource channel)
    {
        if (channel == null)
        {
            channel = gameObject.AddComponent<AudioSource>();
            channel.playOnAwake = false;
            channel.spatialBlend = 0;
        }
        return channel;
    }
    private void PaintSoundscape()
    {
        string music = string.IsNullOrEmpty(front) ? Map?.music : null;
        var line = !HasOverlay ? Line : null;
        if (music != currentMusic)
        {
            musicPlayer?.Stop();
            currentMusic = music;
            musicStarted = false;
        }
        if (line != speakingLine)
        {
            if(line==null){stageSound?.Stop();pendingStageSound=null;}
            voicePlayer?.Stop();
            speakingLine = line;
            voiceStarted = false;
        }
        PlayCastVoice();
        StartTrack(ref musicPlayer, music, ref musicStarted, Project.mix?.musicMode!="once", Project.mix?.music ?? 65);
        StartTrack(ref voicePlayer, line?.voice, ref voiceStarted, Project.mix?.voiceMode=="loop", Project.mix?.voice ?? 100);
    }
    private void StartTrack(ref AudioSource player, string reference, ref bool started, bool loop, float volume)
    {
        if (started || string.IsNullOrEmpty(reference)) return;
        var clip = Connection.Sound(reference);
        if (clip == null) return;
        SoundChannel(ref player);
        player.clip = clip;
        player.loop = loop;
        player.volume = Mathf.Clamp01(volume / 100f);
        player.Play();
        started = true;
    }
    private void PlayAuthoredFx(ref AudioSource channel,AudioClip clip){
        SoundChannel(ref channel);
        float volume=Mathf.Clamp01((Project.mix?.fx??85)/100f);
        if(Project.mix?.fxMode=="loop"){channel.clip=clip;channel.loop=true;channel.volume=volume;channel.Play();}
        else{channel.loop=false;channel.volume=1;channel.PlayOneShot(clip,volume);}
    }
    private void ReleaseSound()
    {
        foreach (var player in new[]{musicPlayer,voicePlayer,cuePlayer,stageSound,castVoicePlayer})
            if (player != null) { player.Stop(); Destroy(player); }
        foreach (var clip in tones.Values) Destroy(clip);
        tones.Clear();
    }
    private readonly Dictionary<string, AudioClip> tones = new Dictionary<string, AudioClip>();
    private readonly Dictionary<string, Vector2> widgetScroll = new Dictionary<string, Vector2>();
#if UNITY_EDITOR
    public const string TabletPreviewSlotKey="Dreamwalker.TabletPreview.Slot", TabletPreviewMapKey="Dreamwalker.TabletPreview.Map", TabletPreviewObjectKey="Dreamwalker.TabletPreview.Object";
#endif
    private string SaveKey
    {
        get
        {
#if UNITY_EDITOR
            string preview = UnityEditor.SessionState.GetString(TabletPreviewSlotKey, "");
            if (Guid.TryParseExact(preview,"N",out _)) return "dreamwalker-tablet-preview:"+preview;
            string slot = UnityEditor.SessionState.GetString(StoryProbeSlotKey, "");
            if (IsStoryProbeSlot(slot)) return slot;
#endif
            return "dreamwalker-player-v1:" + (string.IsNullOrEmpty(Project.saveId) ? Project.startMap : Project.saveId);
        }
    }
    private StudioItem Item(string id) => Array.Find(Project.items ?? Array.Empty<StudioItem>(),
                                                     v => v.id == id);

    private int combatTick;
    private StudioEventMachine eventMachine;
    private List<StudioActorRules> combatStates = new List<StudioActorRules>();
    private readonly Dictionary<string,string> kills = new Dictionary<string,string>();
    private StudioActorRules RuleState()
    {
        var state = combatStates.Find(s => s.actor == Actor.id);
        if (state == null) { state = new StudioActorRules { actor = Actor.id }; combatStates.Add(state); }
        return state;
    }
    private int CombatEvent(string moment,string key="")
    {
        int hp = Health;
        int damage = RuleState().Apply(Project.combatRules, moment, combatTick, ref hp, Actor.health);
        Health = hp;
        return damage+(DispatchProgram(moment,key)?.damage??0);
    }
    private void ReceiveDamage(int amount)
    {
        if(dodgeStart>=0 && Actor.dodge.Guard(combatTick-dodgeStart))return;
        if(slash.IsAttacking && (slash.StudioStrike?.Guard(slash.StudioTick)??false))return;
        Health = Math.Max(0, Health - RuleState().Absorb(amount));
        if (Actor.HasEnergy) RuleState().Gain(Actor.energy, Actor.energy.hurt);
        CombatEvent("hurt");
    }
    private void ResetProgress()
    {
        formValues.Clear();formDefaults.Clear();
        foreach(var layout in Project.layouts)foreach(var w in layout.elements)
            if(w.type=="input" && !string.IsNullOrEmpty(w.control?.key) && !formDefaults.ContainsKey(w.control.key))formDefaults[w.control.key]=w.control.initial;
        mapHistory.Clear();
        kills.Clear();
        combatStates.Clear();
        combatTick = 0;
        eventMachine=Project.eventRules!=null&&Project.eventRules.Length>0?new StudioEventMachine(Project.eventRules):null;
        mapsDone.Clear();
        storiesDone.Clear();
        rewards.Clear();
        bag.Clear();
        gear.Clear();
        nextProgressSave = Time.unscaledTime + 5;
        lastPose = lastSpriteRef = null;
    }
    private void RememberMap()
    {
        if (Map == null)
            return;
        var dead = new List<string>();
        foreach (var e in foes)
            if (e.target.Health == 0)
                dead.Add(e.id);
        mapHistory[Map.id] = new StudioMapMemory { id = Map.id, seen = new List<string>(triggers).ToArray(),
                                                   defeated = dead.ToArray() };
    }
    private void ApplyMapMemory()
    {
        if (!mapHistory.TryGetValue(Map.id, out var memory))
            return;
        triggers.UnionWith(memory.seen ?? Array.Empty<string>());
        var dead = new HashSet<string>(memory.defeated ?? Array.Empty<string>());
        foreach (var e in foes)
            if (dead.Contains(e.id))
            {
                e.target.RestoreHealth(0);
                e.target.gameObject.SetActive(false);
                Remaining--;
            }
    }
    private bool SaveProgress()
    {
        if (!Running || Map == null || Health <= 0 || body.position.y < 0 || Story != null || skill != null || castClock.Active || dodgeStart>=0 || pendingExit != null ||
            (HasOverlay && string.IsNullOrEmpty(Result)))
            return false;
        RememberMap();
        var snapshot = new StudioPlayerSave {
            version = 1,
            hp = Health,
            combatTick = combatTick,
            eventState = eventMachine?.Saved,
            combatStates = combatStates.ToArray(),
            kills = new List<KeyValuePair<string,string>>(kills).ConvertAll(p => new StudioEquipEntry { key=p.Key, id=p.Value }).ToArray(),
            x = (body.position.x - OriginX) / UnitX,
            y = body.position.y / UnitY,
            map = Map.id,
            actor = Actor.id,
            result = Result,
            flags = flow.Flags,
            inputs = new List<KeyValuePair<string,string>>(formValues).ConvertAll(p=>new StudioEquipEntry{key=p.Key,id=p.Value}).ToArray(),
            runRules = flow.RunRules,
            mapRules = flow.MapRules,
            maps = new List<StudioMapMemory>(mapHistory.Values).ToArray(),
            cleared = new List<string>(mapsDone).ToArray(),
            stories = new List<string>(storiesDone).ToArray(),
            rewards = new List<string>(rewards).ToArray(),
            foes = foes.ConvertAll(
                           e => new StudioFoeMemory { id = e.id, hp = e.target.Health, stacks = e.stacks,
                                                      x = (e.target.transform.position.x - OriginX) / UnitX,
                                                      ice = Mathf.Max(0, e.frozenUntil - clock),
                                                      slow = Mathf.Max(0, e.slowUntil - clock) })
                       .ToArray()
        };
        var inventory = new List<StudioBagEntry>();
        foreach (var pair in bag)
            inventory.Add(new StudioBagEntry { id = pair.Key, count = pair.Value });
        snapshot.bag = inventory.ToArray();
        var equipment = new List<StudioEquipEntry>();
        foreach (var pair in gear)
            equipment.Add(new StudioEquipEntry { key = pair.Key, id = pair.Value });
        snapshot.gear = equipment.ToArray();
        string json = JsonUtility.ToJson(snapshot);
        if (json != lastCheckpoint)
        {
            try
            {
                PlayerPrefs.SetString(SaveKey, json);
                PlayerPrefs.Save();
                lastCheckpoint = json;
            }
            catch (PlayerPrefsException)
            {
                return false;
            }
        }
        return true;
    }
    private string lastCheckpoint;
    private bool RestoreProgress()
    {
        if (!PlayerPrefs.HasKey(SaveKey))
            return false;
        StudioPlayerSave saved;
        try
        {
            saved = JsonUtility.FromJson<StudioPlayerSave>(PlayerPrefs.GetString(SaveKey));
        }
        catch (ArgumentException)
        {
            return false;
        }
        if (saved == null || saved.version != 1 || saved.hp <= 0 || Project.Map(saved.map) == null ||
            Project.Character(saved.actor) == null)
            return false;
        foreach (var m in saved.maps ?? Array.Empty<StudioMapMemory>())
            if (m != null && Project.Map(m.id) != null)
                mapHistory[m.id] = m;
        var fields = new Dictionary<string,string>();
        foreach (var item in saved.inputs ?? Array.Empty<StudioEquipEntry>())
            if (item?.key != null && item.id != null) fields[item.key]=item.id;
        formValues.Clear();
        foreach (var layout in Project.layouts) foreach (var w in layout.elements) if (w.type=="input" && w.control!=null) {
            string key=w.control.Name(layout.id,w.id);
            if (fields.TryGetValue(key,out string raw) && w.control.Value(raw)!=null) formValues[key]=w.control.Value(raw);
        }
        combatTick = Math.Max(0, saved.combatTick);
        eventMachine?.Restore(saved.eventState,combatTick);
        foreach (var state in saved.combatStates ?? Array.Empty<StudioActorRules>())
            if (state != null && state.counters != null && Project.Character(state.actor) != null){
                if(state.dodgeReady<0 || state.dodgeReady>(long)combatTick+36000)state.dodgeReady=0;
                combatStates.Add(state);
            }
        foreach (var entry in saved.kills ?? Array.Empty<StudioEquipEntry>())
            if (entry?.key != null) kills[entry.key] = entry.id ?? "";
        mapsDone.UnionWith(saved.cleared ?? Array.Empty<string>());
        storiesDone.UnionWith(saved.stories ?? Array.Empty<string>());
        rewards.UnionWith(saved.rewards ?? Array.Empty<string>());
        foreach (var entry in saved.bag ?? Array.Empty<StudioBagEntry>())
            if (entry != null && Item(entry.id) != null && entry.count > 0)
                bag[entry.id] = entry.count;
        foreach (var entry in saved.gear ?? Array.Empty<StudioEquipEntry>())
            if (entry?.key != null && bag.ContainsKey(entry.id))
                gear[entry.key] = entry.id;
        Enter(Project.Map(saved.map), false, true);
        SetCharacter(Project.Character(saved.actor), false);
        flow.Restore(saved.flags, saved.runRules, saved.mapRules);
        Health = Mathf.Clamp(saved.hp, 1, Actor.health);
        Warp(new Vector2(OriginX + Mathf.Clamp(saved.x, 1, Map.width - 1) * UnitX,
                         Mathf.Clamp(saved.y, 0, Mathf.Max(82, Map.height - 18)) * UnitY));
        Remaining = 0;
        foreach (var e in foes)
        {
            var memory =
                Array.Find(saved.foes ?? Array.Empty<StudioFoeMemory>(), v => v != null && v.id == e.id);
            if (memory != null)
            {
                e.target.RestoreHealth(memory.hp);
                e.stacks = Mathf.Clamp(memory.stacks, 0, Project.tuning.frostMax);
                Vector3 p = e.target.transform.position;
                p.x = OriginX + Mathf.Clamp(memory.x, 1, Map.width - 1) * UnitX;
                e.target.transform.position = p;
                e.frozenUntil = clock + memory.ice;
                e.slowUntil = clock + memory.slow;
            }
            bool alive = e.target.Health > 0;
            e.target.gameObject.SetActive(alive);
            if (alive)
                Remaining++;
        }
        if (!string.IsNullOrEmpty(saved.result))
        {
            Result = saved.result;
            Fire("clear");
        }
        SyncControls();
        return true;
    }
    private void OnApplicationPause(bool paused)
    {
        if (paused)
            SaveProgress();
    }
    private void OnApplicationQuit()
    {
        SaveProgress();
    }
    private void GrantRewards()
    {
        foreach (var q in Project.quests ?? Array.Empty<StudioQuest>())
        {
            bool complete = q.kind == "clear" ? mapsDone.Contains(q.target) : q.kind == "story" && storiesDone.Contains(q.target);
            if (q.kind == "kill" && q.goal > 0)
            {
                int count = 0;
                foreach (var tag in kills.Values) if (q.target == "*" || tag == q.target) count++;
                complete = count >= q.goal;
            }
            if (!complete || !rewards.Add(q.id))
                continue;
            bag.TryGetValue(q.reward, out int n);
            bag[q.reward] = Math.Min(999999, n + q.count);
        }
    }
    private int GearPower()
    {
        int total = 0;
        string prefix = Actor.id + ":";
        foreach (var p in gear)
            if (p.Key.StartsWith(prefix, StringComparison.Ordinal))
                total += Item(p.Value)?.power ?? 0;
        return total;
    }
    private bool ToggleGear(StudioItem item)
    {
        string key = Actor.id + ":" + item.slot;
        if (gear.TryGetValue(key, out var current) && current == item.id)
            return gear.Remove(key);
        int count = 0;
        foreach (var id in gear.Values)
            if (id == item.id)
                count++;
        if (!bag.TryGetValue(item.id, out var held) || held <= count)
            return false;
        gear[key] = item.id;
        return true;
    }
    internal void DrawProgressWidget(StudioWidget widget, Rect area, GUIStyle style)
    {
        string key = CurrentLayout.id + ":" + widget.id;
        widgetScroll.TryGetValue(key, out var scroll);
        bool inventory = widget.type == "inventory";
        int count = inventory ? bag.Count : (Project.quests?.Length ?? 0);
        if (count == 0)
        {
            GUI.Label(area, inventory ? "보유 장비 없음" : "등록된 의뢰 없음", style);
            return;
        }
        float line = Mathf.Max(32, (inventory ? screenView.ItemStyle(widget,style).fontSize : style.fontSize) * 2);
        float width = Mathf.Max(24, area.width - 18);
        widgetScroll[key] = GUI.BeginScrollView(area, scroll, new Rect(0, 0, width, count * line));
        int i = 0;
        if (inventory)
            foreach (var p in bag)
            {
                var item = Item(p.Key);
                if (item == null)
                    continue;
                gear.TryGetValue(Actor.id + ":" + item.slot, out var equipped);
                var old = Item(equipped);
                string label = item.name + " ×" + p.Value + " · " +
                               (equipped == item.id ? "장착 해제" : (old?.power ?? 0) + " → " + item.power);
                if (screenView.ItemButton(widget,new Rect(0, i++ * line, width, line), label, style,true))
                    ToggleGear(item);
            }
        else
            foreach (var q in Project.quests)
                GUI.Label(new Rect(0, i++ * line, width, line),
                          (rewards.Contains(q.id) ? "완료 · " : "진행 · ") + q.name, style);
        GUI.EndScrollView();
    }
    private Sprite GraphicsFor(string reference)
    {
        if (string.IsNullOrEmpty(reference))
            return null;
        var tex = Connection.Texture(reference);
        if (tex == null)
            return null;
        if (!sprites.TryGetValue(tex, out var sprite))
        {
            sprite = MakeSprite(tex);
            sprites[tex] = sprite;
        }
        return sprite;
    }
    private StudioClipPaint lastPaint;
    private void PaintMotion()
    {
        if (Actor?.motionClips == null || bodyImage == null)
            return;
        string pose = dodgeStart>=0                            ? "dodge"
                      : skill != null                            ? activeSkillKey
                      : slash.IsAttacking                      ? "attack"
                      : Mathf.Abs(body.linearVelocity.y) > .1f ? "jump"
                      : Mathf.Abs(body.linearVelocity.x) > .1f ? "run"
                                                               : "idle";
        int epoch = pose == "attack" ? slash.StudioSequence : motionEpoch;
        if (pose != lastPose || lastEpoch != epoch)
        {
            if(cuePlayer!=null&&cuePlayer.loop)cuePlayer.Stop();
            lastPose = pose;
            lastEpoch = epoch;
            poseStart = clock;
            playedCue=false;shownEffect=false;
        }
        int t = Mathf.Max(0, Mathf.RoundToInt((clock - poseStart) * 60));
        var clip = Array.Find(Actor.motionClips, v => v.key == pose);
        var sound = Connection.Sound(clip?.sound);
        string reference =
            string.IsNullOrEmpty(Actor.sprite) && Actor.id == "baekseol" ? "builtin-player" : Actor.sprite;
        if (clip?.frames != null && clip.frames.Length > 0)
        {
            int duration = 0;
            foreach (var frame in clip.frames)
                duration += Mathf.Max(1, frame.ticks);
            bool repeat=clip.paint?.repeat=="loop" || (clip.paint?.repeat!="once" && (pose=="idle" || pose=="run"));
            int at=repeat?t%duration:Math.Min(t,duration-1);
            foreach (var frame in clip.frames)
            {
                if (at < frame.ticks)
                {
                    reference = frame.image;
                    break;
                }
                at -= frame.ticks;
            }
        }
        var paint=clip?.paint;
        float scale=(paint?.scale??100)/100f;
        if (reference != lastSpriteRef || lastPaint!=paint)
        {
            var sprite = GraphicsFor(reference);
            if (sprite != null)
            {
                bodyImage.sprite = sprite;
                Fit(bodyImage,new Vector2(1.65f,2.3f)*scale,true);
                lastPaint=paint;
                lastSpriteRef = reference;
            }
        }
        bodyImage.transform.localPosition=new Vector3((.5f-(paint?.pivotX??50)/100f)*1.65f*scale*motor.Facing,
            ((paint?.pivotY??100)/100f-.5f)*2.3f*scale,0);
        if (clip!=null && !playedCue && t>=clip.SoundTick)
        {
            if(sound!=null){PlayAuthoredFx(ref cuePlayer,sound);playedCue=true;}
            else if(string.IsNullOrEmpty(clip.sound)){PlayCue(clip.cue);playedCue=true;}
        }
        if (clip!=null && !shownEffect && t>=clip.cueTick && t<clip.cueTick+clip.EffectTicks)
        {
            var sprite=GraphicsFor(clip.fx);
            if (sprite != null)
            {
                if (motionFx == null)
                    motionFx = Piece("Motion FX", body.position, new Vector2(2, 2), 25, Color.white);
                motionFx.sprite = sprite;
                Fit(motionFx, new Vector2(2, 2), true);
                motionFx.transform.position = body.position + new Vector2(motor.Facing * 1.2f, 1);
                motionFx.enabled = true;
                shownEffect=true;fxUntil=poseStart+(clip.cueTick+clip.EffectTicks)/60f;
            }
        }
        if (motionFx != null && clock >= fxUntil)
            motionFx.enabled = false;
    }
    private void PlayCue(string kind)
    {
        if (string.IsNullOrEmpty(kind))
            return;
        SoundChannel(ref cuePlayer);
        if (!tones.TryGetValue(kind, out var clip))
        {
            const int hz = 22050;
            var samples = new float[hz / 6];
            float phase = 0,
                  start = kind == "ice"    ? 1100
                          : kind == "bell" ? 620
                                           : 460,
                  end = kind == "bell" ? 600 : 170;
            for (int i = 0; i < samples.Length; i++)
            {
                float f = (float)i / samples.Length;
                phase += 2 * Mathf.PI * Mathf.Lerp(start, end, f) / hz;
                samples[i] = Mathf.Sin(phase) * .05f * (1 - f) * (1 - f);
            }
            clip = AudioClip.Create(kind, samples.Length, 1, hz, false);
            clip.SetData(samples, 0);
            tones[kind] = clip;
        }
        cuePlayer.PlayOneShot(clip, Mathf.Clamp01((Project.mix?.fx ?? 85) / 100f));
    }
}
}

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
    public StudioEquipEntry[] gear;
}
public sealed partial class StudioWorld
{
    private readonly Dictionary<string, StudioMapMemory> mapHistory =
        new Dictionary<string, StudioMapMemory>();
    private readonly HashSet<string> mapsDone = new HashSet<string>(), storiesDone = new HashSet<string>(),
                                     rewards = new HashSet<string>();
    private readonly Dictionary<string, int> bag = new Dictionary<string, int>();
    private readonly Dictionary<string, string> gear = new Dictionary<string, string>();
    private float nextProgressSave, poseStart;
    private int motionEpoch, lastEpoch;
    private string activeSkillKey, lastPose, lastSpriteRef;
    private bool playedCue;
    private SpriteRenderer motionFx;
    private float fxUntil;
    private AudioSource cuePlayer;
    private readonly Dictionary<string, AudioClip> tones = new Dictionary<string, AudioClip>();
    private readonly Dictionary<string, Vector2> widgetScroll = new Dictionary<string, Vector2>();
    private string SaveKey => "dreamwalker-player-v1:" + Project.startMap;
    private StudioItem Item(string id) => Array.Find(Project.items ?? Array.Empty<StudioItem>(),
                                                     v => v.id == id);

    private void ResetProgress()
    {
        mapHistory.Clear();
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
        if (!Running || Map == null || Health <= 0 || Story != null || skill != null || pendingExit != null ||
            (HasOverlay && string.IsNullOrEmpty(Result)))
            return false;
        RememberMap();
        var snapshot = new StudioPlayerSave {
            version = 1,
            hp = Health,
            x = (body.position.x - OriginX) / UnitX,
            y = body.position.y / UnitY,
            map = Map.id,
            actor = Actor.id,
            result = Result,
            flags = flow.Flags,
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
            if (!(q.kind == "clear" ? mapsDone : storiesDone).Contains(q.target) || !rewards.Add(q.id))
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
        float line = Mathf.Max(32, style.fontSize * 2);
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
                if (GUI.Button(new Rect(0, i++ * line, width, line), label))
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
    private void PaintMotion()
    {
        if (Actor?.motionClips == null || bodyImage == null)
            return;
        string pose = skill != null                            ? activeSkillKey
                      : slash.IsAttacking                      ? "attack"
                      : Mathf.Abs(body.linearVelocity.y) > .1f ? "jump"
                      : Mathf.Abs(body.linearVelocity.x) > .1f ? "run"
                                                               : "idle";
        int epoch = pose == "attack" ? slash.StudioSequence : motionEpoch;
        if (pose != lastPose || lastEpoch != epoch)
        {
            lastPose = pose;
            lastEpoch = epoch;
            poseStart = clock;
            playedCue = false;
        }
        int t = Mathf.Max(0, Mathf.RoundToInt((clock - poseStart) * 60));
        var clip = Array.Find(Actor.motionClips, v => v.key == pose);
        string reference =
            string.IsNullOrEmpty(Actor.sprite) && Actor.id == "baekseol" ? "builtin-player" : Actor.sprite;
        if (clip?.frames != null && clip.frames.Length > 0)
        {
            int duration = 0;
            foreach (var frame in clip.frames)
                duration += Mathf.Max(1, frame.ticks);
            int at = pose == "idle" || pose == "run" ? t % duration : Math.Min(t, duration - 1);
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
        if (reference != lastSpriteRef)
        {
            var sprite = GraphicsFor(reference);
            if (sprite != null)
            {
                bodyImage.sprite = sprite;
                Fit(bodyImage, new Vector2(1.65f, 2.3f), true);
                lastSpriteRef = reference;
            }
        }
        if (clip != null && !playedCue && t >= clip.cueTick)
        {
            playedCue = true;
            PlayCue(clip.cue);
            var sprite = GraphicsFor(clip.fx);
            if (sprite != null)
            {
                if (motionFx == null)
                    motionFx = Piece("Motion FX", body.position, new Vector2(2, 2), 25, Color.white);
                motionFx.sprite = sprite;
                Fit(motionFx, new Vector2(2, 2), true);
                motionFx.transform.position = body.position + new Vector2(motor.Facing * 1.2f, 1);
                motionFx.enabled = true;
                fxUntil = clock + .12f;
            }
        }
        if (motionFx != null && clock >= fxUntil)
            motionFx.enabled = false;
    }
    private void PlayCue(string kind)
    {
        if (string.IsNullOrEmpty(kind))
            return;
        if (cuePlayer == null)
            cuePlayer = gameObject.AddComponent<AudioSource>();
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
        cuePlayer.PlayOneShot(clip);
    }
}
}

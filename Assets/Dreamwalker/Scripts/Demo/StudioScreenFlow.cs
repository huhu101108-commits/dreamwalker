using System;
using System.Collections.Generic;

namespace Dreamwalker.Demo
{
[Serializable]
public class StudioRule
{
    public string id, mapId, actorId, key, flag, once;
    public string @event;
    public bool flagState;
    public int priority, threshold;
    public float seconds;
}
[Serializable]
public class StudioAction
{
    public string action, target, flag;
    public bool flagState;
}
internal sealed class StudioScreenFlow
{
    private readonly List<string> layers = new List<string>();
    private readonly HashSet<string> flags = new HashSet<string>();
    private readonly HashSet<string> onceGame = new HashSet<string>();
    private readonly HashSet<string> onceMap = new HashSet<string>();
    public int Depth => layers.Count;
    public string Top => layers.Count == 0 ? "" : layers[layers.Count - 1];

    public string[] Flags => new List<string>(flags).ToArray();
    public string[] RunRules => new List<string>(onceGame).ToArray();
    public string[] MapRules => new List<string>(onceMap).ToArray();
    public void Restore(string[] f,string[] run,string[] map)
    {
        flags.Clear(); onceGame.Clear(); onceMap.Clear();
        flags.UnionWith(f ?? Array.Empty<string>()); onceGame.UnionWith(run ?? Array.Empty<string>());
        onceMap.UnionWith(map ?? Array.Empty<string>()); layers.Clear();
    }
    public void EnterMap()
    {
        layers.Clear();
        onceMap.Clear();
    }
    public void CloseAll() => layers.Clear();
    public void Back()
    {
        if (layers.Count > 0)
            layers.RemoveAt(layers.Count - 1);
    }
    public void Flag(string name, bool value)
    {
        if (value)
            flags.Add(name);
        else
            flags.Remove(name);
    }
    public bool Matches(string name, bool value) => string.IsNullOrEmpty(name) || flags.Contains(name) == value;
    public void Open(string id)
    {
        if (id == Top)
            return;
        if (layers.Count == 32)
            layers.RemoveAt(0);
        layers.Add(id);
    }

    public bool Fire(StudioProject project, string map, string actor, string signal, string key, float hp,
                     float previous, float clock)
    {
        StudioRule best = null;
        StudioLayout destination = null;
        string token = "";
        HashSet<string> seen = null;
        foreach (var l in project.layouts)
        {
            if (l.rules == null)
                continue;
            foreach (var r in l.rules)
            {
                if (r.@event != signal || (!string.IsNullOrEmpty(r.mapId) && r.mapId != map) ||
                    (!string.IsNullOrEmpty(r.actorId) && r.actorId != actor) ||
                    (!string.IsNullOrEmpty(r.key) && r.key != key) || !Matches(r.flag, r.flagState) ||
                    (signal == "elapsed" && (previous >= r.seconds || clock < r.seconds)) ||
                    (signal == "lowHp" && (previous <= r.threshold || hp > r.threshold)))
                    continue;
                string id = l.id + ":" + r.id;
                var used = r.once == "run" ? onceGame : r.once == "map" ? onceMap : null;
                if ((used != null && used.Contains(id)) || (best != null && best.priority >= r.priority))
                    continue;
                best = r;
                destination = l;
                token = id;
                seen = used;
            }
        }
        if (destination == null)
            return false;
        seen?.Add(token);
        Open(destination.id);
        return true;
    }
}
}

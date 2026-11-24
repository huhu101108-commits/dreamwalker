using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace Dreamwalker.Demo
{
// Languages packed by the studio (packLocale in model.js): one key list and, per language, texts in the same order.
// An empty text falls back to the base language.
[Serializable]
public class StudioLocale
{
    public string @base, baseName;
    public string[] keys;
    public StudioLocaleLanguage[] languages;
    public StudioLocaleWord[] system;
}
[Serializable] public class StudioLocaleLanguage { public string code, name; public string[] values; }
[Serializable] public class StudioLocaleWord { public string key, text; }

// Writes one language into the loaded project: the same fields the studio's localizeWorld writes, so every screen keeps
// reading the fields it always read. Each field's base text is kept, so any language can follow. The keys match
// textSlots in model.js (scripts/native-check/locale.json); the game's own wording is in StudioSystemText.
public static class StudioLocalization
{
    private sealed class Slot
    {
        public string key, original;
        public Func<string> get;
        public Action<string> set;
    }
    private static StudioProject applied;
    private static List<Slot> slots;
    private static readonly Dictionary<string, string> words = new Dictionary<string, string>();
    private static readonly Dictionary<string, string> reworded = new Dictionary<string, string>();
    public static string Current { get; private set; } = "ko";

    public static string Base(StudioProject p) => string.IsNullOrEmpty(p?.locale?.@base) ? "ko" : p.locale.@base;
    public static List<string> Codes(StudioProject p)
    {
        var codes = new List<string> { Base(p) };
        if (p?.locale?.languages != null)
            foreach (var l in p.locale.languages)
                if (!string.IsNullOrEmpty(l?.code) && !codes.Contains(l.code)) codes.Add(l.code);
        return codes;
    }
    public static string Name(StudioProject p, string code)
    {
        if (code == Base(p) && !string.IsNullOrEmpty(p?.locale?.baseName)) return p.locale.baseName;
        var lang = p?.locale?.languages == null ? null : Array.Find(p.locale.languages, l => l.code == code);
        if (!string.IsNullOrEmpty(lang?.name)) return lang.name;
        return code == "ko" ? "한국어" : code;
    }
    // The game's wording for a built-in text: this language's translation, the creator's base rewording, the default.
    public static string Text(string name)
    {
        if (words.TryGetValue("system/" + name, out string t)) return t;
        if (reworded.TryGetValue(name, out t)) return t;
        return StudioSystemText.Default(name);
    }
    public static string Apply(StudioProject p, string code)
    {
        if (p == null) return Current;
        if (!ReferenceEquals(applied, p))
        {
            applied = p;
            slots = Enumerate(p);
            foreach (var s in slots) s.original = s.get();
        }
        var codes = Codes(p);
        if (!codes.Contains(code)) code = Base(p);
        words.Clear();
        reworded.Clear();
        var loc = p.locale;
        if (loc?.system != null)
            foreach (var w in loc.system)
                if (!string.IsNullOrEmpty(w?.key) && !string.IsNullOrEmpty(w.text)) reworded[w.key] = w.text;
        var lang = code == Base(p) || loc?.languages == null ? null : Array.Find(loc.languages, l => l.code == code);
        if (lang?.values != null && loc.keys != null)
            for (int i = 0; i < loc.keys.Length && i < lang.values.Length; i++)
                if (!string.IsNullOrEmpty(lang.values[i])) words[loc.keys[i]] = lang.values[i];
        string name = Name(p, code);
        foreach (var s in slots)
        {
            string v = words.TryGetValue(s.key, out string t) ? t : s.original;
            s.set(v.Contains("{언어}") ? v.Replace("{언어}", name) : v);
        }
        Current = code;
        return code;
    }
    // The first wanted language the game has: exact code, Chinese script by region, then the same main language.
    public static string Pick(IList<string> codes, IEnumerable<string> wanted)
    {
        foreach (string raw in wanted)
        {
            if (string.IsNullOrEmpty(raw)) continue;
            string w = raw.Replace('_', '-'), lower = w.ToLowerInvariant();
            string script = Regex.IsMatch(w, @"^zh-(?:hant|tw|hk|mo)\b", RegexOptions.IgnoreCase) ? "zh-Hant"
                : Regex.IsMatch(w, @"^zh-(?:hans|cn|sg)\b", RegexOptions.IgnoreCase) ? "zh-Hans" : "";
            foreach (string c in codes) if (c.ToLowerInvariant() == lower) return c;
            foreach (string c in codes) if (c == script) return c;
            string main = lower.Split('-')[0];
            foreach (string c in codes) if (c.ToLowerInvariant().Split('-')[0] == main) return c;
        }
        return codes.Count > 0 ? codes[0] : "ko";
    }
    // Key and base text of every translatable field, in the studio's order (for the parity check).
    internal static List<KeyValuePair<string, string>> Keys(StudioProject p)
    {
        var list = new List<KeyValuePair<string, string>>();
        foreach (var s in Enumerate(p)) list.Add(new KeyValuePair<string, string>(s.key, s.get()));
        return list;
    }
    private static List<Slot> Enumerate(StudioProject p)
    {
        var list = new List<Slot>();
        void Add(string key, Func<string> get, Action<string> set)
        {
            string v = get();
            if (!string.IsNullOrEmpty(v) && v.Trim().Length > 0) list.Add(new Slot { key = key, get = get, set = set });
        }
        Add("title", () => p.title, v => p.title = v);
        foreach (var c in p.characters ?? Array.Empty<StudioCharacter>())
        {
            string k = "character/" + c.id + "/";
            Add(k + "name", () => c.name, v => c.name = v);
            Add(k + "region", () => c.region, v => c.region = v);
            Add(k + "summary", () => c.summary, v => c.summary = v);
            foreach (var e in c.profile ?? Array.Empty<StudioProfileEntry>())
                Add(k + "profile/" + e.id, () => e.value, v => e.value = v);
            var skills = c.skills ?? Array.Empty<StudioSkill>();
            for (int i = 0; i < skills.Length; i++)
            {
                var s = skills[i];
                Add(k + "skill/" + i + "/name", () => s.name, v => s.name = v);
                if (s.cast == null) continue;
                Add(k + "skill/" + i + "/caption", () => s.cast.caption, v => s.cast.caption = v);
                Add(k + "skill/" + i + "/line", () => s.cast.line, v => s.cast.line = v);
            }
            foreach (var e in c.roadmap?.episodes ?? Array.Empty<StudioEpisode>())
            {
                string ek = k + "episode/" + e.id + "/";
                Add(ek + "title", () => e.title, v => e.title = v);
                Add(ek + "summary", () => e.summary, v => e.summary = v);
                var links = e.links ?? Array.Empty<StudioChoice>();
                for (int i = 0; i < links.Length; i++)
                {
                    var l = links[i];
                    Add(ek + "link/" + i, () => l.label, v => l.label = v);
                }
            }
        }
        foreach (var m in p.scenes ?? Array.Empty<StudioMap>())
        {
            Add("map/" + m.id + "/name", () => m.name, v => m.name = v);
            foreach (var o in m.objects ?? Array.Empty<StudioObject>())
                if (o.type == "enemy" || o.type == "prop")
                    Add("map/" + m.id + "/object/" + o.id + "/label", () => o.label, v => o.label = v);
        }
        foreach (var s in p.stories ?? Array.Empty<StudioStory>())
        {
            Add("story/" + s.id + "/name", () => s.name, v => s.name = v);
            foreach (var n in s.nodes ?? Array.Empty<StudioLine>())
            {
                string k = "story/" + s.id + "/line/" + n.id + "/";
                Add(k + "text", () => n.text, v => n.text = v);
                Add(k + "speaker", () => n.speakerName, v => n.speakerName = v);
                Add(k + "next", () => n.nextLabel, v => n.nextLabel = v);
                var choices = n.choices ?? Array.Empty<StudioChoice>();
                for (int i = 0; i < choices.Length; i++)
                {
                    var c = choices[i];
                    Add(k + "choice/" + i, () => c.label, v => c.label = v);
                }
                foreach (var l in n.shot?.layers ?? Array.Empty<StudioShotLayer>())
                    if (l.kind == "caption") Add(k + "layer/" + l.id, () => l.caption, v => l.caption = v);
            }
        }
        var layouts = p.layouts ?? Array.Empty<StudioLayout>();
        foreach (var l in layouts) Add("screen/" + l.id + "/name", () => l.name, v => l.name = v);
        foreach (var l in layouts)
            foreach (var w in l.elements ?? Array.Empty<StudioWidget>())
            {
                string k = "screen/" + l.id + "/" + w.id + "/";
                Add(k + "text", () => w.text, v => w.text = v);
                var spec = w.control;
                if (w.type != "input" || spec == null) continue;
                Add(k + "hint", () => spec.hint, v => spec.hint = v);
                if (spec.validation != null) Add(k + "message", () => spec.validation.message, v => spec.validation.message = v);
                if (spec.mode != "choice" || spec.options == null) continue;
                // A choice stores the creator's original value; only the label on screen changes with the language.
                if (spec.labels == null || spec.labels.Length != spec.options.Length) spec.labels = (string[])spec.options.Clone();
                var shown = spec.labels;
                for (int i = 0; i < shown.Length; i++)
                {
                    int at = i;
                    Add(k + "option/" + i, () => shown[at], v => shown[at] = v);
                }
            }
        foreach (var it in p.items ?? Array.Empty<StudioItem>()) Add("item/" + it.id + "/name", () => it.name, v => it.name = v);
        foreach (var q in p.quests ?? Array.Empty<StudioQuest>()) Add("quest/" + q.id + "/name", () => q.name, v => q.name = v);
        return list;
    }
}
}

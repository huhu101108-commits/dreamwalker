using System;

namespace Dreamwalker.Demo
{
// Field names mirror the versioned JSON saved by the tablet editor.
[Serializable]
public class StudioRelease
{
    public int rev;
    public string contentDigest;
    public StudioProject project;
}
[Serializable]
public class StudioProject
{
    public int schema;
    public string title, startMap, saveId, customJson;
    public StudioLocale locale;
    public StudioShop shop;
    public bool authoredKeysOnly;
    public StudioTuning tuning;
    public StudioMix mix;
    public StudioMap[] scenes;
    public StudioCharacter[] characters;
    public StudioStory[] stories;
    public StudioLayout[] layouts;
    public StudioFrontScreens frontScreens;
    public StudioItem[] items;
    public StudioQuest[] quests;
    public int combatContract;
    public StudioCombatRule[] combatRules;
    public StudioEventRule[] eventRules;
    public StudioMap Map(string id) => Array.Find(scenes, v => v.id == id);
    public StudioCharacter Character(string id) => Array.Find(characters, v => v.id == id);
    public StudioStory Story(string id) => Array.Find(stories, v => v.id == id);
    public StudioLayout Layout(string id) => Array.Find(layouts, v => v.id == id);
}
[Serializable]
public class StudioMix
{
    public string musicMode,voiceMode,fxMode;
    public float music = 65, voice = 100, fx = 85;
}
[Serializable]
public class StudioFrontScreens
{
    public string title, roster, loading, entry, home, inventory, settings;
    public float seconds = .8f;
}
[Serializable]
public class StudioTuning
{
    public float runSpeed, jumpSpeed, dashSpeed, dashDuration, reach;
    public int startupTicks, activeTicks, recoveryTicks;
    public int damage, hp, frostMax, flurry, shadow, ultHits;
    public float slow, freeze, afterSlow, radius, bonus, interval, shadowRange;
    public float dashPower, flurryPower, flurryFinal, shadowPower, ultPower, ultFinal;
    public float dashCd, flurryCd, shadowCd, ultCd;
    public float Cooldown(string kind)
    {
        switch (kind)
        {
        case "dash":
            return dashCd;
        case "flurry":
            return flurryCd;
        case "shadow":
            return shadowCd;
        case "nova":
            return ultCd;
        default:
            return 1;
        }
    }
}
[Serializable]
public class StudioCharacter
{
    public string id, name, region, summary, color, sprite, portrait, passive;
    // locked: joins the roster from a pull or a reward (상점 · 뽑기), not at the start.
    public bool locked;
    public int health;
    public float speedScale, jumpScale, attackScale, reachScale;
    public StudioSkill[] skills;
    public StudioRoadmap roadmap;
    public StudioClip[] motionClips;
    public StudioStrike strike;
    public StudioDodge dodge;
    public StudioExpression[] expressions;
    public StudioProfileEntry[] profile;
    public StudioEnergy energy;
    public StudioFaceMotion faceMotion;
    public bool HasEnergy => energy != null && energy.max > 0;
    public string ExpressionImage(string id)
    {
        if (string.IsNullOrEmpty(id) || expressions == null) return "";
        foreach (var x in expressions) if (x != null && x.id == id) return x.image ?? "";
        return "";
    }
    // Same order as the studio: chosen expression, dialogue portrait, sprite, then the first expression with art.
    public string Face(string expression = "")
    {
        string chosen = ExpressionImage(expression);
        if (!string.IsNullOrEmpty(chosen)) return chosen;
        if (!string.IsNullOrEmpty(portrait)) return portrait;
        if (!string.IsNullOrEmpty(sprite)) return sprite;
        if (expressions != null) foreach (var x in expressions) if (!string.IsNullOrEmpty(x?.image)) return x.image;
        return "";
    }
    // The face a line or cast layer shows, with its eyes-closed and speaking pictures (the studio's faceSet).
    public string FaceSet(string expression, out string blink, out string talk)
    {
        blink = talk = "";
        if (!string.IsNullOrEmpty(expression) && expressions != null)
            foreach (var x in expressions)
                if (x != null && x.id == expression && !string.IsNullOrEmpty(x.image)) { blink = x.blink ?? ""; talk = x.talk ?? ""; return x.image; }
        string main = !string.IsNullOrEmpty(portrait) ? portrait : sprite;
        if (!string.IsNullOrEmpty(main)) { blink = faceMotion?.blink ?? ""; talk = faceMotion?.talk ?? ""; return main; }
        if (expressions != null)
            foreach (var x in expressions)
                if (!string.IsNullOrEmpty(x?.image)) { blink = x.blink ?? ""; talk = x.talk ?? ""; return x.image; }
        // With no art of its own the character shows the built-in picture, which the default variants still serve.
        blink = faceMotion?.blink ?? ""; talk = faceMotion?.talk ?? "";
        return "";
    }
    // {프로필:항목} shows this character's value; an unknown item shows nothing.
    public string ProfileText(string text)
    {
        if (string.IsNullOrEmpty(text) || !text.Contains("{프로필:")) return text;
        return System.Text.RegularExpressions.Regex.Replace(text, @"\{프로필:([^{}:\n\r]{1,20})\}", m =>
        {
            if (profile != null) foreach (var p in profile) if (p != null && p.label == m.Groups[1].Value) return p.value ?? "";
            return "";
        });
    }
}
[Serializable] public class StudioExpression { public string id, name, image, blink, talk; }
// Breathing level 0-3 and the default portrait's eyes-closed and speaking pictures.
[Serializable] public class StudioFaceMotion { public int breathe; public string blink, talk; }
// Portrait motion with the studio's numbers (model.js portraitPose, motionSeed), checked against one table by both sides.
public static class StudioPortraitMotion
{
    public const int Breath = 3200, BlinkEvery = 4000, BlinkHold = 130, TalkStep = 120;
    private static readonly double[] Breathe = { 0, .006, .012, .02 };
    // FNV-1a over UTF-16 code units, so characters on screen together blink at different moments.
    public static uint Seed(string id)
    {
        uint h = 2166136261;
        foreach (char ch in id ?? "") { h ^= ch; h = unchecked(h * 16777619); }
        return h;
    }
    // clock in milliseconds; revealing while the line's text is still appearing. Blink wins over talk.
    public static string Pose(int level, bool hasBlink, bool hasTalk, double clock, bool revealing, uint seed, out double scale)
    {
        long t = Math.Max(0, (long)Math.Floor(clock)), phase = seed % BlinkEvery;
        string pose = hasBlink && (t + phase) % BlinkEvery < BlinkHold ? "blink" : hasTalk && revealing && t / TalkStep % 2 == 0 ? "talk" : "base";
        double amp = level >= 0 && level < Breathe.Length ? Breathe[level] : 0;
        scale = amp > 0 ? 1 + amp * Math.Sin(2 * Math.PI * ((t + phase) % Breath) / Breath) : 1;
        return pose;
    }
}
[Serializable] public class StudioProfileEntry { public string id, label, value; }
[Serializable] public class StudioEnergy { public int max, start, hit, hurt, kill; }
[Serializable]
public class StudioSkillCast
{
    public bool cutin, freeze;
    public int ticks;
    public string image, color, caption, line, voice;
}
[Serializable]
public class StudioSkill
{
    public string name, mechanic;
    public float power, cooldown;
    public StudioStep[] steps;
    public int cost;
    public StudioSkillCast cast;
    public bool HasCast => cast != null && cast.ticks > 0;
}
// A skill's cut-in clock, in field ticks. A freezing cut-in holds the field for exactly its authored ticks.
public sealed class StudioCastClock
{
    public StudioCharacter actor { get; private set; }
    public StudioSkill skill { get; private set; }
    public int age { get; private set; }
    public int ticks { get; private set; }
    public bool freeze { get; private set; }
    public int serial { get; private set; }
    public bool Active => skill != null;
    public bool ShowsCutIn => skill != null && ticks > 0;
    public float Progress => ticks > 0 ? Math.Min(1f, (float)age / ticks) : 1f;
    public void Begin(StudioCharacter who, StudioSkill used)
    {
        actor = who; skill = used; age = 0; serial++;
        ticks = used.cast.cutin ? used.cast.ticks : 0;
        freeze = used.cast.cutin && used.cast.freeze;
    }
    // Returns true while the field must hold during this tick.
    public bool Step()
    {
        if (skill == null) return false;
        if (age < ticks) { age++; return freeze; }
        Clear();
        return false;
    }
    public void Clear() { actor = null; skill = null; age = ticks = 0; freeze = false; }
}
[Serializable]
public class StudioStep
{
    public string kind;
    public float value, range;
}
[Serializable]
public class StudioEnemy
{
    public string style, tag;
    public float hurtWidth=.7f,hurtHeight=1.6f;
    public int windup = 18, recovery = 30, phase = 50;
    public int health, damage = 8;
    public float speed = 3.3f, sight = 28, reach = 3, interval = .8f;
}
[Serializable]
public class StudioMap
{
    public string id, name, theme, backdrop, characterId, hudId, menuId, dialogueId, entryStory, exitStory, floorMode, sky, music;
    public int width, height = 100;
    public StudioCamera camera;
    public bool requireClear;
    public StudioObject[] objects;
}
[Serializable] public class StudioCameraFrame { public float zoom=1,left,right=100,bottom,top=100; public int fadeTicks; public string fadeColor="#000000"; }
[Serializable]
public class StudioCamera
{
    public float follow = 5, deadX = 6, deadY = 8, parallax = .18f, drift;
    public StudioCameraFrame frame;
}
[Serializable]
public class StudioMotion
{
    public float dx, dy, period = 4;
}
[Serializable]
public class StudioObject
{
    public string id, type, to, storyId, label, image, eventKey, tint;
    public float x, y, width, height;
    public int tileSize;
    public StudioEnemy enemy;
    public StudioMotion motion;
}
[Serializable]
public class StudioStory
{
    public string id, name;
    public StudioLine[] nodes;
}
[Serializable]
public class StudioLine
{
    public string id, speaker, text, speakerName, side, portrait, backdrop, layout, nextLabel, voice, expression;
    public StudioChoice[] choices;
    public StudioShot shot;
    public StudioStageTrack stageTrack;
}
[Serializable]
public class StudioStageCue { public string id, kind, target, sound, key; public int at; public float dx,dy; public bool on; }
[Serializable]
public class StudioStageTrack
{
    public int rate, autoTick;
    public bool completeOnSkip;
    public string skipTo;
    public StudioStageCue[] cues;
    // speed: the player's typing speed in percent of the authored speed.
    public string Visible(string text,int tick,int speed=100){
        if(rate<=0 || string.IsNullOrEmpty(text))return text;
        int count=(int)Math.Min(int.MaxValue,(long)tick*rate*speed/6000),index=0;
        while(index<text.Length && count-->0)index+=char.IsSurrogatePair(text,index)?2:1;
        return text.Substring(0,index);
    }
    public StudioStageTrack WithPrefix(string prefix){
        return new StudioStageTrack{rate=rate,autoTick=autoTick,completeOnSkip=completeOnSkip,skipTo=string.IsNullOrEmpty(skipTo)?"":prefix+skipTo,cues=cues};
    }
    public int Destination(StudioStory story){
        if(string.IsNullOrEmpty(skipTo))return -1;
        return Array.FindIndex(story.nodes,n=>n.id==skipTo);
    }
}
public sealed class StudioStageClock
{
    private StudioStageCue[] cues=Array.Empty<StudioStageCue>();
    private int next;
    public float ticks { get; private set; }
    public StudioLine line { get; private set; }
    public void Reset(StudioLine value){
        line=value;ticks=0;next=0;
        cues=value?.stageTrack?.cues==null?Array.Empty<StudioStageCue>():System.Linq.Enumerable.ToArray(System.Linq.Enumerable.OrderBy(value.stageTrack.cues,c=>c.at));
    }
    public bool Step(float dt,Action<StudioStageCue> emit){
        var t=line?.stageTrack;if(t==null)return false;
        ticks+=Math.Max(0,dt)*60;
        while(next<cues.Length && cues[next].at<=ticks+.0001f)emit(cues[next++]);
        return t.autoTick>0 && ticks+.0001f>=t.autoTick && line.choices.Length==0;
    }
    public void Finish(Action<StudioStageCue> emit){
        if(line?.stageTrack?.completeOnSkip!=true)return;
        for(int i=next;i<cues.Length;i++)if(cues[i].kind=="flag")emit(cues[i]);
    }
}
[Serializable]
public class StudioShot
{
    public StudioShotLayer[] layers;
    public bool focus;
}
[Serializable]
public class StudioShotLayer
{
    public string id, kind, title, image, caption, color, fill, align, fit, actor, expression;
    public float x, y, w, h, opacity, fillOpacity, size, radius;
    public int columns;
    public bool visible, locked, flip;
    public StudioChoiceSlot[] slots;
    public bool manualChoices;
    public StudioChoiceSlot Slot(int count,int index){
        if(slots!=null)foreach(var s in slots)if(s.index==index)return s;
        int cols=ChoiceColumns(count), rows=(count+cols-1)/cols;
        return new StudioChoiceSlot{index=index,x=index%cols*100f/cols+1,y=index/cols*100f/rows+1,w=100f/cols-2,h=100f/rows-2,
            fill=fill,color=color,press="#36656e",radius=radius};
    }
    public int ChoiceColumns(int count) => Math.Max(1, Math.Min(Math.Min(4, columns), count));
}
[Serializable]
public class StudioChoiceSlot { public int index; public float x,y,w,h,radius; public string fill,color,press; }
[Serializable]
public class StudioChoice
{
    public string label, to, flag;
    public bool on;
}
[Serializable]
public class StudioLayout
{
    // music: played instead of the map's music while this screen shows (a title or home screen).
    public string id, name, kind, purpose, tint, skin, music;
    public float shade;
    public bool pauseGame;
    public StudioRule[] rules;
    public StudioWidget[] elements;
    public StudioNavigation navigation;
}
[Serializable]
public class StudioWidget
{
    public string id, type, text, action, target, image, color, background, align;
    public float x, y, w, h, opacity;
    public int fontSize;
    public float radius, borderWidth;
    public string borderColor, pressedColor, imageFit, showFlag, enableFlag, shape;
    public StudioVertex[] points;
    public StudioControlSpec control;
    public StudioStickStyle stick;
    public StudioItemSkin itemSkin;
    public string shortcut, fontFamily;
    public StudioAnchor anchor;
    public StudioButtonStates states;
    public StudioGesture gesture;
    public bool hotspot, meter;
    public bool showValue, enableValue;
    public StudioAction[] steps;
    public bool visible;
}
}

namespace Dreamwalker.Demo
{
[Serializable] public class StudioNavigation {public string next,back,resume;public string Route(string action) => action=="next"?next:action=="back"?back:action=="resume"?resume:null;}
[Serializable] public class StudioGesture {public string phase;public int pad,ms;public bool cancelOutside;}
public sealed class StudioInputGestureClock
{
    private sealed class Pending { public string group; public StudioGesture spec; public long time; public bool fired; public Action fire; }
    private readonly System.Collections.Generic.Dictionary<string,Pending> held=new System.Collections.Generic.Dictionary<string,Pending>();
    private readonly System.Collections.Generic.Dictionary<string,long> taps=new System.Collections.Generic.Dictionary<string,long>();
    private static void Emit(Pending p){if(!p.fired){p.fired=true;p.fire();}}
    public bool Active(string key)=>held.ContainsKey(key);
    public void Down(string key,string group,StudioGesture s,long now,Action fire){
        if(held.ContainsKey(key))return;
        var p=new Pending{group=group,spec=s,time=now,fire=fire};held.Add(key,p);
        if(s.phase=="press")Emit(p);
        if(s.phase=="double"){if(taps.TryGetValue(group,out long before)&&now-before<=s.ms){taps.Remove(group);Emit(p);}}
    }
    public void Tick(string key,long now){if(held.TryGetValue(key,out var p)&&p.spec.phase=="hold"&&now-p.time>=p.spec.ms)Emit(p);}
    public void End(string key,long now,bool cancel=false){
        if(!held.TryGetValue(key,out var p))return;held.Remove(key);
        if(cancel){taps.Remove(p.group);return;}
        if(p.spec.phase=="double"&&!p.fired&&now-p.time<=p.spec.ms)taps[p.group]=now;
        if(p.spec.phase=="release"||(p.spec.phase=="hold"&&now-p.time>=p.spec.ms))Emit(p);
    }
    public void Clear(){held.Clear();taps.Clear();}
}
[Serializable] public class StudioButtonStates {public string selected,disabled,flag,selectedMark,disabledMark;}
[Serializable] public class StudioAnchor
{
    public string horizontal,vertical;
    public float dx,dy;
    public static float Resolve(string axis,float delta,float extent,float size,float fallback,float scale){
        if(string.IsNullOrEmpty(axis)||axis=="free"||extent<=0)return fallback;
        float d=delta*scale*100/extent;
        float result=axis=="center"?(100-size)*.5f+d:axis=="right"||axis=="bottom"?100-size-d:d;
        return Math.Max(0,Math.Min(100-size,result));
    }
}
[Serializable] public class StudioItemSkin { public string color,fill,press,edge; public float radius,width; public int size; }
[Serializable] public class StudioStickStyle { public int thumb, dead; public string knob, ring; }
[Serializable] public class StudioTextValidation {public int minLength;public string format,message;}
[Serializable] public class StudioControlSpec
{
    // setting: a player setting of the device this control stands for (music, fx, voice, mute, textSpeed, autoAdvance).
    public string mode, key, hint, initial, signal, setting;
    public StudioTextValidation validation;
    public int limit, min, max, step;
    public string[] options;
    // Display labels of a choice in the current language, set by StudioLocalization; the stored value stays options[i].
    public string[] labels;
    public string Label(string value)
    {
        int at = options == null ? -1 : Array.IndexOf(options, value);
        return at >= 0 && labels != null && at < labels.Length ? labels[at] : value;
    }
    public string Value(string raw)
    {
        raw = raw ?? "";
        if(mode=="text"){
            string text=raw.Substring(0,Math.Min(raw.Length,Math.Max(0,limit)));
            if(validation!=null){
                if(text.Trim().Length<validation.minLength)return null;
                if(text.Length>0&&validation.format=="digits"&&!System.Text.RegularExpressions.Regex.IsMatch(text,@"^[0-9]+\z"))return null;
                if(text.Length>0&&validation.format=="word"&&!System.Text.RegularExpressions.Regex.IsMatch(text,@"^[A-Za-z0-9_가-힣-]+\z"))return null;
            }
            return text;
        }
        if (mode == "toggle") return raw == "true" || raw == "false" ? raw : null;
        if (mode == "choice") return options != null && Array.IndexOf(options,raw) >= 0 ? raw : null;
        if (step < 1 || max < min || !System.Text.RegularExpressions.Regex.IsMatch(raw, @"^[+-]?[0-9]{1,9}\z") ||
            !int.TryParse(raw,System.Globalization.NumberStyles.AllowLeadingSign,System.Globalization.CultureInfo.InvariantCulture,out int num)) return null;
        int bound = Math.Max(min, Math.Min(max, num)), count = (max-min)/step;
        int tick = Math.Min(count,(int)Math.Floor((bound-min)/(double)step+.5));
        return (min+tick*step).ToString(System.Globalization.CultureInfo.InvariantCulture);
    }
    public string Name(string screen, string widget) => string.IsNullOrEmpty(key) ? screen + "/" + widget : key;
}
[Serializable] public class StudioVertex { public float x, y; }
internal static class StudioOutline
{
    public static bool Contains(StudioWidget w, float x, float y, float aspect)
    {
        if (x < 0 || y < 0 || x > 1 || y > 1) return false;
        float dx = Math.Abs(x - .5f) * 2, dy = Math.Abs(y - .5f) * 2;
        if (w.shape == "round") return dx * dx + dy * dy <= 1;
        if (w.shape == "diamond") return dx + dy <= 1;
        if (w.shape == "hex") return dx + .4f * dy <= 1;
        if (w.shape == "pill")
        {
            if (aspect >= 1) dx = Math.Max(0, dx * aspect - (aspect - 1));
            else dy = Math.Max(0, dy / aspect - (1 / aspect - 1));
            return dx * dx + dy * dy <= 1;
        }
        if (w.shape != "custom" || w.points == null || w.points.Length < 3) return true;
        var points = w.points;
        bool inside = false;
        x *= 100; y *= 100;
        for (int i = 0, j = points.Length - 1; i < points.Length; j = i++)
        {
            var a = points[i]; var b = points[j];
            if ((a.y > y) != (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x)
                inside = !inside;
        }
        return inside;
    }
}
[Serializable] public class StudioItem { public string id, name, slot; public int power; }
// rewardKind: "currency" pays the shop currency reward names; otherwise reward is an item.
[Serializable] public class StudioQuest { public string id, name, kind, target, reward, rewardKind; public int count, goal; }
[Serializable] public class StudioClip {
    public string key,fx,cue,sound; public int cueTick;
    public StudioFrame[] frames; public StudioClipPaint paint; public StudioClipMarkers markers;
    public int SoundTick=>markers?.soundTick??cueTick;
    public int EffectTicks=>Math.Max(1,markers?.effectTicks??7);
}
[Serializable] public class StudioClipMarkers { public int soundTick,effectTicks; }
[Serializable] public class StudioClipPaint { public float pivotX=50,pivotY=100,scale=100; public string repeat; }
[Serializable] public class StudioFrame { public string image; public int ticks; }
}

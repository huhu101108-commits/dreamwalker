using System;

namespace Dreamwalker.Demo
{
// Field names mirror the versioned JSON saved by the tablet editor.
[Serializable]
public class StudioRelease
{
    public int rev;
    public StudioProject project;
}
[Serializable]
public class StudioProject
{
    public int schema;
    public string startMap, customJson;
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
    public StudioMap Map(string id) => Array.Find(scenes, v => v.id == id);
    public StudioCharacter Character(string id) => Array.Find(characters, v => v.id == id);
    public StudioStory Story(string id) => Array.Find(stories, v => v.id == id);
    public StudioLayout Layout(string id) => Array.Find(layouts, v => v.id == id);
}
[Serializable]
public class StudioMix
{
    public float music = 65, voice = 100, fx = 85;
}
[Serializable]
public class StudioFrontScreens
{
    public string title, roster, loading;
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
    public int health;
    public float speedScale, jumpScale, attackScale, reachScale;
    public StudioSkill[] skills;
    public StudioRoadmap roadmap;
    public StudioClip[] motionClips;
}
[Serializable]
public class StudioSkill
{
    public string name, mechanic;
    public float power, cooldown;
    public StudioStep[] steps;
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
[Serializable]
public class StudioCamera
{
    public float follow = 5, deadX = 6, deadY = 8, parallax = .18f, drift;
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
    public string id, speaker, text, speakerName, side, portrait, backdrop, layout, nextLabel, voice;
    public StudioChoice[] choices;
    public StudioShot shot;
}
[Serializable]
public class StudioShot
{
    public StudioShotLayer[] layers;
}
[Serializable]
public class StudioShotLayer
{
    public string id, kind, title, image, caption, color, fill, align, fit;
    public float x, y, w, h, opacity, fillOpacity, size, radius;
    public int columns;
    public bool visible, locked, flip;
    public int ChoiceColumns(int count) => Math.Max(1, Math.Min(Math.Min(4, columns), count));
}
[Serializable]
public class StudioChoice
{
    public string label, to;
}
[Serializable]
public class StudioLayout
{
    public string id, name, kind, purpose, tint, skin;
    public float shade;
    public bool pauseGame;
    public StudioRule[] rules;
    public StudioWidget[] elements;
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
    public bool showValue, enableValue;
    public StudioAction[] steps;
    public bool visible;
}
}

namespace Dreamwalker.Demo
{
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
[Serializable] public class StudioQuest { public string id, name, kind, target, reward; public int count, goal; }
[Serializable] public class StudioClip { public string key, fx, cue, sound; public int cueTick; public StudioFrame[] frames; }
[Serializable] public class StudioFrame { public string image; public int ticks; }
}

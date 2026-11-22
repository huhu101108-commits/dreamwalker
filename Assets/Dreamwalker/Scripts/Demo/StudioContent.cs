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
    public StudioMap[] scenes;
    public StudioCharacter[] characters;
    public StudioStory[] stories;
    public StudioLayout[] layouts;
    public StudioMap Map(string id) => Array.Find(scenes, v => v.id == id);
    public StudioCharacter Character(string id) => Array.Find(characters, v => v.id == id);
    public StudioStory Story(string id) => Array.Find(stories, v => v.id == id);
    public StudioLayout Layout(string id) => Array.Find(layouts, v => v.id == id);
}
[Serializable]
public class StudioTuning
{
    public float runSpeed, jumpSpeed, dashSpeed, dashDuration, reach;
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
    public int health, damage = 8;
    public float speed = 3.3f, sight = 28, reach = 3, interval = .8f;
}
[Serializable]
public class StudioMap
{
    public string id, name, theme, backdrop, characterId, hudId, menuId, dialogueId, entryStory, exitStory;
    public int width;
    public bool requireClear;
    public StudioObject[] objects;
}
[Serializable]
public class StudioObject
{
    public string id, type, to, storyId, label, image, eventKey;
    public float x, y, width, height;
    public StudioEnemy enemy;
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
    public string id, speaker, text;
    public StudioChoice[] choices;
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
    public string borderColor, pressedColor, imageFit, showFlag, enableFlag;
    public bool showValue, enableValue;
    public StudioAction[] steps;
    public bool visible;
}
}

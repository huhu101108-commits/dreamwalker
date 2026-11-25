using System;
using System.Globalization;
using System.Text.RegularExpressions;

namespace Dreamwalker.Demo
{
// Player settings of the device (sound, line speed, auto lines), kept per game like the language and never part of
// the save or its cloud copy. The same fields as the web game's settings, so both read the same stored text.
[Serializable]
public class StudioDeviceSettings
{
    public int music = 100, fx = 100, voice = 100, textSpeed = 100;
    public bool mute, autoAdvance;

    public StudioDeviceSettings Bounded()
    {
        music = Math.Max(0, Math.Min(100, music));
        fx = Math.Max(0, Math.Min(100, fx));
        voice = Math.Max(0, Math.Min(100, voice));
        textSpeed = Math.Max(10, Math.Min(1000, textSpeed));
        return this;
    }
    private int Number(string name) =>
        name == "music" ? music : name == "fx" ? fx : name == "voice" ? voice : name == "textSpeed" ? textSpeed : 0;
    // The value a settings control shows.
    public string Text(StudioControlSpec c)
    {
        if (c.setting == "mute") return mute ? "true" : "false";
        if (c.setting == "autoAdvance") return autoAdvance ? "true" : "false";
        return Math.Max(c.min, Math.Min(c.max, Number(c.setting))).ToString(CultureInfo.InvariantCulture);
    }
    // Takes a committed control value; false when the setting stays the same.
    public bool Set(string name, string value)
    {
        if (name == "mute" || name == "autoAdvance")
        {
            bool on = value == "true";
            if ((name == "mute" ? mute : autoAdvance) == on) return false;
            if (name == "mute") mute = on; else autoAdvance = on;
            return true;
        }
        if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out int n)) return false;
        int before = Number(name);
        switch (name)
        {
        case "music": music = n; break;
        case "fx": fx = n; break;
        case "voice": voice = n; break;
        case "textSpeed": textSpeed = n; break;
        default: return false;
        }
        Bounded();
        return Number(name) != before;
    }
    // The share of the creator's mix a channel plays at.
    public float Level(string channel) => mute ? 0 : (channel == "music" ? music : channel == "voice" ? voice : fx) / 100f;
}

// Menu rules both runtimes share (linkTarget in model.js, DialogueCursor.autoWait in simulation.js); the native
// contract check compares them with a table generated from the studio (scripts/unity-menus.mjs).
public static class StudioMenuRules
{
    private static readonly Regex WebLink = new Regex(@"^https://[A-Za-z0-9.-]{1,190}(?::[0-9]{1,5})?(?:[/?#][^\x00-\x20\x7f-\x9f""'<>\\`\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*)?\z");
    private static readonly Regex MailLink = new Regex(@"^mailto:[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\z");
    // A web page (https) or a support mail address.
    public static bool LinkTarget(string v) => !string.IsNullOrEmpty(v) && v.Length <= 300 && (WebLink.IsMatch(v) || MailLink.IsMatch(v));
    // Ticks an auto line waits: typing at the player's speed (percent), then 1.2 s and 0.05 s per character to read.
    public static double AutoWait(string text, int rate, int textSpeed)
    {
        text = text ?? "";
        int chars = 0;
        for (int i = 0; i < text.Length; i += char.IsSurrogatePair(text, i) ? 2 : 1) chars++;
        return (rate > 0 ? chars * 6000.0 / ((double)rate * textSpeed) : 0) + 72 + 3 * chars;
    }
}
}

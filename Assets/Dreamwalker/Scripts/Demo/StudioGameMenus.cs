using System;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;
#endif

namespace Dreamwalker.Demo
{
// Home and standby screens, player settings and the menu actions that leave the field logic: progress saves,
// quitting, outside links and state toggles. Mirrors FieldRun (simulation.js) and the web host (game.js).
public sealed partial class StudioWorld
{
    private static readonly string[] FrontOrder = { "title", "roster", "home", "loading" };
    internal StudioDeviceSettings Settings { get; private set; } = new StudioDeviceSettings();
    private float idleTime, autoWaited;
    private bool hasIdle;
    private string SettingsKey => "dreamwalker-settings-v1:" + (string.IsNullOrEmpty(Project.saveId) ? Project.startMap : Project.saveId);

    private void LoadSettings()
    {
        Settings = new StudioDeviceSettings();
        string saved = PlayerPrefs.GetString(SettingsKey, "");
        if (!string.IsNullOrEmpty(saved))
            try { Settings = (JsonUtility.FromJson<StudioDeviceSettings>(saved) ?? new StudioDeviceSettings()).Bounded(); }
            catch (ArgumentException) { }
        hasIdle = Array.Exists(Project.layouts, l => l.rules != null && Array.Exists(l.rules, r => r.@event == "idle"));
        idleTime = 0;
    }
    // A settings control changed: applied at once and kept on the device.
    private void ChangeSetting(StudioWidget w, string value)
    {
        if (!Settings.Set(w.control.setting, value)) return;
        PlayerPrefs.SetString(SettingsKey, JsonUtility.ToJson(Settings));
        PlayerPrefs.Save();
        ApplySoundLevels();
        if (!string.IsNullOrEmpty(w.control.signal)) Fire("signal", w.control.signal);
    }
    private float Volume(string channel, float mix) => Mathf.Clamp01(mix / 100f * Settings.Level(channel));
    // What is already playing follows new settings at once; one-shot effects keep the level they started with.
    private void ApplySoundLevels()
    {
        if (musicPlayer != null) musicPlayer.volume = Volume("music", Project.mix?.music ?? 65);
        if (voicePlayer != null) voicePlayer.volume = Volume("voice", Project.mix?.voice ?? 100);
        if (castVoicePlayer != null) castVoicePlayer.volume = Volume("voice", Project.mix?.voice ?? 100);
        foreach (var looping in new[] { stageSound, cuePlayer })
            if (looping != null && looping.loop) looping.volume = Volume("fx", Project.mix?.fx ?? 85);
    }

    private string FrontScreen(string role)
    {
        var f = Project.frontScreens;
        string id = f == null ? null : role == "title" ? f.title : role == "roster" ? f.roster : role == "home" ? f.home :
                    role == "loading" ? f.loading : null;
        return !string.IsNullOrEmpty(id) && Project.Layout(id) != null ? id : null;
    }
    private int FrontIndex(string id)
    {
        if (string.IsNullOrEmpty(id)) return -1;
        for (int i = 0; i < FrontOrder.Length; i++) if (FrontScreen(FrontOrder[i]) == id) return i;
        return -1;
    }
    private bool IsFront(string id) => FrontIndex(id) >= 0;
    // The next front screen in the start order: title → character choice → home → loading → the map. A confirmed
    // character always moves on past the character choice.
    private string NextFront(string action)
    {
        int at = ShowingFront ? Math.Max(0, FrontIndex(front)) : 0;
        if (action == "confirmActor") at = Math.Max(at, 1);
        for (int i = at + 1; i < FrontOrder.Length; i++)
        {
            string id = FrontScreen(FrontOrder[i]);
            if (id != null) return id;
        }
        return null;
    }
    // 홈 화면으로: the home screen above everything (the title screen when there is no home screen); the map waits
    // behind it. A trip that waited for the closed screens goes on first.
    private void GoHome()
    {
        string id = FrontScreen("home") ?? FrontScreen("title");
        if (id == null) return;
        Present(null);
        flow.CloseAll();
        Menu = "";
        FinishOverlay();
        Present(id);
    }
    // 플레이 시작: from the front and overlay screens to the map, through the loading screen when there is one. A map
    // that has ended (cleared or lost) starts again.
    private void PlayFromFront()
    {
        Present(null);
        flow.CloseAll();
        Menu = "";
        if (!string.IsNullOrEmpty(Result)) { mapHistory.Remove(Map.id); Enter(Map); }
        else FinishOverlay();
        string loading = FrontScreen("loading");
        if (loading != null && string.IsNullOrEmpty(front)) Present(loading);
        SyncControls();
    }
    // The home screen keeps saving: the map behind it is at rest and the player spends time there.
    private bool AtHome => ShowingFront && front == FrontScreen("home") && string.IsNullOrEmpty(flow.Top);

    private bool MenuAction(string action, string target)
    {
        switch (action)
        {
        case "saveGame":
            Notice(StudioLocalization.Text(SaveProgress() ? "save.done" : "save.busy"));
            return true;
        case "loadGame":
            Notice(StudioLocalization.Text(PlayerPrefs.HasKey(SaveKey) && LoadSave(PlayerPrefs.GetString(SaveKey)) ? "save.loaded" : "save.none"));
            return true;
        case "quitGame":
            SaveProgress();
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
#else
            Application.Quit();
#endif
            return true;
        case "openLink":
            if (StudioMenuRules.LinkTarget(target)) Application.OpenURL(target);
            return true;
        case "flagToggle":
            flow.Flag(target, !flow.Matches(target, true));
            return true;
        case "home":
            GoHome();
            return true;
        case "play":
            PlayFromFront();
            return true;
        }
        return false;
    }

    // Standby screens: seconds without input, counted on every screen, also while the game is paused.
    private void StepIdle()
    {
        if (PlayerInputThisFrame()) idleTime = 0;
        float prior = idleTime;
        idleTime += Time.unscaledDeltaTime;
        if (hasIdle && Actor != null && Map != null &&
            flow.Fire(Project, Map.id, Actor.id, "idle", CurrentLayout?.id ?? "", 100f * Health / Actor.health, prior, idleTime))
            SyncControls();
    }
    private static bool PlayerInputThisFrame()
    {
#if ENABLE_INPUT_SYSTEM
        var touches = Touchscreen.current;
        if (touches != null)
            foreach (var touch in touches.touches)
                if (touch.press.wasPressedThisFrame) return true;
        if (Mouse.current != null && Mouse.current.leftButton.wasPressedThisFrame) return true;
        if (Keyboard.current != null && Keyboard.current.anyKey.wasPressedThisFrame) return true;
        var pad = Gamepad.current;
        if (pad != null)
            foreach (var control in pad.allControls)
                if (control is ButtonControl button && button.wasPressedThisFrame) return true;
        return false;
#else
        return UnityEngine.Input.anyKeyDown || UnityEngine.Input.touchCount > 0;
#endif
    }
    private float AutoWait() => (float)StudioMenuRules.AutoWait(Line?.text, Line?.stageTrack?.rate ?? 0, Settings.textSpeed);
}
}

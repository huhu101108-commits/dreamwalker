#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using UnityEngine;

namespace Dreamwalker.Demo
{
[Serializable] public sealed class StudioStoryInput
{
    public string line, kind;
    public int index, ticks;
}
[Serializable] public sealed class StudioStoryScenario
{
    public string map, story, line;
    public string[] flags;
    public StudioStoryInput[] steps;
}
[Serializable] public sealed class StudioStoryRequest
{
    public string format, contentDigest;
    public int revision;
    public StudioStoryScenario scenario;
}
[Serializable] public sealed class StudioStoryState
{
    public string map, actor, story, line;
    public int hp;
    public int[] allowed;
    public string[] flags, stories, rewards, cleared, runRules, mapRules;
    public StudioEquipEntry[] inputs, gear, kills;
    public StudioBagEntry[] bag;
}
[Serializable] public sealed class StudioStoryStep
{
    public string status;
    public StudioStoryState state;
}
[Serializable] public sealed class StudioStoryOutcome
{
    public StudioStoryState start, final;
    public StudioStoryStep[] steps;
    public bool completed, saved;
    public StudioStoryState[] resumed;
}
[Serializable] public sealed class StudioStoryReply
{
    public string format = "dreamwalker-story-result-v1", environment = "unity-editor-playmode", contentDigest;
    public int revision;
    public StudioStoryScenario scenario;
    public StudioStoryOutcome outcome;
}

public sealed partial class StudioWorld
{
    public const string StoryProbeSlotKey = "Dreamwalker.StoryProbe.IsolatedSlot";
    public const string StoryProbeSlotPrefix = "dreamwalker-inspection-story-v1:";
    public static bool IsStoryProbeSlot(string value) =>
        value != null && value.StartsWith(StoryProbeSlotPrefix, StringComparison.Ordinal) &&
        Guid.TryParseExact(value.Substring(StoryProbeSlotPrefix.Length), "N", out _);

    public static void ValidateStoryRequest(StudioRelease release, StudioStoryRequest request)
    {
        var spec = request?.scenario;
        if (release?.project == null || request?.format != "dreamwalker-story-input-v1" ||
            request.revision != release.rev || request.contentDigest != release.contentDigest ||
            !Regex.IsMatch(release.contentDigest ?? "", @"\A[0-9a-f]{64}\z"))
            throw new InvalidDataException("입력 기록과 release.json의 리비전 또는 콘텐츠 지문이 달라요.");
        var story = release.project.Story(spec?.story);
        if (spec == null || release.project.Map(spec.map) == null || story?.nodes == null ||
            Array.FindIndex(story.nodes, n => n.id == spec.line) < 0 || spec.flags == null || spec.flags.Length > 64 ||
            spec.steps == null || spec.steps.Length > 128)
            throw new InvalidDataException("시작 맵·대사 줄 또는 입력 기록 형식을 확인하세요.");
        var flags = new HashSet<string>();
        foreach (string flag in spec.flags)
            if (!Regex.IsMatch(flag ?? "", @"\A[a-zA-Z0-9_가-힣-]{1,50}\z") || !flags.Add(flag))
                throw new InvalidDataException("시작 플래그를 확인하세요.");
        int ticks = 0;
        foreach (var input in spec.steps)
        {
            var line = Array.Find(story.nodes, n => n.id == input?.line);
            if (input == null || line == null) throw new InvalidDataException("삭제된 대사 줄을 가리키는 입력이에요.");
            bool valid = false;
            switch (input.kind)
            {
                case "choice": valid = input.ticks == 0 && input.index >= 0 && input.index < line.choices.Length; break;
                case "next":
                case "skip": valid = input.ticks == 0 && input.index == -1; break;
                case "wait":
                    valid = input.index == -1 && input.ticks >= 1 && input.ticks <= 600;
                    if (valid) { ticks += input.ticks; valid = ticks <= 7200; }
                    break;
            }
            if (!valid) throw new InvalidDataException("입력 또는 재생 틱 범위가 올바르지 않아요.");
        }
    }

    private static string[] OrderedStoryKeys(IEnumerable<string> source)
    {
        var keys = new List<string>(source);
        keys.Sort(StringComparer.Ordinal);
        return keys.ToArray();
    }
    private static StudioEquipEntry[] OrderedStoryValues(Dictionary<string, string> source)
    {
        return Array.ConvertAll(OrderedStoryKeys(source.Keys), key => new StudioEquipEntry { key = key, id = source[key] });
    }
    private StudioStoryState CaptureStoryProbe()
    {
        var allowed = new List<int>();
        if (Line != null)
            for (int i = 0; i < Line.choices.Length; i++)
                if (StageChoiceAllowed(i)) allowed.Add(i);
        var inventory = new List<StudioBagEntry>();
        foreach (string id in OrderedStoryKeys(bag.Keys)) inventory.Add(new StudioBagEntry { id = id, count = bag[id] });
        return new StudioStoryState {
            map = Map.id, actor = Actor.id, hp = Health, story = Story?.id ?? "", line = Line?.id ?? "",
            allowed = allowed.ToArray(), flags = OrderedStoryKeys(flow.Flags), stories = OrderedStoryKeys(storiesDone),
            rewards = OrderedStoryKeys(rewards), cleared = OrderedStoryKeys(mapsDone),
            runRules = OrderedStoryKeys(flow.RunRules), mapRules = OrderedStoryKeys(flow.MapRules),
            inputs = OrderedStoryValues(formValues), gear = OrderedStoryValues(gear), kills = OrderedStoryValues(kills),
            bag = inventory.ToArray()
        };
    }

    public StudioStoryReply ReplayStory(StudioRelease release, StudioStoryRequest request)
    {
        ValidateStoryRequest(release, request);
        if (!Application.isPlaying || !Running || !IsStoryProbeSlot(SaveKey))
            throw new InvalidOperationException("분리된 검수 Play 모드에서만 대사 입력을 재생할 수 있어요.");
        Play(release.project, Connection);
        var spec = request.scenario;
        flow = new StudioScreenFlow();
        ResetProgress();
        lastCheckpoint = null;
        Enter(Project.Map(spec.map), false, true);
        foreach (string flag in spec.flags) flow.Flag(flag, true);
        OpenStory(spec.story, Array.FindIndex(Project.Story(spec.story).nodes, n => n.id == spec.line));
        var outcome = new StudioStoryOutcome { start = CaptureStoryProbe() };
        var trace = new List<StudioStoryStep>();
        foreach (var input in spec.steps)
        {
            string status = "advanced";
            if (Line == null || Story.id != spec.story || Line.id != input.line) status = "unexpected-line";
            else if (input.kind == "wait")
            {
                for (int i = 0; i < input.ticks && Story != null && !HasOverlay; i++) StepStage(1f / 60f);
                status = "waited";
            }
            else
            {
                bool skip = input.kind == "skip";
                bool allowed = skip || Line.choices.Length == 0 || StageChoiceAllowed(input.index);
                Answer(input.index, skip);
                if (!allowed) status = "blocked";
            }
            trace.Add(new StudioStoryStep { status = status, state = CaptureStoryProbe() });
            if (status == "unexpected-line") break;
        }
        outcome.steps = trace.ToArray();
        outcome.final = CaptureStoryProbe();
        outcome.completed = storiesDone.Contains(spec.story);
        outcome.saved = SaveProgress();
        var resumed = new List<StudioStoryState>();
        if (outcome.saved)
        {
            ResetProgress();
            flow = new StudioScreenFlow();
            if (RestoreProgress())
            {
                resumed.Add(CaptureStoryProbe());
                GrantRewards();
                resumed.Add(CaptureStoryProbe());
            }
        }
        outcome.resumed = resumed.ToArray();
        return new StudioStoryReply { revision = release.rev, contentDigest = release.contentDigest, scenario = spec, outcome = outcome };
    }
}
}
#endif

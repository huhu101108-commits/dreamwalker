using System;
using System.Collections.Generic;

namespace Dreamwalker.Demo
{
[Serializable]
public class StudioEpisode
{
    public string id, title, summary, storyId, mapId;
    public StudioChoice[] links;
}

[Serializable]
public class StudioRoadmap
{
    public string entry;
    public StudioEpisode[] episodes;

    // Compile once when opened. Following a cycle reuses lines rather than expanding the graph.
    public StudioStory Build(StudioProject project, StudioCharacter actor)
    {
        if (episodes == null || episodes.Length == 0)
            return null;
        var first = Array.Find(episodes, e => e.id == entry);
        if (first == null)
            return null;
        var lines = new List<StudioLine>();
        AppendEpisode(project, first, lines);
        foreach (var e in episodes)
            if (e != first)
                AppendEpisode(project, e, lines);
        return new StudioStory { id = actor.id, name = actor.name + "의 스토리", nodes = lines.ToArray() };
    }

    private static StudioChoice Choice(string label, string to) => new StudioChoice { label = label, to = to };

    private static void AppendEpisode(StudioProject project, StudioEpisode episode, List<StudioLine> lines)
    {
        string prefix = episode.id + ":", end = prefix + "$links";
        var source = project.Story(episode.storyId);
        var labels = new List<string> { episode.title };
        var map = project.Map(episode.mapId);
        if (map != null)
            labels.Add(map.name);
        if (!string.IsNullOrEmpty(episode.summary))
            labels.Add(episode.summary);
        lines.Add(new StudioLine { id = prefix, speaker = "", text = string.Join("\n", labels),
                                   choices = new[] { source == null ? Choice("계속", end)
                                                                    : Choice("대화 읽기",
                                                                             prefix + source.nodes[0].id) } });
        if (source != null)
        {
            for (int i = 0; i < source.nodes.Length; i++)
            {
                var line = source.nodes[i];
                var answers =
                    line.choices.Length == 0
                        ? new[] { Choice(string.IsNullOrEmpty(line.nextLabel) ? "다음" : line.nextLabel,
                                         i + 1 < source.nodes.Length ? prefix + source.nodes[i + 1].id : end) }
                        : Array.ConvertAll(
                              line.choices,
                              c => Choice(c.label, string.IsNullOrEmpty(c.to) ? end : prefix + c.to));
                lines.Add(new StudioLine { id = prefix + line.id, text = line.text, speaker = line.speaker,
                                           speakerName = line.speakerName, side = line.side, portrait = line.portrait,
                                           backdrop = line.backdrop, voice = line.voice, layout = line.layout, nextLabel = line.nextLabel, choices = answers });
            }
        }
        lines.Add(new StudioLine { id = end, speaker = "", text = episode.title,
                                   choices = episode.links.Length == 0
                                                 ? new[] { Choice("스토리 마치기", "") }
                                                 : Array.ConvertAll(episode.links,
                                                                    c => Choice(c.label, c.to + ":")) });
    }
}
}

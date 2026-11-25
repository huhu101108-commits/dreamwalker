using System;
using System.IO;
using System.Text.Json;
using Dreamwalker.Demo;
// The web studio checks the same fixture in scripts/test-character-stage.mjs.
public static class CharacterStage
{
#pragma warning disable CS0649 // Filled from the shared JSON fixture.
    private sealed class EnergyExpect { public int start, refusedAt, afterSpend, afterHurt; public int[] afterHits; }
    private sealed class Expect { public string[][] faces; public string[] profileText; public EnergyExpect energy; public int freezeTicks, plainCastTicks; }
    private sealed class Fixture { public StudioCharacter[] characters; public StudioStory story; public Expect expect; }
#pragma warning restore CS0649
    public static void Run()
    {
        var format = new JsonSerializerOptions { IncludeFields = true };
        var f = JsonSerializer.Deserialize<Fixture>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "character-stage.json")), format);
        StudioCharacter Find(string id) => Array.Find(f.characters, c => c.id == id);
        foreach (var face in f.expect.faces)
            if (Find(face[0]).Face(face[1]) != face[2]) throw new Exception("character face " + string.Join(" / ", face));
        var snow = Find("snow");
        if (snow.ProfileText(f.expect.profileText[0]) != f.expect.profileText[1]) throw new Exception("profile tokens");
        if (Find("rain").HasEnergy || !snow.HasEnergy) throw new Exception("optional gauge");

        var gauge = new StudioActorRules { actor = "snow" };
        var ultimate = snow.skills[0];
        if (gauge.Energy(snow.energy) != f.expect.energy.start) throw new Exception("gauge start");
        for (int i = 0; i < f.expect.energy.afterHits.Length; i++)
        {
            if (gauge.energy == f.expect.energy.refusedAt && (gauge.Spend(snow.energy, ultimate.cost) || gauge.energy != f.expect.energy.refusedAt))
                throw new Exception("gauge spent below cost");
            gauge.Gain(snow.energy, snow.energy.hit);
            if (gauge.energy != f.expect.energy.afterHits[i]) throw new Exception("gauge after hit " + i + ": " + gauge.energy);
        }
        if (!gauge.Spend(snow.energy, ultimate.cost) || gauge.energy != f.expect.energy.afterSpend) throw new Exception("gauge spend");
        gauge.Gain(snow.energy, snow.energy.hurt);
        var saved = JsonSerializer.Deserialize<StudioActorRules>(JsonSerializer.Serialize(gauge, format), format);
        if (saved.Energy(snow.energy) != f.expect.energy.afterHurt) throw new Exception("gauge save");
        var legacy = JsonSerializer.Deserialize<StudioActorRules>("{\"actor\":\"snow\",\"shield\":0}", format);
        if (legacy.Energy(snow.energy) != f.expect.energy.start) throw new Exception("legacy save gauge");

        var cast = new StudioCastClock();
        cast.Begin(snow, ultimate);
        int held = 0;
        while (cast.Step()) held++;
        if (held != f.expect.freezeTicks || cast.Active) throw new Exception("freezing cut-in held " + held);
        cast.Begin(snow, snow.skills[1]);
        held = 0;
        while (cast.Step()) held++;
        if (held != f.expect.plainCastTicks || cast.Active || cast.ShowsCutIn) throw new Exception("shout without cut-in");
        if (!ultimate.HasCast || Find("rain").skills[0].HasCast) throw new Exception("optional skill presentation");

        var line = f.story.nodes[0];
        if (line.expression != "smile" || !line.shot.focus || line.shot.layers[0].actor != "snow" || line.shot.layers[1].expression != null)
            throw new Exception("staged dialogue data");
        var project = new StudioProject { stories = new[] { f.story }, scenes = Array.Empty<StudioMap>() };
        var route = new StudioRoadmap { entry = "e", episodes = new[] {
            new StudioEpisode { id = "e", title = "설원", storyId = "talk", links = Array.Empty<StudioChoice>() } } }.Build(project, snow);
        if (route.nodes[1].expression != "smile" || route.nodes[1].shot != line.shot) throw new Exception("roadmap keeps the speaker's expression");
        Console.WriteLine("PASS native character faces, profile tokens, saved skill gauge, cut-in hold ticks and staged dialogue");
    }
}

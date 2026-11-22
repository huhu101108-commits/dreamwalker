using System;
using Dreamwalker.Demo;
public static class Verify
{
    public static string Run()
    {
        foreach (int face in new[] { -1, 1 })
        {
            int hp = 100, first = 0;
            for (int tick = 1; tick <= 26; tick++)
            {
                int f = tick - 6;
                if (f > 0 && f <= 7 && first == 0 &&
                    StudioCombatClock.SweepTouches(0, 0, face * 3 / 3.5f, 0, face, 1.66f,
                                                   StudioCombatClock.Angle(f - 1, 7),
                                                   StudioCombatClock.Angle(f, 7)))
                {
                    first = tick;
                    hp -= 18;
                }
                if (tick <= 6 && hp != 100)
                    throw new Exception("startup");
            }
            if (hp != 82 || first != 10)
                throw new Exception("sweep parity: " + first);
            if (StudioCombatClock.SweepTouches(0, 0, -face * 2, 0, face, 1.66f, -55, 55))
                throw new Exception("behind");
        }
        var button = new StudioWidget { shape = "custom", points = new[] {
            new StudioVertex { x=0,y=0 }, new StudioVertex { x=100,y=0 }, new StudioVertex { x=0,y=100 } } };
        if (!StudioOutline.Contains(button,.1f,.2f,2) || StudioOutline.Contains(button,.9f,.8f,2)) throw new Exception("polygon hit area");
        foreach (var shape in new[] { "pill", "hex", "diamond", "round" }) {
            button.shape=shape;
            if (!StudioOutline.Contains(button,.5f,.5f,2) || StudioOutline.Contains(button,.01f,.01f,2)) throw new Exception(shape);
        }
        var options = new StudioShotLayer { id="choices", kind="choices", columns=3 };
        if (options.ChoiceColumns(2)!=2 || options.ChoiceColumns(0)!=1) throw new Exception("choice grid");
        var shot = new StudioShot { layers=new[] { options } };
        var actor = new StudioCharacter { id="snow", name="백설" };
        var source = new StudioStory { id="story", nodes=new[] {
            new StudioLine { id="s", shot=shot, voice="sample", choices=Array.Empty<StudioChoice>() } } };
        var project = new StudioProject { stories=new[] { source }, scenes=Array.Empty<StudioMap>() };
        var route = new StudioRoadmap { entry="e",episodes=new[]{
            new StudioEpisode { id="e",title="설원",storyId="story",links=Array.Empty<StudioChoice>() } } }.Build(project,actor);
        if (route.nodes[1].shot != shot || route.nodes[1].voice!="sample" || route.nodes[1].choices[0].to!="e:$links")
            throw new Exception("authored dialogue route");
        Console.WriteLine("PASS native dialogue data, choice columns and chapter routing");
        var flow = new StudioScreenFlow();
        flow.Flag("story", true);
        flow.Open("pause");
        var again = new StudioScreenFlow();
        again.Restore(flow.Flags, flow.RunRules, flow.MapRules);
        if (!again.Matches("story", true) || again.Top != "")
            throw new Exception("save flags");
        return "PASS bidirectional sweep at tick 10 and saved state";
    }
    public static void Main() => Console.WriteLine(Run());
}

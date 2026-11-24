using System;
using Dreamwalker.Demo;
public static class Verify
{
    public static string Run()
    {
        var state = new StudioActorRules { actor = "snow" };
        var rule = new StudioCombatRule { id="r", actor="snow", enabled=true, @event="hit", every=2, hpBelow=50, cooldown=4,
            effects=new[] { new StudioRuleEffect { kind="damage", amount=7 }, new StudioRuleEffect { kind="shield", amount=3 } } };
        int health=50;
        int[] expected = {0,7,0,0,0,7};
        for (int i=0;i<expected.Length;i++)
            if (state.Apply(new[]{rule},"hit",i+1,ref health,100)!=expected[i]) throw new Exception("combat rule at "+i);
        if (state.Absorb(8)!=2 || state.shield!=0) throw new Exception("combat shield");
        rule.appliesTo="arena";
        if(state.Apply(new[]{rule},"hit",20,ref health,100)!=0 || state.shield!=0)throw new Exception("Arena-only rule ran in field");
        rule.appliesTo="field";rule.every=1;
        if(state.Apply(new[]{rule},"hit",21,ref health,100)!=7)throw new Exception("Field rule was skipped");
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
        var input = new StudioControlSpec { mode="range", min=-5, max=10, step=4, initial="3", key="호출명" };
        if(input.Value("5")!="7" || input.Value("999")!="7" || input.Value("1.2")!=null || input.Name("s","w")!="호출명") throw new Exception("native input range");
        input.mode="choice";input.options=new[]{"설원","승강장"};if(input.Value("철도")!=null || input.Value("설원")!="설원")throw new Exception("native choice");
        input.mode="text";input.limit=2;input.key="";if(input.Value("백설역")!="백설" || input.Name("hud","name")!="hud/name")throw new Exception("native input text");
        input.validation=new StudioTextValidation{minLength=2,format="word"};
        if(input.Value("a.")!=null || input.Value("백설")!="백설")throw new Exception("native validation");
        if(StudioAnchor.Resolve("right",16,800,30,0,1)!=68 || StudioAnchor.Resolve("bottom",9,450,20,0,1)!=78)throw new Exception("native reference viewport");
        var inputClock=new StudioInputGestureClock();var inputLog="";
        var hold=new StudioGesture{phase="hold",ms=200};var release=new StudioGesture{phase="release",ms=200};
        inputClock.Down("f1","touch1",hold,10,()=>inputLog+="h");inputClock.Down("f2","touch2",release,20,()=>inputLog+="r");
        inputClock.Tick("f1",160);inputClock.End("f2",160,true);inputClock.Tick("f1",210);inputClock.Tick("f1",250);inputClock.End("f1",300);
        var twice=new StudioGesture{phase="double",ms=200};inputClock.Down("f3","double",twice,500,()=>inputLog+="?");inputClock.End("f3",510);
        inputClock.Down("f8","double",twice,650,()=>inputLog+="d");inputClock.End("f8",660);
        if(inputLog!="hd")throw new Exception("native independent gestures "+inputLog);
        Console.WriteLine("PASS native anchors, held/released/double/canceled controls, text validation and stable binding");
        var clipMarks=new StudioClip{cueTick=5};if(clipMarks.SoundTick!=5||clipMarks.EffectTicks!=7)throw new Exception("legacy motion cue");
        clipMarks.markers=new StudioClipMarkers{soundTick=14,effectTicks=20};
        if(clipMarks.SoundTick!=14||clipMarks.EffectTicks!=20)throw new Exception("independent media timings");
        var cut = new StudioStageTrack{rate=60,autoTick=3,skipTo="end",completeOnSkip=true,cues=new[]{
            new StudioStageCue{id="one",kind="flag",at=2},new StudioStageCue{id="two",kind="camera",at=2},new StudioStageCue{id="late",kind="flag",at=8}}};
        var lineStage=new StudioLine{id="start",text="눈😀길",stageTrack=cut,choices=Array.Empty<StudioChoice>()};
        var timeline=new StudioStageClock();timeline.Reset(lineStage);string order="";
        if(timeline.Step(2f/60f,c=>order+=c.id)||order!="onetwo"||cut.Visible(lineStage.text,2)!="눈😀")throw new Exception("stage ordering and Unicode timing");
        if(!timeline.Step(1f/60f,c=>order+=c.id))throw new Exception("stage automatic advance");
        timeline.Finish(c=>order+=c.id);if(order!="onetwolate"||cut.Destination(new StudioStory{nodes=new[]{lineStage,new StudioLine{id="end"}}})!=1)throw new Exception("stage authored skip flags/destination");
        Console.WriteLine("PASS native timed cues, Unicode text, selection and skip-state contract");
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
        RuleReplay.Run();
        PortableImport.Run();
        CharacterStage.Run();
        UnityReturn.Run();
        UiGeometry.Run();
        PortraitMotion.Run();
        Locale.Run();
        Gacha.Run();
        Menus.Run();
        return "PASS bidirectional sweep at tick 10 and saved state";
    }
    public static async System.Threading.Tasks.Task Main(string[] args)
    {
        if (args.Length==4 && args[0]=="rule-replay") RuleReplay.RunFile(args[1],args[2],args[3]);
        else if (args.Length==2) await OnlineMatch.Run(args[0],args[1]);
        else Console.WriteLine(Run());
    }
}

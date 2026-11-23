using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using Dreamwalker.Demo;

public static class RuleReplay
{
    public sealed class Input {public string @event,key;public int tick;}
    public sealed class Spec {public string actor,map;public int maximum,hp;public string[] flags;public Input[] events;}
    public sealed class Expected {public int hp,shield,damage,charge;public bool[] consumed;public string[] trace,flags;}
    public sealed class Fixture {public StudioEventRule[] rules;public Spec spec;public Expected expect;public StudioProbeOutcome portable;}
    public sealed class FieldFixture {public StudioProbeSpec spec;public StudioProbeOutcome outcome;}
    public static void RunFile(string releasePath,string inputPath,string outputPath){
        var format=new JsonSerializerOptions{IncludeFields=true,WriteIndented=true};
        var release=JsonSerializer.Deserialize<StudioRelease>(File.ReadAllText(releasePath),format);
        var request=JsonSerializer.Deserialize<StudioProbeRequest>(File.ReadAllText(inputPath),format);
        var result=StudioProgramInspection.Replay(release,request,"dotnet-contract");
        File.WriteAllText(outputPath,JsonSerializer.Serialize(result,format));
    }
    public static void Run(){
        var f=JsonSerializer.Deserialize<Fixture>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"rule-replay.json")),new JsonSerializerOptions{IncludeFields=true});
        var machine=new StudioEventMachine(f.rules);var s=f.spec;var flags=new HashSet<string>(s.flags);
        var trace=new List<string>();var consumed=new List<bool>();int hp=s.hp,shield=0,damage=0,last=0;
        machine.Trace=(t,e,k,r,status,i)=>trace.Add(string.Join("/",t,e,k,r,status,i));
        StudioProgramResult Send(string moment,string key,int tick){
            var result=machine.Dispatch(moment,key,tick,s.actor,s.map,hp,s.maximum,flags.Contains,(name,on)=>{if(on)flags.Add(name);else flags.Remove(name);});
            hp=result.hp;shield=Math.Min(9999,shield+result.shield);damage+=result.damage;return result;
        }
        foreach(var e in s.events){
            for(int t=last+1;t<=e.tick;t++)foreach(var key in machine.Due(t))Send("timer",key,t);
            if(e.@event=="enter")machine.Enter();consumed.Add(Send(e.@event,e.key,e.tick).consumed);last=e.tick;
        }
        var expected=f.expect;
        if(hp!=expected.hp||shield!=expected.shield||damage!=expected.damage||machine.Value("save","charge")!=expected.charge||
            !consumed.SequenceEqual(expected.consumed)||!trace.SequenceEqual(expected.trace)||!flags.SetEquals(expected.flags))
            throw new Exception("Authored rule trace differs from shared web fixture: "+string.Join("; ",trace));
        var restored=new StudioEventMachine(f.rules);restored.Restore(machine.Saved,last);
        if(restored.Value("save","charge")!=expected.charge||restored.Value("session","temp")!=0)throw new Exception("Rule save scope");
        var release=new StudioRelease{rev=18,contentDigest=new string('5',64),project=new StudioProject{eventRules=f.rules,
            scenes=new[]{new StudioMap{id=s.map}},characters=new[]{new StudioCharacter{id=s.actor}}}};
        var request=new StudioProbeRequest{format="dreamwalker-rule-replay-v1",revision=18,contentDigest=release.contentDigest,
            spec=new StudioProbeSpec{actor=s.actor,map=s.map,hp=s.hp,maximum=s.maximum,flags=s.flags,
                events=s.events.Select(e=>new StudioProbeInput{@event=e.@event,key=e.key,tick=e.tick}).ToArray()}};
        var portable=StudioProgramInspection.Replay(release,request,"dotnet-contract").outcome;
        if(portable.hp!=f.portable.hp||portable.damage!=f.portable.damage||portable.shield!=f.portable.shield||!portable.flags.SequenceEqual(f.portable.flags)||
            !portable.steps.SequenceEqual(f.portable.steps)||!portable.trace.SequenceEqual(f.portable.trace)||!portable.state.SequenceEqual(f.portable.state))
            throw new Exception("Portable rule replay compared with web output");
        var field=JsonSerializer.Deserialize<FieldFixture>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"field-rule-replay.json")),new JsonSerializerOptions{IncludeFields=true});
        var maps=field.spec.events.Select(e=>e.context.map).Distinct().Select(id=>new StudioMap{id=id}).ToArray();
        var actors=field.spec.events.Select(e=>e.context.actor).Distinct().Select(id=>new StudioCharacter{id=id}).ToArray();
        var fieldRelease=new StudioRelease{rev=release.rev,contentDigest=release.contentDigest,project=new StudioProject{eventRules=f.rules,scenes=maps,characters=actors}};
        var fieldRequest=new StudioProbeRequest{revision=release.rev,format=request.format,contentDigest=release.contentDigest,spec=field.spec};
        var observed=StudioProgramInspection.Replay(fieldRelease,fieldRequest,"dotnet-contract").outcome;
        if(observed.hp!=field.outcome.hp||observed.shield!=field.outcome.shield||observed.damage!=field.outcome.damage||!observed.flags.SequenceEqual(field.outcome.flags)||
            !observed.steps.SequenceEqual(field.outcome.steps)||!observed.trace.SequenceEqual(field.outcome.trace)||!observed.state.SequenceEqual(field.outcome.state))
            throw new Exception("Live FieldRun recording compared with C# regular engine");
        request.revision++;bool rejected=false;try{StudioProgramInspection.Replay(release,request,"dotnet-contract");}catch(ArgumentException){rejected=true;}
        if(!rejected)throw new Exception("Mismatched shared version");request.revision--;request.contentDigest=new string('6',64);rejected=false;
        try{StudioProgramInspection.Replay(release,request,"dotnet-contract");}catch(ArgumentException){rejected=true;}if(!rejected)throw new Exception("Mismatched content");
        var strike=new StudioStrike{x=1,y=1,w=2,h=2,comboFrom=2,comboTo=3,invFrom=4,invTo=5,cancelFrom=2,cancelTo=4};
        if(!strike.Touches(0,0,1,0,1,.7f,1.6f)||strike.Touches(0,0,-3,0,1,.7f,1.6f)||!strike.Combo(2)||strike.Combo(4)||!strike.Guard(5)||!strike.Cancel(3))throw new Exception("Authored combat windows");
        Console.WriteLine("PASS web and native shared event record, ordered actions, same-tick duplicate, cancellation, timer, attack windows, complete state and save scope");
    }
}

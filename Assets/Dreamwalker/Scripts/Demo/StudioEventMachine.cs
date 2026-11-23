using System;
using System.Collections.Generic;

namespace Dreamwalker.Demo
{
    [Serializable] public class StudioProgramTerm { public string kind,key,op; public int value; }
    [Serializable] public class StudioEventRule
    {
        public string id,name,@event,key,actor,map,scope,repeat,duplicate;
        public int priority,every,cooldown;
        public bool enabled;
        public StudioProgramTerm[] conditions,actions;
    }
    [Serializable] public class StudioProgramVar { public string key; public int value; }
    [Serializable] public class StudioProgramCount { public string id; public int count,ready,last=-1; public bool ran,blocked; }
    [Serializable] public class StudioProgramTimer { public string id,key; public int at; }
    [Serializable] public class StudioProgramBucket
    {
        public List<StudioProgramVar> vars=new List<StudioProgramVar>();
        public List<StudioProgramCount> counts=new List<StudioProgramCount>();
        public List<StudioProgramTimer> timers=new List<StudioProgramTimer>();
    }
    public sealed class StudioProgramResult
    {
        public int hp,damage,shield;
        public bool changed,consumed,opened;
        public List<string> signals=new List<string>();
    }
    public sealed class StudioEventMachine
    {
        private readonly StudioEventRule[] all;
        private readonly Dictionary<string,List<StudioEventRule>> index=new Dictionary<string,List<StudioEventRule>>();
        private readonly Dictionary<string,StudioProgramBucket> stores=new Dictionary<string,StudioProgramBucket>();
        private static readonly string[] scopes={"save","session","map"};
        public Action<int,string,string,string,string,int> Trace;
        public StudioProgramBucket Saved=>stores["save"];
        internal StudioProgramBucket Inspect(string scope)=>stores[scope];
        public bool Handles(string moment)=>index.ContainsKey(moment);
        public void Enter(){stores["map"]=new StudioProgramBucket();}
        public StudioEventMachine(StudioEventRule[] rules)
        {
            all=rules??Array.Empty<StudioEventRule>();
            foreach(string scope in scopes)stores[scope]=new StudioProgramBucket();
            foreach(var r in all){
                if(r==null||!r.enabled||string.IsNullOrEmpty(r.@event))continue;
                if(!index.TryGetValue(r.@event,out var row)){row=new List<StudioEventRule>();index[r.@event]=row;}
                int at=row.FindIndex(x=>x.priority<r.priority);
                if(at<0)row.Add(r);else row.Insert(at,r);
            }
        }
        public void Restore(StudioProgramBucket data,int tick)
        {
            foreach(string scope in scopes)stores[scope]=new StudioProgramBucket();
            if(data==null)return;
            var b=Saved;
            var keys=new HashSet<string>();var owners=new Dictionary<string,StudioEventRule>();
            foreach(var r in all)if(r!=null&&r.scope=="save"){
                owners[r.id]=r;
                foreach(var c in r.conditions??Array.Empty<StudioProgramTerm>())if(c.kind=="variable")keys.Add(c.key);
                foreach(var a in r.actions??Array.Empty<StudioProgramTerm>())if(a.kind=="set"||a.kind=="add")keys.Add(a.key);
            }
            if(data.vars!=null)foreach(var v in data.vars)if(v!=null&&keys.Contains(v.key)&&Math.Abs((long)v.value)<=999999&&!b.vars.Exists(x=>x.key==v.key))
                b.vars.Add(new StudioProgramVar{key=v.key,value=v.value});
            if(data.counts!=null)foreach(var c in data.counts)if(c?.id!=null&&owners.ContainsKey(c.id)&&c.count>=0&&c.count<=998&&c.last>=-1&&c.last<=tick&&c.ready>=0&&c.ready<=(long)tick+36000&&!b.counts.Exists(x=>x.id==c.id))
                b.counts.Add(new StudioProgramCount{id=c.id,count=c.count,last=c.last,ready=c.ready,ran=c.ran,blocked=c.blocked});
            if(data.timers!=null)foreach(var t in data.timers)if(t?.id!=null&&owners.TryGetValue(t.id,out var rule)&&t.at>=0&&t.at<=(long)tick+36000&&
                !b.timers.Exists(x=>x.id==t.id&&x.key==t.key)&&Array.Exists(rule.actions??Array.Empty<StudioProgramTerm>(),a=>a.kind=="timer"&&a.key==t.key))
                b.timers.Add(new StudioProgramTimer{id=t.id,key=t.key,at=t.at});
        }
        private static StudioProgramCount Counter(StudioProgramBucket b,string id){
            var c=b.counts.Find(x=>x.id==id);
            if(c==null){c=new StudioProgramCount{id=id};b.counts.Add(c);}return c;
        }
        public int Value(string scope,string key)=>stores[scope].vars.Find(x=>x.key==key)?.value??0;
        public IEnumerable<string> Due(int tick)
        {
            List<string> due=null;
            foreach(var scope in scopes){
                var b=stores[scope];if(b.timers.Count==0)continue;
                for(int i=0;i<b.timers.Count;){
                    var t=b.timers[i];if(t.at>tick){i++;continue;}
                    if(due==null)due=new List<string>();due.Add(t.key);b.timers.RemoveAt(i);
                }
            }
            if(due==null)return Array.Empty<string>();return due;
        }
        private static bool Compare(int a,string op,int b){
            switch(op){case "eq":return a==b;case "ne":return a!=b;case "lt":return a<b;case "le":return a<=b;case "gt":return a>b;case "ge":return a>=b;default:return false;}
        }
        private sealed class Signal { internal string name,key;internal List<string> path=new List<string>(); }
        public StudioProgramResult Dispatch(string moment,string key,int tick,string actor,string map,int hp,int maximum,
            Func<string,bool> flag,Action<string,bool> setFlag)
        {
            var output=new StudioProgramResult{hp=hp};
            if(!Handles(moment))return output;
            var queue=new List<Signal>{new Signal{name=moment,key=key}};int work=0;
            for(int n=0;n<queue.Count;n++){
                var s=queue[n];if(!index.TryGetValue(s.name,out var rules))continue;
                foreach(var r in rules){
                    if(!string.IsNullOrEmpty(r.key)&&r.key!=s.key)continue;
                    void Log(string state,int i=-1){Trace?.Invoke(tick,s.name,s.key,r.id,state,i);}
                    if(++work>512){Log("budget");return output;}
                    if((!string.IsNullOrEmpty(r.actor)&&r.actor!=actor)||(!string.IsNullOrEmpty(r.map)&&r.map!=map)){Log("target");continue;}
                    var bucket=stores[r.scope];var count=Counter(bucket,r.id);
                    if(count.blocked||(r.repeat=="once"&&count.ran)){Log(count.blocked?"cancelled":"once");continue;}
                    var conditions=r.conditions??Array.Empty<StudioProgramTerm>();
                    int failed=Array.FindIndex(conditions,c=>!Compare(c.kind=="variable"?Value(r.scope,c.key):c.kind=="flag"?(flag(c.key)?1:0):
                        (int)((long)100*output.hp/Math.Max(1,maximum)),c.op,c.value));
                    if(failed>=0){Log("condition",failed);continue;}
                    if(r.duplicate=="tick"&&count.last==tick){Log("duplicate");continue;}
                    if(s.path.Contains(r.id)){Log("cycle");continue;}
                    count.last=tick;count.count=(count.count+1)%Math.Max(1,r.every);output.changed=true;
                    if(count.count!=0){Log("count");continue;}if(tick<count.ready){Log("cooldown");continue;}
                    count.ready=tick+r.cooldown;count.ran=true;Log("run");
                    var actions=r.actions??Array.Empty<StudioProgramTerm>();
                    for(int i=0;i<actions.Length;i++){
                        var a=actions[i];Log("action",i);
                        switch(a.kind){
                            case "set":case "add":
                                var v=bucket.vars.Find(x=>x.key==a.key);
                                if(v==null){v=new StudioProgramVar{key=a.key};bucket.vars.Add(v);}
                                v.value=Math.Max(-999999,Math.Min(999999,a.kind=="set"?a.value:v.value+a.value));break;
                            case "flagOn":case "flagOff":setFlag(a.key,a.kind=="flagOn");break;
                            case "heal":if(output.hp>0)output.hp=Math.Min(maximum,output.hp+a.value);break;
                            case "shield":output.shield=Math.Min(9999,output.shield+a.value);break;
                            case "damage":output.damage+=a.value;break;
                            case "consume":output.consumed=true;break;
                            case "emit":
                                output.signals.Add(a.key);var path=new List<string>(s.path){r.id};
                                queue.Add(new Signal{name="signal",key=a.key,path=path});break;
                            case "timer":case "stopTimer":
                                bucket.timers.RemoveAll(t=>t.key==a.key&&(a.kind=="stopTimer"||t.id==r.id));
                                if(a.kind=="timer")bucket.timers.Add(new StudioProgramTimer{id=r.id,key=a.key,at=tick+a.value});break;
                            case "reset":case "cancel":
                                var target=Array.Find(all,x=>x.id==a.key);
                                if(target==null)break;var b=stores[target.scope];b.counts.RemoveAll(x=>x.id==a.key);b.timers.RemoveAll(x=>x.id==a.key);
                                if(a.kind=="cancel")Counter(b,a.key).blocked=true;break;
                        }
                    }
                }
            }
            return output;
        }
    }
}

namespace Dreamwalker.Demo
{
    [Serializable] public class StudioProbeInput {public string @event,key;public int tick;}
    [Serializable] public class StudioProbeSpec
    {
        public string actor,map;public int hp,maximum;public string[] flags;public StudioProbeInput[] events;
    }
    [Serializable] public class StudioProbeRequest
    {
        public string format,contentDigest;public int revision;public StudioProbeSpec spec;
    }
    [Serializable] public class StudioProbeOutcome
    {
        public int hp,shield,damage;public string[] flags,steps,trace,state;
    }
    [Serializable] public class StudioProbeReply
    {
        public string format="dreamwalker-rule-result-v1",environment,contentDigest;public int revision;
        public StudioProbeSpec spec;public StudioProbeOutcome outcome;
    }
    public sealed partial class StudioProgramInspection
    {
        private static readonly HashSet<string> Events=new HashSet<string>{"signal","timer","start","enter","menu","storyStart","storyEnd","line","choice","input","hit","hurt","kill","skill","switch","clear","defeat"};
        private static readonly System.Text.RegularExpressions.Regex Key=new System.Text.RegularExpressions.Regex(@"^[a-zA-Z0-9_가-힣-]{1,50}$");
        private static string Row(params object[] fields)
        {
            var text=new string[fields.Length];
            for(int i=0;i<fields.Length;i++)text[i]=Convert.ToString(fields[i],System.Globalization.CultureInfo.InvariantCulture);
            return string.Join("/",text);
        }
        public static StudioProbeReply Replay(StudioRelease release,StudioProbeRequest request,string environment)
        {
            if(release?.project==null || request?.format!="dreamwalker-rule-replay-v1" ||
                request.revision!=release.rev || string.IsNullOrEmpty(release.contentDigest)||release.contentDigest.Length!=64||
                request.contentDigest!=release.contentDigest)throw new ArgumentException("공유 버전 또는 프로젝트 서명이 일치하지 않아요.");
            var s=request.spec;
            if(s==null||release.project.Map(s.map)==null||release.project.Character(s.actor)==null||s.maximum<1||s.maximum>99999||
                s.hp<0||s.hp>s.maximum||s.flags==null||s.flags.Length>64||s.events==null||s.events.Length>120)
                throw new ArgumentException("입력 기록의 대상과 초기 상태를 확인하세요.");
            var flags=new HashSet<string>(StringComparer.Ordinal);
            foreach(var key in s.flags)if(key==null||!Key.IsMatch(key)||!flags.Add(key))throw new ArgumentException("잘못된 초기 상태");
            int hp=s.hp,damage=0,shield=0,last=0,executed=0;
            var machine=new StudioEventMachine(release.project.eventRules);
            var trace=new List<string>();var steps=new List<string>();
            machine.Trace=(t,e,k,r,status,i)=>{
                if(trace.Count>=2048)throw new ArgumentException("규칙 기록이 2048건을 넘었어요.");
                trace.Add(Row(t,e,k,r,status,i));
            };
            StudioProgramResult Send(string moment,string key,int tick){
                if(++executed>4096)throw new ArgumentException("규칙 타이머 실행 한도를 넘었어요.");
                var result=machine.Dispatch(moment,key,tick,s.actor,s.map,hp,s.maximum,flags.Contains,(name,on)=>{if(on)flags.Add(name);else flags.Remove(name);});
                hp=result.hp;shield=Math.Min(9999,shield+result.shield);damage+=result.damage;return result;
            }
            foreach(var e in s.events){
                if(e==null||e.tick<last||e.tick>36000||!Events.Contains(e.@event)||e.key==null||(e.key!=""&&!Key.IsMatch(e.key)))
                    throw new ArgumentException("시간순 입력 기록과 이벤트 이름을 확인하세요.");
                for(int tick=last+1;tick<=e.tick;tick++)foreach(var key in machine.Due(tick))Send("timer",key,tick);
                if(e.@event=="enter")machine.Enter();var result=Send(e.@event,e.key,e.tick);
                steps.Add(Row(e.tick,e.@event,e.key,hp,shield,damage,result.consumed?1:0));last=e.tick;
            }
            var state=new List<string>();
            foreach(string scope in new[]{"save","session","map"}){
                var bucket=machine.Inspect(scope);
                foreach(var v in bucket.vars)state.Add(Row(scope,"v",v.key,v.value));
                foreach(var c in bucket.counts)state.Add(Row(scope,"c",c.id,c.count,c.ready,c.last,c.ran?1:0,c.blocked?1:0));
                foreach(var t in bucket.timers)state.Add(Row(scope,"t",t.id,t.key,t.at));
            }
            state.Sort(StringComparer.Ordinal);var flagList=new List<string>(flags);flagList.Sort(StringComparer.Ordinal);
            return new StudioProbeReply{environment=environment,contentDigest=release.contentDigest,revision=release.rev,spec=s,
                outcome=new StudioProbeOutcome{hp=hp,shield=shield,damage=damage,flags=flagList.ToArray(),state=state.ToArray(),steps=steps.ToArray(),trace=trace.ToArray()}};
        }
    }
}

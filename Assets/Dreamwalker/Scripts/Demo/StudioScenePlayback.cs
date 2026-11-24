using System;
using System.Collections.Generic;
using UnityEngine;

namespace Dreamwalker.Demo
{
public sealed partial class StudioWorld
{
    private readonly StudioStageClock stageTime=new StudioStageClock();
    private readonly Dictionary<string,StudioStageCue> layerVisibility=new Dictionary<string,StudioStageCue>();
    private readonly Dictionary<string,StudioStageCue> layerPosition=new Dictionary<string,StudioStageCue>();
    private StudioStageCue stageCamera;
    private AudioSource stageSound;
    private string pendingStageSound;
    private float sceneAge;
    private void DrawSceneTransition(){
        var f=Map?.camera?.frame;
        if(f==null || f.fadeTicks<=0 || sceneAge>=f.fadeTicks || ShowingFront)return;
        var paint=Tint(f.fadeColor,Color.black);paint.a=1-sceneAge/f.fadeTicks;
        Painter.Box(new Rect(0,0,Screen.width,Screen.height),paint);
    }

    private void BeginStage()
    {
        stageSound?.Stop();pendingStageSound=null;
        stageTime.Reset(Line);layerPosition.Clear();layerVisibility.Clear();stageCamera=null;autoWaited=0;
        if(Line?.stageTrack?.cues!=null)foreach(var c in Line.stageTrack.cues)if(c.kind=="sound")Connection.Sound(c.sound);
        stageTime.Step(0,EmitStageCue);
    }
    private void EmitStageCue(StudioStageCue c){
            switch(c.kind){
            case "flag": if(!string.IsNullOrEmpty(c.key))flow.Flag(c.key,c.on);break;
            case "camera":stageCamera=c;break;
            case "show": case "hide": layerVisibility[c.target]=c;break;
            case "move":layerPosition[c.target]=c;break;
            case "sound":
                pendingStageSound=c.sound;PlayStageSound();
                break;
            }
    }
    private void PlayStageSound(){
        if(string.IsNullOrEmpty(pendingStageSound))return;
        var clip=Connection.Sound(pendingStageSound);
        if(clip!=null){PlayAuthoredFx(ref stageSound,clip);pendingStageSound=null;}
    }
    // The player's auto lines move on once a line has been readable for a while, unless it asks for a choice.
    private void StepStage(float dt){
        if(stageTime.line!=Line)BeginStage();
        float step=Mathf.Clamp(dt,0,.1f);
        bool advance=stageTime.Step(step,EmitStageCue);PlayStageSound();
        autoWaited+=step*60;
        if(!advance&&Settings.autoAdvance&&Line!=null&&Line.choices.Length==0&&autoWaited+.0001f>=AutoWait())advance=true;
        if(advance)Answer();
    }
    private void FinishStageFlags()=>stageTime.Finish(EmitStageCue);
    internal bool StageChoiceAllowed(int i){
        if(Line==null || i<0 || i>=Line.choices.Length)return false;
        var c=Line.choices[i];return flow.Matches(c.flag,c.on);
    }
    internal string StageText => Line?.stageTrack?.Visible(Line.text,(int)(stageTime.ticks+.0001f),Settings.textSpeed)??Line?.text;
    internal bool StageLayerVisible(StudioShotLayer p)=>layerVisibility.TryGetValue(p.id,out var cue)?cue.kind=="show":p.visible;
    internal Vector2 StageLayerOffset(StudioShotLayer p){
        Vector2 offset=layerPosition.TryGetValue(p.id,out var cue)?new Vector2(cue.dx,cue.dy):Vector2.zero;
        if(stageCamera!=null && (p.kind=="backdrop" || p.kind=="art" || p.kind=="portrait"))
            offset+=new Vector2(stageCamera.dx,stageCamera.dy);
        return offset;
    }
}
}

using System;
using System.Collections.Generic;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
using PhysicalKey = UnityEngine.InputSystem.Key;
#else
using PhysicalKey = UnityEngine.KeyCode;
#endif

namespace Dreamwalker.Demo
{
internal sealed partial class StudioScreenView
{
    private StudioWidget editingField, openChoices, rangeField;
    private StudioLayout fieldLayout;
    private string draftText, rangeValue;
    private Vector2 choiceScroll;
    private readonly HashSet<string> usedKeys=new HashSet<string>();
    private int usedFrame=-1;
    private static readonly string[] SkillCodes={"Digit1","Digit2","Digit3","Digit4","Digit5","Digit6","Digit7","Digit8","Digit9","Digit0","Minus","Equal"};
    private static readonly Dictionary<string,PhysicalKey> keyCache=new Dictionary<string,PhysicalKey>();
    private static bool Physical(string code,bool held=false)
    {
        if(!keyCache.TryGetValue(code,out var key)){
            string name=code.StartsWith("Key",StringComparison.Ordinal)?code.Substring(3):code;
            if(code.StartsWith("Arrow",StringComparison.Ordinal))name=code.Substring(5)+"Arrow";
            if(code=="Equal")name="Equals";
#if !ENABLE_INPUT_SYSTEM
            if(code.StartsWith("Digit",StringComparison.Ordinal))name="Alpha"+code.Substring(5);
            if(code=="Enter")name="Return";
#endif
            if(!Enum.TryParse(name,out key))return false;
            keyCache[code]=key;
        }
#if ENABLE_INPUT_SYSTEM
        var keyboard=Keyboard.current;
        return keyboard!=null && (held?keyboard[key].isPressed:keyboard[key].wasPressedThisFrame);
#else
        return held?UnityEngine.Input.GetKey(key):UnityEngine.Input.GetKeyDown(key);
#endif
    }
    private bool MaskGameKey(string code)
    {
        if(!world.Running || world.Project==null || world.Map==null)return false;
        if(world.Project.authoredKeysOnly || editingField!=null || openChoices!=null || (usedFrame==Time.frameCount && usedKeys.Contains(code)))return true;
        if(ActiveShot!=null || Layout?.elements==null)return false;
        foreach(var w in Layout.elements)if(w.shortcut==code && world.Visible(w) && world.Enabled(w))return true;
        return false;
    }
    private readonly StudioInputGestureClock gestureClock=new StudioInputGestureClock();
    private readonly Dictionary<int,StudioWidget> fingerWidgets=new Dictionary<int,StudioWidget>();
    private readonly HashSet<string> allowedMoves=new HashSet<string>();
    private readonly HashSet<int> liveFingers=new HashSet<int>();
    private readonly List<int> lostFingers=new List<int>();
    private static long InputMs=>(long)(Time.unscaledTimeAsDouble*1000);
    private static bool Movement(StudioWidget w)=>w.action=="left"||w.action=="right";
    private void GestureDown(string key,string group,StudioWidget w){
        var layout=Layout;
        gestureClock.Down(key,layout.id+"/"+w.id+"/"+group,w.gesture,InputMs,()=>{
            if(Layout!=layout||!world.Visible(w)||!world.Enabled(w))return;
            if(Movement(w)){if(!world.AllowProgramInput(w.action))return;allowedMoves.Add(key);}
            pressedId=w.id;pressUntil=Time.unscaledTime+.18f;world.Activate(w,!Movement(w));
        });
    }
    private static bool PadPressed(int index){
#if ENABLE_INPUT_SYSTEM
        var p=Gamepad.current;if(p==null)return false;
        switch(index){case 0:return p.buttonSouth.isPressed;case 1:return p.buttonEast.isPressed;case 2:return p.buttonWest.isPressed;case 3:return p.buttonNorth.isPressed;
            case 4:return p.leftShoulder.isPressed;case 5:return p.rightShoulder.isPressed;case 6:return p.leftTrigger.isPressed;case 7:return p.rightTrigger.isPressed;
            case 8:return p.selectButton.isPressed;case 9:return p.startButton.isPressed;case 10:return p.leftStickButton.isPressed;case 11:return p.rightStickButton.isPressed;
            case 12:return p.dpad.up.isPressed;case 13:return p.dpad.down.isPressed;case 14:return p.dpad.left.isPressed;case 15:return p.dpad.right.isPressed;default:return false;}
#else
        return index>=0 && index<16 && UnityEngine.Input.GetKey((KeyCode)((int)KeyCode.JoystickButton0+index));
#endif
    }
    private readonly bool[] lastPad=new bool[16];
    private void PollButton(string key,bool held,bool began,StudioWidget w,ref float horizontal){
        if(began)GestureDown(key,key,w);
        if(!held){gestureClock.End(key,InputMs);allowedMoves.Remove(key);return;}
        gestureClock.Tick(key,InputMs);
        if(allowedMoves.Contains(key))horizontal+=w.action=="left"?-1:1;
    }
    private void FinishTouch(int finger,Vector2 pos,bool cancel){
        pos.y=Screen.height-pos.y;
        if(fingerWidgets.TryGetValue(finger,out var w)&&w.gesture.cancelOutside&&!Hit(w,Bounds(w),pos))cancel=true;
        EndFinger(finger,cancel);
    }
    private void EndFinger(int finger,bool cancel){
        fingerWidgets.Remove(finger);string key="touch"+finger;
        gestureClock.End(key,InputMs,cancel);allowedMoves.Remove(key);
    }
    private bool DefaultDown(string code) => Physical(code) && !MaskGameKey(code);
    private void ReadScreenKeys(ref float horizontal)
    {
#if ENABLE_INPUT_SYSTEM
        if(Keyboard.current!=imeKeyboard){DetachIme();imeKeyboard=Keyboard.current;if(imeKeyboard!=null)imeKeyboard.onIMECompositionChange+=OnComposition;}
#endif
        if(editingField!=null||openChoices!=null||Layout==null){gestureClock.Clear();allowedMoves.Clear();return;}
        var start=Layout;
        if(ActiveShot==null)foreach(var w in start.elements){
            if(!world.Visible(w)||!world.Enabled(w))continue;
            if(w.gesture!=null){
                if(!string.IsNullOrEmpty(w.shortcut))PollButton(w.shortcut,Physical(w.shortcut,true),Physical(w.shortcut),w,ref horizontal);
                if(start!=Layout)return;
                int pad=w.gesture.pad;
                if(pad>=0&&pad<16){bool held=PadPressed(pad);bool padBegan=held&&!lastPad[pad];lastPad[pad]=held;PollButton("pad"+pad,held,padBegan,w,ref horizontal);}
                if(start!=Layout)return;
                continue;
            }
            if(string.IsNullOrEmpty(w.shortcut))continue;
            bool movement=w.action=="left" || w.action=="right";
            bool began=Physical(w.shortcut);
            if(movement){
                if(began && world.AllowProgramInput(w.action))allowedMoves.Add(w.shortcut);
                if(!Physical(w.shortcut,true))allowedMoves.Remove(w.shortcut);
                if(!allowedMoves.Contains(w.shortcut))continue;
                horizontal+=w.action=="left"?-1:1;
            }
            if(!began)continue;
            if(usedFrame!=Time.frameCount){usedFrame=Time.frameCount;usedKeys.Clear();}usedKeys.Add(w.shortcut);
            world.Activate(w,!movement);
            if(start!=Layout)return;
        }
        for(int i=0;i<world.Actor.skills.Length && i<SkillCodes.Length;i++)
            if(DefaultDown(SkillCodes[i]))world.Press("skill"+(i+1));
        if(DefaultDown("KeyX"))world.Press("skill1");
        if(DefaultDown("KeyC"))world.Press("skill2");
        if(DefaultDown("KeyV"))world.Press("skill3");
        if(DefaultDown("KeyB"))world.Press("skill4");
        if(DefaultDown("KeyM"))world.Press(string.IsNullOrEmpty(world.Menu)?"menu":"resume");
        if(DefaultDown("Enter") && world.Line!=null && world.Line.choices.Length==0)world.Answer();
    }
#if ENABLE_INPUT_SYSTEM
    private Keyboard imeKeyboard;
    private string composition="";
    private void DetachIme(){
        if(imeKeyboard!=null)imeKeyboard.onIMECompositionChange-=OnComposition;
        imeKeyboard=null;composition="";
    }
    private void OnComposition(UnityEngine.InputSystem.LowLevel.IMECompositionString value){composition=value.ToString();}
#endif
    private bool ImeActive(){
#if ENABLE_INPUT_SYSTEM
        return !string.IsNullOrEmpty(composition);
#else
        return !string.IsNullOrEmpty(UnityEngine.Input.compositionString);
#endif
    }
    private StudioWidget invalidField;
    private void FinishField(bool keepInvalid=false)
    {
        var field=editingField;
        if(field!=null && field.control.validation!=null && field.control.Value(draftText)==null){invalidField=field;if(keepInvalid)return;}
        else invalidField=null;
        editingField=null;
        GUI.FocusControl(null);
        if(field!=null && fieldLayout==Layout)world.CommitField(field,draftText);
    }
    private void PrepareFields()
    {
        if(fieldLayout!=Layout){
            editingField=null;openChoices=null;rangeField=null;invalidField=null;fieldLayout=Layout;
        }
        if(editingField==null)return;
        var ev=Event.current;
        if(!world.Visible(editingField)||!world.Enabled(editingField)){editingField=null;GUI.FocusControl(null);return;}
        if(ev.type==EventType.MouseDown && !Bounds(editingField).Contains(ev.mousePosition))FinishField();
        else if(ev.type==EventType.KeyDown && (ev.keyCode==KeyCode.Return||ev.keyCode==KeyCode.KeypadEnter)){
            if(ImeActive())return;
            FinishField(true);ev.Use();
        }
    }
    private void DrawField(StudioWidget w,Rect r,Color fill)
    {
        var spec=w.control;
        var color=StudioWorld.Tint(w.color,Color.white);
        var accent=StudioWorld.Tint(w.pressedColor,color);
        var style=Style(Mathf.Clamp(Mathf.RoundToInt(w.fontSize*Mathf.Min(Screen.width/800f,1.4f)),8,90),w.align,color,w.fontFamily);
        float radius=Mathf.Min(r.width,r.height)*w.radius/100;
        GUI.DrawTexture(r,Texture2D.whiteTexture,ScaleMode.StretchToFill,true,0,fill,0,radius);
        if(w.borderWidth>0 || editingField==w)GUI.DrawTexture(r,Texture2D.whiteTexture,ScaleMode.StretchToFill,true,0,
            editingField==w?accent:StudioWorld.Tint(w.borderColor,color),editingField==w?Mathf.Max(2,w.borderWidth):w.borderWidth,radius);
        var art=world.Connection.Texture(w.image);
        if(art!=null)GUI.DrawTexture(r,art,w.imageFit=="cover"?ScaleMode.ScaleAndCrop:w.imageFit=="stretch"?ScaleMode.StretchToFill:ScaleMode.ScaleToFit);
        float gutter=Mathf.Min(6,r.width*.04f);
        var area=new Rect(r.x+gutter,r.y,Mathf.Max(1,r.width-gutter*2),r.height);
        if(!string.IsNullOrEmpty(w.text)){
            float width=Mathf.Min(area.width*.48f,style.CalcSize(new GUIContent(w.text)).x+gutter);
            GUI.Label(new Rect(area.x,area.y,width,area.height),w.text,style);area.x+=width;area.width-=width;
        }
        bool wasEnabled=GUI.enabled;GUI.enabled=wasEnabled&&world.Enabled(w);
        string current=world.FieldValue(w);
        if(spec.mode=="toggle"){
            if(GUI.Button(area,current=="true"?"☑":"☐",style))world.CommitField(w,current=="true"?"false":"true");
        }else if(spec.mode=="choice"){
            if(GUI.Button(area,current+" ▾",style)){openChoices=w;fieldLayout=Layout;choiceScroll=Vector2.zero;}
        }else if(spec.mode=="range"){
            var track=new Rect(area.x,area.y+area.height*.1f,area.width*.75f,area.height*.8f);
            string display=rangeField==w?rangeValue:current;
            if(!int.TryParse(display,out int numeric))numeric=spec.min;
            float ratio=Mathf.InverseLerp(spec.min,spec.max,numeric), knob=Mathf.Min(18,track.height*.8f);
            Fill(new Rect(track.x,track.center.y-1,track.width,2),color);
            GUI.DrawTexture(new Rect(track.x+(track.width-knob)*ratio,track.center.y-knob/2,knob,knob),Texture2D.whiteTexture,ScaleMode.StretchToFill,true,0,accent,0,knob/2);
            float v=GUI.HorizontalSlider(track,numeric,spec.min,spec.max,GUIStyle.none,GUIStyle.none);
            string next=spec.Value(Mathf.RoundToInt(v).ToString(System.Globalization.CultureInfo.InvariantCulture));
            if(next!=display){rangeValue=next;rangeField=w;}
            if(rangeField==w && GUIUtility.hotControl==0){world.CommitField(w,rangeValue);rangeField=null;}
            GUI.Label(new Rect(track.xMax,area.y,area.xMax-track.xMax,area.height),next,style);
        }else{
            string name="dw-field-"+Layout.id+"-"+w.id;
            GUI.SetNextControlName(name);
            string before=editingField==w?draftText:current;
            string after=GUI.TextField(area,before,spec.mode=="text"?spec.limit:10,style);
            if(GUI.GetNameOfFocusedControl()==name){
                if(after!=before)invalidField=null;
                editingField=w;fieldLayout=Layout;draftText=after;
            }else if(editingField==w){var old=draftText;editingField=null;world.CommitField(w,old);}
            if(string.IsNullOrEmpty(after) && editingField!=w && !string.IsNullOrEmpty(spec.hint))GUI.Label(area,spec.hint,style);
        }
        GUI.enabled=wasEnabled;
        if(invalidField==w){
            string hint=string.IsNullOrEmpty(spec.validation?.message)?"입력 조건을 확인하세요.":spec.validation.message;
            float height=Mathf.Clamp(style.lineHeight+6,22,55);
            var help=new Rect(r.x,r.yMax+height<=Screen.height?r.yMax:Mathf.Max(0,r.y-height),r.width,height);
            Fill(help,Color.black);GUI.Label(help,"! "+hint,style);
        }
    }
    internal GUIStyle ItemStyle(StudioWidget w,GUIStyle fallback){
        var s=w.itemSkin;
        return s==null||s.size<8?fallback:Style(Mathf.Clamp(Mathf.RoundToInt(s.size*Mathf.Min(Screen.width/800f,1.4f)),8,90),w.align,StudioWorld.Tint(s.color,Color.white));
    }
    internal bool ItemButton(StudioWidget w,Rect area,string label,GUIStyle style,bool nativeDefault=false){
        var s=w.itemSkin;
        if(s==null||s.size<8)return nativeDefault?GUI.Button(area,label):GUI.Button(area,label,style);
        float radius=Mathf.Min(area.width,area.height)*s.radius/100;
        Color fill=StudioWorld.Tint(GUIUtility.hotControl!=0&&area.Contains(Event.current.mousePosition)?s.press:s.fill,Color.gray);
        GUI.DrawTexture(area,Texture2D.whiteTexture,ScaleMode.StretchToFill,true,0,fill,0,radius);
        if(s.width>0)GUI.DrawTexture(area,Texture2D.whiteTexture,ScaleMode.StretchToFill,true,0,StudioWorld.Tint(s.edge,Color.gray),s.width,radius);
        return GUI.Button(area,label,ItemStyle(w,style));
    }
    private void DrawChoices()
    {
        var w=openChoices;
        if(w==null||!world.Visible(w)||!world.Enabled(w)){openChoices=null;return;}
        var r=Bounds(w);float row=Mathf.Clamp(r.height,32,64);
        float width=Mathf.Min(Screen.width,Mathf.Max(120,r.width)), height=Mathf.Min(Screen.height*.65f,row*w.control.options.Length);
        float y=r.yMax+height<=Screen.height?r.yMax:Mathf.Max(0,r.y-height);
        var popup=new Rect(Mathf.Clamp(r.x,0,Screen.width-width),y,width,height);
        var ev=Event.current;
        if((ev.type==EventType.MouseDown && !popup.Contains(ev.mousePosition)) || (ev.type==EventType.KeyDown && ev.keyCode==KeyCode.Escape)){
            openChoices=null;ev.Use();return;
        }
        Fill(popup,StudioWorld.Tint(w.background,Color.black));
        var style=Style(Mathf.Clamp(w.fontSize,8,64),w.align,StudioWorld.Tint(w.color,Color.white));
        float inner=width-(row*w.control.options.Length>height?18:0);
        choiceScroll=GUI.BeginScrollView(popup,choiceScroll,new Rect(0,0,inner,row*w.control.options.Length));
        string chosen=null;
        for(int i=0;i<w.control.options.Length;i++){
            var area=new Rect(0,row*i,inner,row);
            string option=w.control.options[i];
            if(world.FieldValue(w)==option)Fill(area,StudioWorld.Tint(w.pressedColor,Color.gray));
            if(GUI.Button(area,option,style))chosen=option;
        }
        GUI.EndScrollView();
        if(chosen!=null){openChoices=null;world.CommitField(w,chosen);}
    }
}
}

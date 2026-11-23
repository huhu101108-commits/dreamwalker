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
        if(editingField!=null || openChoices!=null)return true;
        if(ActiveShot!=null || Layout?.elements==null)return false;
        foreach(var w in Layout.elements)if(w.shortcut==code && world.Visible(w) && world.Enabled(w))return true;
        return false;
    }
    private bool DefaultDown(string code) => Physical(code) && !MaskGameKey(code);
    private void ReadScreenKeys(ref float horizontal)
    {
#if ENABLE_INPUT_SYSTEM
        if(Keyboard.current!=imeKeyboard){DetachIme();imeKeyboard=Keyboard.current;if(imeKeyboard!=null)imeKeyboard.onIMECompositionChange+=OnComposition;}
#endif
        if(editingField!=null || openChoices!=null || Layout==null)return;
        var start=Layout;
        if(ActiveShot==null)foreach(var w in start.elements){
            if(string.IsNullOrEmpty(w.shortcut)||!world.Visible(w)||!world.Enabled(w))continue;
            bool movement=w.action=="left" || w.action=="right";
            if(movement && Physical(w.shortcut,true))horizontal+=w.action=="left"?-1:1;
            if(!Physical(w.shortcut))continue;
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
    private void FinishField()
    {
        var field=editingField;
        editingField=null;
        GUI.FocusControl(null);
        if(field!=null && fieldLayout==Layout)world.CommitField(field,draftText);
    }
    private void PrepareFields()
    {
        if(fieldLayout!=Layout){
            editingField=null;openChoices=null;rangeField=null;fieldLayout=Layout;
        }
        if(editingField==null)return;
        var ev=Event.current;
        if(!world.Visible(editingField)||!world.Enabled(editingField)){editingField=null;GUI.FocusControl(null);return;}
        if(ev.type==EventType.MouseDown && !Bounds(editingField).Contains(ev.mousePosition))FinishField();
        else if(ev.type==EventType.KeyDown && (ev.keyCode==KeyCode.Return||ev.keyCode==KeyCode.KeypadEnter)){
            if(ImeActive())return;
            FinishField();ev.Use();
        }
    }
    private void DrawField(StudioWidget w,Rect r,Color fill)
    {
        var spec=w.control;
        var color=StudioWorld.Tint(w.color,Color.white);
        var accent=StudioWorld.Tint(w.pressedColor,color);
        var style=Style(Mathf.Clamp(Mathf.RoundToInt(w.fontSize*Mathf.Min(Screen.width/800f,1.4f)),8,90),w.align,color);
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
                editingField=w;fieldLayout=Layout;draftText=after;
            }else if(editingField==w){var old=draftText;editingField=null;world.CommitField(w,old);}
            if(string.IsNullOrEmpty(after) && editingField!=w && !string.IsNullOrEmpty(spec.hint))GUI.Label(area,spec.hint,style);
        }
        GUI.enabled=wasEnabled;
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

using System;
namespace Dreamwalker.Demo
{
// Positions are game-space metres. One horizontal map unit is 1/3.5 m, one vertical unit is 0.16 m.
[Serializable] public class StudioDodge
{
    public bool enabled;public int ticks,cooldown,invFrom,invTo;public float distance;
    public bool Guard(int elapsed)=>enabled && invFrom>0 && elapsed>=invFrom && elapsed<=invTo;
}
[Serializable] public class StudioHurtWindow
{
    public int from,to;public float x,y,w,h;
}
[Serializable] public class StudioStrike
{
    public string shape;
    public int startup,active,recovery,comboFrom,comboTo,buffer,cancelFrom,cancelTo,invFrom,invTo,repeat;
    public float x,y,w,h;
    public StudioHurtWindow hurt;
    public bool Combo(int tick)=>comboFrom>0&&tick>=comboFrom&&tick<=comboTo;
    public bool Cancel(int tick)=>cancelFrom>0&&tick>=cancelFrom&&tick<=cancelTo;
    public bool Guard(int tick)=>invFrom>0&&tick>=invFrom&&tick<=invTo;
    public bool EnemyContact(int tick,int face,float dx,float dy,float reach,float vertical)
    {
        var b=hurt;
        if(b==null||b.from<1||tick<b.from||tick>b.to)return Math.Abs(dx)<reach&&Math.Abs(dy)<vertical;
        return Math.Abs(dx+face*b.x)<=reach+b.w/2 && Math.Abs(dy+b.y)<=vertical+b.h/2;
    }
    public bool Touches(float px,float py,float ex,float ey,int face,float width,float height)
    {
        float ew=width>0?width:.7f,eh=height>0?height:1.6f;
        return Math.Abs((ex-px)*face-x)<=(w+ew)/2 && Math.Abs(ey-py+eh/2-y)<=(h+eh)/2;
    }
}
public static class StudioCombatClock
{
    public static bool SweepTouches(float playerX, float playerY, float targetX, float targetY, int facing,
                                    float reach, float from, float to, float width = .7f, float height = 1.6f)
    {
        float halfW = (width > 0 ? width : .7f) / 2, halfH = (height > 0 ? height : 1.6f) / 2;
        float dx = (targetX - playerX) * facing - .25f, dy = targetY - playerY + halfH - 1.01f;
        float x = dx - Math.Max(-halfW, Math.Min(halfW, dx)), y = dy - Math.Max(-halfH, Math.Min(halfH, dy));
        if (x * x + y * y < .0001f)
        {
            x = dx;
            y = dy;
        }
        double angle = Math.Atan2(y, x) * 180 / Math.PI;
        return x * x + y * y <= reach * reach &&
               (x * x + y * y < .0001f || (angle >= from - 7 && angle <= to + 7));
    }
    public static float Angle(int activeFrame, int activeTicks) => -55f + 110f * activeFrame / activeTicks;
}
}

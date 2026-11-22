using System;
namespace Dreamwalker.Demo
{
// Positions are game-space metres. One horizontal map unit is 1/3.5 m, one vertical unit is 0.16 m.
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

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

using System;

namespace Dreamwalker.Demo
{
    // JsonUtility and the headless C# integration test consume these exact wire fields.
    public static class StudioArenaProtocol
    {
        [Serializable] public class Actor { public string id, name; }
        [Serializable] public class Fighter
        {
            public string actor, name;
            public int hp, maxHp, x, y, seq, face, shield, hits;
            public bool attacking, dodging;
        }
        [Serializable] public class Snapshot
        {
            public string code, status, reason, release;
            public int seat, revision, winner, tick, hz, remaining, countdown, width;
            public Fighter[] players;
        }
        [Serializable] public class Wallet { public int credits, medals, wins; }
        [Serializable] public class Listing { public string id; public int price; public bool mine; }
        [Serializable] public class ArenaControl
        {
            public string id,label,hint,color,fill,press,edge;
            public float width,radius,x,y,w,h;
            public int size,height,span;
        }
        [Serializable] public class Reply
        {
            public string token, error;
            public int protocol;
            public Snapshot room;
            public Wallet wallet;
            public Listing[] listings;
            public Actor[] actors;
            public ArenaControl[] controls;
        }
        [Serializable] public class Command
        {
            public string code = "", actor = "", id = "";
            public int axis, seq, press, price;
            public bool native;
        }
    }
}

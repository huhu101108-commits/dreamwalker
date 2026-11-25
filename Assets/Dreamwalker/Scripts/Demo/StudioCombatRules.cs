using System;
using System.Collections.Generic;

namespace Dreamwalker.Demo
{
    [Serializable] public class StudioRuleEffect { public string kind; public int amount; }
    [Serializable] public class StudioCombatRule
    {
        public string id, name, actor, @event, appliesTo;
        public bool enabled;
        public int every, hpBelow, cooldown;
        public StudioRuleEffect[] effects;
    }
    [Serializable] public class StudioRuleCounter { public string id; public int count, ready; }
    [Serializable] public class StudioActorRules
    {
        public string actor;
        public int shield,dodgeReady;
        public int energy;
        public bool energySet;
        public List<StudioRuleCounter> counters = new List<StudioRuleCounter>();

        // Each character keeps its own skill gauge. Older saves start from the authored value.
        public int Energy(StudioEnergy gauge)
        {
            if (gauge == null || gauge.max <= 0) return 0;
            if (!energySet) { energy = gauge.start; energySet = true; }
            energy = Math.Max(0, Math.Min(gauge.max, energy));
            return energy;
        }
        public void Gain(StudioEnergy gauge, int amount)
        {
            if (gauge == null || gauge.max <= 0 || amount <= 0) return;
            energy = Math.Min(gauge.max, Energy(gauge) + amount);
        }
        public bool Spend(StudioEnergy gauge, int cost)
        {
            if (cost <= 0) return true;
            if (gauge == null || gauge.max <= 0 || Energy(gauge) < cost) return false;
            energy -= cost;
            return true;
        }

        public int Absorb(int amount)
        {
            int blocked = Math.Min(shield, amount);
            shield -= blocked;
            return amount - blocked;
        }

        public int Apply(StudioCombatRule[] rules, string moment, int tick, ref int hp, int maximum)
        {
            int damage = 0, healing = 0;
            if (hp <= 0 || rules == null) return 0;
            foreach (var rule in rules)
            {
                if (rule == null || !rule.enabled || rule.appliesTo == "arena" || rule.@event != moment || rule.every < 1 ||
                    (!string.IsNullOrEmpty(rule.actor) && rule.actor != actor) || hp * 100 > maximum * rule.hpBelow) continue;
                var counter = counters.Find(value => value.id == rule.id);
                if (counter == null) { counter = new StudioRuleCounter { id = rule.id }; counters.Add(counter); }
                counter.count = (counter.count + 1) % rule.every;
                if (counter.count != 0 || tick < counter.ready) continue;
                counter.ready = tick + rule.cooldown;
                foreach (var effect in rule.effects ?? Array.Empty<StudioRuleEffect>())
                {
                    if (effect.kind == "damage") damage += effect.amount;
                    else if (effect.kind == "heal") healing += effect.amount;
                    else if (effect.kind == "shield") shield = Math.Min(9999, shield + effect.amount);
                }
            }
            hp = Math.Min(maximum, hp + healing);
            return damage;
        }
    }
}

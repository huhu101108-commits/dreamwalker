using System.Collections;
using UnityEngine;

namespace Dreamwalker.Combat
{
    public enum CombatFaction { Player, Enemy }

    [DisallowMultipleComponent]
    public sealed class CombatTarget : MonoBehaviour
    {
        [SerializeField] private CombatFaction faction = CombatFaction.Enemy;
        [SerializeField, Min(1)] private int maximumHealth = 100;
        [SerializeField] private bool trainingDummyRespawns = false;

        private int health;
        private Collider2D bodyCollider;
        private SpriteRenderer[] renderers;
        private Color[] initialColors;
        private Coroutine flash;

        public CombatFaction Faction => faction;
        public int Health => health;

        private void Awake()
        {
            health = maximumHealth;
            bodyCollider = GetComponent<Collider2D>();
            renderers = GetComponentsInChildren<SpriteRenderer>();
            initialColors = new Color[renderers.Length];
            for (int i = 0; i < renderers.Length; i++) initialColors[i] = renderers[i].color;
        }

        public void Setup(CombatFaction team, int maxHealth, bool respawn = false)
        {
            faction = team;
            maximumHealth = Mathf.Max(1, maxHealth);
            trainingDummyRespawns = respawn;
            health = maximumHealth;
        }

        public void ApplyStudioHealth(int value)
        {
            int previous = maximumHealth;
            maximumHealth = Mathf.Max(1, value);
            if (health > 0) health = Mathf.Clamp(health + maximumHealth - previous, 1, maximumHealth);
        }

        public void RestoreHealth(int value) => health = Mathf.Clamp(value, 0, maximumHealth);

        public bool TakeDamage(int damage, CombatFaction attacker, Vector2 knockback)
        {
            if (attacker == faction || health <= 0 || damage <= 0) return false;
            health = Mathf.Max(0, health - damage);

            Rigidbody2D body = GetComponent<Rigidbody2D>();
            if (body != null && body.bodyType == RigidbodyType2D.Dynamic)
                body.AddForce(knockback, ForceMode2D.Impulse);

            if (flash != null) StopCoroutine(flash);
            flash = StartCoroutine(Flash());
            Debug.Log($"{name} hit: -{damage} HP; remaining {health}");

            if (health == 0)
            {
                if (trainingDummyRespawns) StartCoroutine(ReviveTrainingDummy());
                else Debug.Log($"{name} defeated.");
            }

            return true;
        }

        private IEnumerator Flash()
        {
            for (int i = 0; i < renderers.Length; i++)
                if (renderers[i] != null) renderers[i].color = Color.Lerp(initialColors[i], new Color(1f, .40f, .44f), .7f);
            yield return new WaitForSeconds(.09f);
            for (int i = 0; i < renderers.Length; i++)
                if (renderers[i] != null) renderers[i].color = initialColors[i];
            flash = null;
        }

        private IEnumerator ReviveTrainingDummy()
        {
            if (bodyCollider != null) bodyCollider.enabled = false;
            yield return new WaitForSeconds(1.6f);
            health = maximumHealth;
            if (bodyCollider != null) bodyCollider.enabled = true;
        }
    }
}

using System.Collections.Generic;
using Dreamwalker.Input;
using Dreamwalker.Player;
using UnityEngine;

namespace Dreamwalker.Combat
{
    /// <summary>
    /// Exactly one damage event per target per slash. The visible swept curve
    /// and the hit calculation share the same angles and the same reach.
    /// </summary>
    [RequireComponent(typeof(BaekseolMotor))]
    public sealed class BaekseolSlash : MonoBehaviour
    {
        [Header("Attack Timing (seconds)")]
        [SerializeField, Min(.01f)] private float anticipation = .095f;
        [SerializeField, Min(.01f)] private float active = .11f;
        [SerializeField, Min(.01f)] private float recovery = .22f;

        [Header("Attack Geometry")]
        [SerializeField] private Vector2 centerOffset = new Vector2(.25f, 1.01f);
        [SerializeField, Min(.2f)] private float reach = 1.66f;
        [SerializeField, Range(15f, 85f)] private float arcHalfAngle = 55f;
        [SerializeField, Min(1)] private int damage = 18;
        [SerializeField] private LayerMask targetLayers = ~0;

        [Header("Visuals")]
        [SerializeField] private Transform weaponPivot;
        [SerializeField] private SwordSlashVfx vfx;

        private BaekseolMotor motor;
        private readonly HashSet<int> damaged = new HashSet<int>();
        private float timer;
        private float previousAngle;
        private bool attacking;
        private bool bufferedAttack;
        private bool requestAttack;

        public bool IsAttacking => attacking;
        public Vector2 Offset => centerOffset;
        public float Reach => reach;
        public float HalfAngle => arcHalfAngle;

        private void Awake() => motor = GetComponent<BaekseolMotor>();

        public void SetVisuals(Transform pivot, SwordSlashVfx effect)
        {
            weaponPivot = pivot;
            vfx = effect;
        }

        public void ApplyStudioAttack(int power, float distance)
        {
            damage = power;
            reach = distance;
        }

        public void RequestAttack() => requestAttack = true;

        private void Update()
        {
            bool pressed = DreamwalkerInput.AttackPressed() || requestAttack;
            requestAttack = false;
            if (pressed)
            {
                if (!attacking) StartSlash();
                else if (timer >= anticipation + active) bufferedAttack = true;
            }
            if (!attacking) return;

            timer += Time.deltaTime;
            float activeStart = anticipation;
            float activeEnd = anticipation + active;
            float total = activeEnd + recovery;

            if (timer < activeStart)
            {
                float t = timer / anticipation;
                SetBladeAngle(Mathf.Lerp(-78f, -arcHalfAngle, t));
                if (vfx != null) vfx.ShowAnticipation(centerOffset, reach, arcHalfAngle);
            }
            else if (timer <= activeEnd)
            {
                float t = Mathf.Clamp01((timer - activeStart) / active);
                float currentAngle = Mathf.Lerp(-arcHalfAngle, arcHalfAngle, t);
                SetBladeAngle(currentAngle);
                HitBetween(previousAngle, currentAngle);
                previousAngle = currentAngle;
                if (vfx != null) vfx.ShowStrike(centerOffset, reach, arcHalfAngle, currentAngle);
            }
            else if (timer < total)
            {
                float t = (timer - activeEnd) / recovery;
                SetBladeAngle(Mathf.Lerp(arcHalfAngle, -70f, t));
                if (vfx != null) vfx.ShowRecovery(t);
            }
            else
            {
                attacking = false;
                if (vfx != null) vfx.Hide();
                SetBladeAngle(-70f);
                if (bufferedAttack)
                {
                    bufferedAttack = false;
                    StartSlash();
                }
            }
        }

        private void StartSlash()
        {
            attacking = true;
            bufferedAttack = false;
            timer = 0f;
            previousAngle = -arcHalfAngle;
            damaged.Clear();
            if (vfx != null) vfx.Hide();
            SetBladeAngle(-78f);
        }

        private void SetBladeAngle(float angle)
        {
            // Sword sprite points along local +Y, so subtract 90 degrees.
            if (weaponPivot != null)
                weaponPivot.localRotation = Quaternion.Euler(0f, 0f, angle - 90f);
        }

        private void HitBetween(float fromAngle, float toAngle)
        {
            int facing = motor.Facing;
            Vector2 center = (Vector2)transform.position
                + new Vector2(centerOffset.x * facing, centerOffset.y);
            Collider2D[] candidates = Physics2D.OverlapCircleAll(center, reach, targetLayers);
            foreach (Collider2D collider in candidates)
            {
                CombatTarget target = collider.GetComponentInParent<CombatTarget>();
                if (target == null || target.Faction == CombatFaction.Player) continue;
                int id = target.GetInstanceID();
                if (damaged.Contains(id)) continue;

                Vector2 point = collider.ClosestPoint(center);
                if ((point - center).sqrMagnitude < .0001f)
                    point = collider.bounds.center;
                if (!CombatGeometry.IsInsideSweptArc(center, point, facing,
                    reach, fromAngle, toAngle)) continue;

                Vector2 push = new Vector2(facing * 2.2f, 1.35f);
                if (target.TakeDamage(damage, CombatFaction.Player, push))
                {
                    damaged.Add(id);
                    if (vfx != null) vfx.SpawnImpact(point);
                }
            }
        }

#if UNITY_EDITOR
        private void OnDrawGizmosSelected()
        {
            Gizmos.color = new Color(.2f, .8f, 1f, .7f);
            int facing = Application.isPlaying && motor != null ? motor.Facing : 1;
            Vector3 origin = transform.position + new Vector3(centerOffset.x * facing, centerOffset.y);
            Vector3 previous = origin + new Vector3(facing *
                Mathf.Cos(-arcHalfAngle * Mathf.Deg2Rad) * reach,
                Mathf.Sin(-arcHalfAngle * Mathf.Deg2Rad) * reach);
            for (int i = 1; i <= 24; i++)
            {
                float a = Mathf.Lerp(-arcHalfAngle, arcHalfAngle, i / 24f);
                Vector3 point = origin + new Vector3(facing *
                    Mathf.Cos(a * Mathf.Deg2Rad) * reach,
                    Mathf.Sin(a * Mathf.Deg2Rad) * reach);
                Gizmos.DrawLine(previous, point);
                previous = point;
            }
        }
#endif
    }
}

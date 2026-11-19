using UnityEngine;

namespace Dreamwalker.Combat
{
    /// <summary>
    /// Geometry is shared by hit detection and the visible attack arc.
    /// Directions are expressed in local forward-facing coordinates.
    /// </summary>
    public static class CombatGeometry
    {
        public static bool IsInsideSweptArc(
            Vector2 origin, Vector2 point, int facing,
            float maxRadius, float fromDegrees, float toDegrees,
            float angularTolerance = 7f)
        {
            Vector2 delta = point - origin;
            if (delta.sqrMagnitude > maxRadius * maxRadius) return false;
            if (delta.sqrMagnitude < 0.0001f) return true;

            delta.x *= facing >= 0 ? 1 : -1;
            float angle = Mathf.Atan2(delta.y, delta.x) * Mathf.Rad2Deg;
            return angle >= Mathf.Min(fromDegrees, toDegrees) - angularTolerance
                && angle <= Mathf.Max(fromDegrees, toDegrees) + angularTolerance;
        }

        public static Vector3 ArcPoint(Vector2 center, float radius, float degrees)
        {
            float radians = degrees * Mathf.Deg2Rad;
            return new Vector3(
                center.x + Mathf.Cos(radians) * radius,
                center.y + Mathf.Sin(radians) * radius, 0f);
        }
    }
}

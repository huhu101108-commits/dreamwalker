using UnityEngine;

namespace Dreamwalker.Combat
{
    /// <summary>
    /// Procedural arc renderer; no sprite atlas is needed for this prototype.
    /// Attach below the horizontally flipped visual root of the character.
    /// </summary>
    public sealed class SwordSlashVfx : MonoBehaviour
    {
        private LineRenderer glow;
        private LineRenderer core;
        private LineRenderer warning;
        private Material lineMaterial;
        private readonly Vector3[] points = new Vector3[26];

        private void Awake()
        {
            Shader shader = Shader.Find("Sprites/Default");
            if (shader == null) shader = Shader.Find("Unlit/Color");
            lineMaterial = new Material(shader);
            glow = CreateLine("Blue glow", .25f, new Color(.30f, .72f, 1f, .60f), 26, 31);
            core = CreateLine("Blade streak", .07f, new Color(.93f, .99f, 1f, .98f), 26, 32);
            warning = CreateLine("Range telegraph", .025f, new Color(.42f, .82f, 1f, .35f), 26, 30);
            Hide();
        }

        private LineRenderer CreateLine(string label, float width, Color tint, int count, int sort)
        {
            GameObject g = new GameObject(label);
            g.transform.SetParent(transform, false);
            LineRenderer lr = g.AddComponent<LineRenderer>();
            lr.useWorldSpace = false;
            lr.sharedMaterial = lineMaterial;
            lr.startWidth = lr.endWidth = width;
            lr.numCornerVertices = 4;
            lr.positionCount = count;
            lr.startColor = lr.endColor = tint;
            lr.sortingOrder = sort;
            return lr;
        }

        public void ShowAnticipation(Vector2 center, float reach, float halfAngle)
        {
            warning.enabled = true;
            glow.enabled = core.enabled = false;
            DrawArc(warning, center, reach, -halfAngle, halfAngle);
        }

        public void ShowStrike(Vector2 center, float reach, float halfAngle, float angle)
        {
            warning.enabled = false;
            glow.enabled = core.enabled = true;
            float beginning = Mathf.Max(-halfAngle, angle - 34f);
            DrawArc(glow, center, reach, beginning, angle);
            DrawArc(core, center, reach, beginning, angle);
        }

        public void ShowRecovery(float t)
        {
            warning.enabled = false;
            // The streak fades off quickly after the actual hit window.
            Color g = glow.startColor;
            Color c = core.startColor;
            g.a = .60f * (1f - Mathf.Clamp01(t * 3f));
            c.a = .98f * (1f - Mathf.Clamp01(t * 3f));
            glow.startColor = glow.endColor = g;
            core.startColor = core.endColor = c;
            if (t > .35f) { glow.enabled = false; core.enabled = false; }
        }

        private void DrawArc(LineRenderer renderer, Vector2 center,
            float radius, float min, float max)
        {
            for (int i = 0; i < points.Length; i++)
                points[i] = CombatGeometry.ArcPoint(
                    center, radius, Mathf.Lerp(min, max, i / (float)(points.Length - 1)));
            renderer.SetPositions(points);
        }

        public void Hide()
        {
            if (glow != null)
            {
                glow.enabled = core.enabled = warning.enabled = false;
                Color g = new Color(.30f, .72f, 1f, .60f);
                Color c = new Color(.93f, .99f, 1f, .98f);
                glow.startColor = glow.endColor = g;
                core.startColor = core.endColor = c;
            }
        }

        public void SpawnImpact(Vector2 worldPosition)
        {
            GameObject g = new GameObject("Sword hit particles");
            g.transform.position = worldPosition;
            ParticleSystem ps = g.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main;
            main.loop = false;
            main.duration = .24f;
            main.startLifetime = new ParticleSystem.MinMaxCurve(.12f, .24f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(1.8f, 4.5f);
            main.startSize = new ParticleSystem.MinMaxCurve(.05f, .11f);
            main.startColor = new Color(.75f, .91f, 1f);
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            var emission = ps.emission;
            emission.enabled = false;
            var shape = ps.shape;
            shape.shapeType = ParticleSystemShapeType.Circle;
            shape.radius = .04f;
            ParticleSystemRenderer renderer = ps.GetComponent<ParticleSystemRenderer>();
            renderer.sharedMaterial = lineMaterial;
            renderer.sortingOrder = 40;
            ps.Emit(18);
            Destroy(g, .5f);
        }

        private void OnDestroy()
        {
            if (lineMaterial != null) Destroy(lineMaterial);
        }
    }
}

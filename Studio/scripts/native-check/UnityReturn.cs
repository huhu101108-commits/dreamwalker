using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using Dreamwalker.EditorTools;
// The web studio checks the same rule fixture in scripts/test-unity-return.mjs.
public static class UnityReturn
{
#pragma warning disable CS0649 // Filled from the shared JSON fixture.
    private sealed class TextCase { public string text, normal, sha256; }
    private sealed class PathCase { public string path, media; public bool source; }
    private sealed class Fixture { public TextCase[] texts; public PathCase[] paths; }
#pragma warning restore CS0649
    private static void Write(string root, string path, byte[] bytes)
    {
        string full = Path.Combine(root, path.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(Path.GetDirectoryName(full));
        File.WriteAllBytes(full, bytes);
    }
    private static void Write(string root, string path, string text) => Write(root, path, Encoding.UTF8.GetBytes(text));
    public static void Run()
    {
        var format = new JsonSerializerOptions { IncludeFields = true };
        var f = JsonSerializer.Deserialize<Fixture>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "unity-return.json")), format);
        foreach (var t in f.texts)
            if (StudioChangeReturn.Normalize(t.text) != t.normal || StudioChangeReturn.TextHash(t.text) != t.sha256)
                throw new Exception("text normalisation or digest differs from the studio: " + JsonSerializer.Serialize(t.text));
        foreach (var p in f.paths)
            if (StudioChangeReturn.SourcePath(p.path) != p.source || StudioChangeReturn.MediaKind(p.path) != p.media)
                throw new Exception("path rule differs from the studio: " + p.path);

        string root = Path.Combine(Path.GetTempPath(), "dreamwalker-unity-return-" + Guid.NewGuid().ToString("N"));
        try
        {
            var png = new byte[] { 137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82 };
            Write(root, "Assets/Scripts/NewSkill.cs", "﻿using UnityEngine;\r\nclass NewSkill {}\r\n");
            Write(root, "Assets/Scripts/NewSkill.cs.meta", "fileFormatVersion: 2\nguid: 0123456789abcdef0123456789abcdef\n");
            Write(root, "Assets/Scripts.meta", "fileFormatVersion: 2\nguid: fedcba9876543210fedcba9876543210\nfolderAsset: yes\n");
            Write(root, "Assets/Art/hero.png", png);
            Write(root, "Assets/Art/hero.png.meta", "fileFormatVersion: 2\n");
            Write(root, "Assets/Models/thing.fbx", new byte[] { 0, 1, 2, 3 });
            Write(root, "Assets/Models/thing.fbx.meta", "fileFormatVersion: 2\n");
            Write(root, "Assets/Scripts/Big.cs", new string('a', StudioChangeReturn.MaxText + 1));
            Write(root, "Assets/Scenes/Binary.unity", new byte[] { 85, 110, 0, 105 });
            Write(root, "Assets/Dreamwalker/Kept.cs", "class Kept {}\r\n");
            Write(root, "Assets/Dreamwalker/Edited.cs", "class Edited { int next; }\n");
            Write(root, "Assets/Resources/DreamwalkerStudio/release.json", "{}");
            Write(root, "Assets/.hidden/Secret.cs", "class Secret {}");
            Write(root, "Assets/Temp~/Ignored.cs", "class Ignored {}");
            Write(root, "ProjectSettings/DreamwalkerStudioImport.json", "{}");
            Write(root, "ProjectSettings/ProjectSettings.asset", "%YAML 1.1\nPlayerSettings:\n  productName: Snow\n");
            var studio = new StudioSourceManifest { rev = 7, files = new[] {
                new StudioSourceHash { path = "Assets/Dreamwalker/Kept.cs", sha256 = StudioChangeReturn.TextHash("class Kept {}\n") },
                new StudioSourceHash { path = "Assets/Dreamwalker/Edited.cs", sha256 = StudioChangeReturn.TextHash("class Edited {}\n") },
                new StudioSourceHash { path = "Assets/Dreamwalker/Removed.cs", sha256 = StudioChangeReturn.TextHash("class Removed {}\n") } } };
            var plan = StudioChangeReturn.Plan(root, studio);
            string Rows() => string.Join(", ", plan.Rows.Select(r => r.Change + ":" + r.Path + ":" + r.Chosen));
            string expected = "Delete:Assets/Dreamwalker/Removed.cs:False, Edit:Assets/Dreamwalker/Edited.cs:True, Media:Assets/Art/hero.png:False, " +
                "New:Assets/Scripts.meta:True, New:Assets/Scripts/NewSkill.cs:True, New:Assets/Scripts/NewSkill.cs.meta:True, " +
                "New:ProjectSettings/ProjectSettings.asset:True";
            if (string.Join(", ", plan.Rows.OrderBy(r => r.Change.ToString() + r.Path, StringComparer.Ordinal).Select(r => r.Change + ":" + r.Path + ":" + r.Chosen)) != expected)
                throw new Exception("Unity return plan: " + Rows());
            if (plan.Rows.Single(r => r.Path == "Assets/Dreamwalker/Edited.cs").Since != studio.files[1].sha256)
                throw new Exception("edited file keeps the studio version it was compared with");
            string skipped = string.Join(" | ", plan.Skipped);
            if (plan.Skipped.Count != 3 || !skipped.Contains("Assets/Models/thing.fbx") || !skipped.Contains("Assets/Scripts/Big.cs") ||
                !skipped.Contains("Assets/Scenes/Binary.unity"))
                throw new Exception("Unity return skipped files: " + skipped);

            foreach (var r in plan.Rows) r.Chosen = true;
            var set = StudioChangeReturn.Build(root, studio.rev, plan.Rows.Where(r => r.Chosen));
            var wire = JsonSerializer.Deserialize<JsonElement>(JsonSerializer.Serialize(set, format));
            if (wire.GetProperty("format").GetString() != "dreamwalker-unity-changes" || wire.GetProperty("version").GetInt32() != 1 ||
                wire.GetProperty("rev").GetInt32() != 7 || wire.GetProperty("files").GetArrayLength() != 7)
                throw new Exception("change set envelope");
            var file = set.files.Single(x => x.path == "Assets/Scripts/NewSkill.cs");
            if (file.kind != "text" || file.text != "using UnityEngine;\nclass NewSkill {}\n" || file.since != "" || file.data != "")
                throw new Exception("text change is sent normalised without a byte-order mark");
            var image = set.files.Single(x => x.path == "Assets/Art/hero.png");
            if (image.kind != "image" || !Convert.FromBase64String(image.data).SequenceEqual(png)) throw new Exception("image bytes");
            var removed = set.files.Single(x => x.path == "Assets/Dreamwalker/Removed.cs");
            if (removed.kind != "deleted" || removed.since != studio.files[2].sha256) throw new Exception("deletion");
            bool refused = false;
            try { StudioChangeReturn.Build(root, 7, Array.Empty<StudioReturnRow>()); } catch (InvalidDataException) { refused = true; }
            if (!refused) throw new Exception("an empty change set is refused");
            Console.WriteLine("PASS native Unity return: same path, line-ending and digest rules as the studio, new/edited/deleted/media rows, skipped binaries and wire format");
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, true);
        }
    }
}

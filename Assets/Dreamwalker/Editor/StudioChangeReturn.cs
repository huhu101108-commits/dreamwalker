using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace Dreamwalker.EditorTools
{
    [Serializable] public class StudioSourceHash { public string path, sha256; }
    [Serializable] public class StudioSourceManifest { public int rev; public StudioSourceHash[] files; }
    [Serializable] public class StudioChangeFile { public string path, kind, text, data, since; }
    [Serializable] public class StudioChangeSet
    {
        public string format = "dreamwalker-unity-changes";
        public int version = 1, rev;
        public StudioChangeFile[] files = Array.Empty<StudioChangeFile>();
    }
    public enum StudioReturnChange { New, Edit, Delete, Media }
    public sealed class StudioReturnRow
    {
        public string Path, Kind, Since;
        public StudioReturnChange Change;
        public long Bytes;
        public bool Chosen;
    }
    public sealed class StudioReturnPlan
    {
        public readonly List<StudioReturnRow> Rows = new List<StudioReturnRow>();
        public readonly List<string> Skipped = new List<string>();
    }

    // Unity project files sent back to the studio. The rules mirror unitySourcePath, unityMediaKind and
    // unitySourceText in Studio/src/model.js; studio-generated content under Resources/DreamwalkerStudio stays out.
    public static class StudioChangeReturn
    {
        public const int MaxText = 200000, MaxFiles = 400;
        public const long MaxImage = 2000000, MaxAudio = 8000000, MaxTotal = 24L * 1024 * 1024;
        private static readonly Regex Editable = new Regex(
            @"^(Web|Assets|Packages|ProjectSettings)/(?:[a-zA-Z0-9_가-힣 -]+/)*[a-zA-Z0-9_가-힣 -][a-zA-Z0-9_.가-힣 -]*\.(?:html|css|js|json|cs|txt|shader|hlsl|asmdef|asmref|uxml|uss|asset|prefab|unity|meta|anim|controller|mat|cginc|compute|inputactions|xml|yaml|md|jslib)$",
            RegexOptions.IgnoreCase);
        private static readonly Regex StudioContent = new Regex(@"^Assets/Resources/DreamwalkerStudio(?:/|\.|$)", RegexOptions.IgnoreCase);
        private static readonly Regex MediaPart = new Regex(@"^[a-zA-Z0-9_가-힣 .-]+$");

        public static string Normalize(string text)
        {
            if (string.IsNullOrEmpty(text)) return "";
            if (text[0] == '﻿') text = text.Substring(1);
            return text.Replace("\r\n", "\n").Replace('\r', '\n');
        }
        public static string TextHash(string text)
        {
            using (var sha = SHA256.Create())
                return BitConverter.ToString(sha.ComputeHash(new UTF8Encoding(false).GetBytes(Normalize(text)))).Replace("-", "").ToLowerInvariant();
        }
        public static bool SourcePath(string path) =>
            path != null && path.Length <= 180 && Editable.IsMatch(path) && !path.StartsWith("Web/", StringComparison.Ordinal) &&
            !StudioContent.IsMatch(path) && path != "ProjectSettings/DreamwalkerStudioImport.json" &&
            path.Split('/').All(part => part == part.Trim() && !part.EndsWith(".", StringComparison.Ordinal));
        public static string MediaKind(string path)
        {
            if (path == null || path.Length > 180 || !path.StartsWith("Assets/", StringComparison.Ordinal) || StudioContent.IsMatch(path)) return null;
            if (!path.Split('/').All(part => part.Length > 0 && part == part.Trim() && !part.EndsWith(".", StringComparison.Ordinal) && MediaPart.IsMatch(part))) return null;
            switch (path.Substring(path.LastIndexOf('.') + 1).ToLowerInvariant())
            {
                case "png": case "jpg": case "jpeg": return "image";
                case "wav": case "ogg": case "mp3": return "audio";
                default: return null;
            }
        }
        public static bool Meta(string path) => path != null && path.EndsWith(".meta", StringComparison.OrdinalIgnoreCase);
        public static bool Text(byte[] bytes, out string text)
        {
            text = null;
            if (Array.IndexOf(bytes, (byte)0) >= 0) return false;
            try { text = new UTF8Encoding(false, true).GetString(bytes); return true; }
            catch (DecoderFallbackException) { return false; }
        }
        // Project files as forward-slash paths. Hidden entries and Unity's "~" folders are not part of the project.
        public static IEnumerable<string> ProjectFiles(string root)
        {
            foreach (string top in new[] { "Assets", "Packages", "ProjectSettings" })
            {
                string folder = Path.Combine(root, top);
                if (!Directory.Exists(folder)) continue;
                var stack = new Stack<string>();
                stack.Push(folder);
                while (stack.Count > 0)
                {
                    string current = stack.Pop();
                    foreach (string dir in Directory.GetDirectories(current).OrderByDescending(d => d, StringComparer.Ordinal))
                    {
                        string name = Path.GetFileName(dir);
                        if (name.StartsWith(".") || name.EndsWith("~") || (new DirectoryInfo(dir).Attributes & FileAttributes.ReparsePoint) != 0) continue;
                        stack.Push(dir);
                    }
                    foreach (string file in Directory.GetFiles(current).OrderBy(f => f, StringComparer.Ordinal))
                    {
                        string name = Path.GetFileName(file);
                        if (name.StartsWith(".") || name.EndsWith("~")) continue;
                        yield return file.Substring(root.Length).TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar).Replace('\\', '/');
                    }
                }
            }
        }
        public static StudioReturnPlan Plan(string root, StudioSourceManifest studio)
        {
            root = Path.GetFullPath(root);
            var known = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var f in studio?.files ?? Array.Empty<StudioSourceHash>())
                if (f?.path != null) known[f.path] = f.sha256 ?? "";
            var plan = new StudioReturnPlan();
            var present = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (string path in ProjectFiles(root))
            {
                present.Add(path);
                if (StudioContent.IsMatch(path) || path == "ProjectSettings/DreamwalkerStudioImport.json") continue;
                string full = Path.Combine(root, path.Replace('/', Path.DirectorySeparatorChar));
                // Import settings travel with folders and source files. Media go to the asset library, where a .meta has no use.
                if (Meta(path))
                {
                    string companion = path.Substring(0, path.Length - 5);
                    if (!Directory.Exists(full.Substring(0, full.Length - 5)) && !SourcePath(companion)) continue;
                }
                if (SourcePath(path))
                {
                    byte[] bytes = File.ReadAllBytes(full);
                    if (!Text(bytes, out string text)) { plan.Skipped.Add(path + " · 텍스트가 아닌 형식(바이너리 직렬화)"); continue; }
                    string normal = Normalize(text);
                    if (normal.Length > MaxText) { plan.Skipped.Add(path + " · 20만 자를 넘어요"); continue; }
                    known.TryGetValue(path, out string studioHash);
                    if (studioHash == TextHash(normal)) continue;
                    plan.Rows.Add(new StudioReturnRow { Path = path, Kind = "text", Since = studioHash ?? "", Bytes = bytes.Length, Chosen = true,
                        Change = studioHash == null ? StudioReturnChange.New : StudioReturnChange.Edit });
                    continue;
                }
                string media = MediaKind(path);
                if (media != null)
                {
                    long size = new FileInfo(full).Length;
                    if (size > (media == "image" ? MaxImage : MaxAudio)) { plan.Skipped.Add(path + (media == "image" ? " · 이미지는 2MB까지" : " · 소리는 8MB까지")); continue; }
                    plan.Rows.Add(new StudioReturnRow { Path = path, Kind = media, Since = "", Bytes = size, Change = StudioReturnChange.Media });
                    continue;
                }
                if (!Meta(path)) plan.Skipped.Add(path + " · 스튜디오에서 지원하지 않는 이름이나 형식");
            }
            foreach (var pair in known)
                if (!present.Contains(pair.Key) && SourcePath(pair.Key))
                    plan.Rows.Add(new StudioReturnRow { Path = pair.Key, Kind = "deleted", Since = pair.Value, Change = StudioReturnChange.Delete });
            plan.Rows.Sort((a, b) => string.CompareOrdinal(a.Path, b.Path));
            return plan;
        }
        public static StudioChangeSet Build(string root, int rev, IEnumerable<StudioReturnRow> rows)
        {
            root = Path.GetFullPath(root);
            var files = new List<StudioChangeFile>();
            long total = 0;
            foreach (var r in rows)
            {
                if (files.Count >= MaxFiles) throw new InvalidDataException("한 번에 400개까지 보낼 수 있어요.");
                if (r.Change == StudioReturnChange.Delete)
                {
                    files.Add(new StudioChangeFile { path = r.Path, kind = "deleted", text = "", data = "", since = r.Since ?? "" });
                    continue;
                }
                byte[] bytes = File.ReadAllBytes(Path.Combine(root, r.Path.Replace('/', Path.DirectorySeparatorChar)));
                if ((total += bytes.Length) > MaxTotal) throw new InvalidDataException("한 번에 24MB까지 보낼 수 있어요. 나눠서 보내세요.");
                if (r.Change == StudioReturnChange.Media)
                    files.Add(new StudioChangeFile { path = r.Path, kind = r.Kind, text = "", data = Convert.ToBase64String(bytes), since = "" });
                else if (Text(bytes, out string text))
                    files.Add(new StudioChangeFile { path = r.Path, kind = "text", text = Normalize(text), data = "", since = r.Since ?? "" });
                else throw new InvalidDataException(r.Path + " · 파일 형식이 바뀌었어요. 다시 찾으세요.");
            }
            if (files.Count == 0) throw new InvalidDataException("보낼 변경을 고르세요.");
            return new StudioChangeSet { rev = rev, files = files.ToArray() };
        }
    }
}

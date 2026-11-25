using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text.RegularExpressions;

namespace Dreamwalker.EditorTools
{
    [Serializable] public class StudioPackageFile
    {
        public string path, sha256;
        public long bytes;
    }
    [Serializable] public class StudioPackageIndex
    {
        public string format = "dreamwalker-unity-pack", kind = "project";
        public int version = 1, revision;
        public StudioPackageFile[] files = Array.Empty<StudioPackageFile>();
    }
    public enum StudioFileChange { Unchanged, New, Update, Removed, LocalEdit, LocalDeletion, UntrackedCollision }

    public sealed class StudioImportRow
    {
        public string Path, LocalHash;
        public StudioPackageFile Before, Incoming;
        public StudioFileChange Change;
        public bool Chosen;
    }

    public static class StudioPackagePlan
    {
        public const string StatePath = "ProjectSettings/DreamwalkerStudioImport.json";
        public const string IndexName = "Dreamwalker-Pack.json";
        public const string ContentRoot = "Assets/Resources/DreamwalkerStudio/";
        public const long MaxEntryBytes = 64L * 1024 * 1024;
        public static string Digest(Stream stream)
        {
            using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
        }
        public static string FileHash(string path)
        {
            if (!File.Exists(path)) return null;
            using (var input = File.OpenRead(path)) return Digest(input);
        }
        public static void CheckPath(string path)
        {
            if (string.IsNullOrEmpty(path) || path.Length > 260 || path.Equals(StatePath,StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("예약되거나 잘못된 경로 " + path);
            string[] parts=path.Split('/');
            if (parts.Length<2 || !(parts[0]=="Assets" || parts[0]=="Packages" || parts[0]=="ProjectSettings"))
                throw new InvalidDataException("프로젝트 범위 밖 경로 " + path);
            foreach (var part in parts) {
                if(!Regex.IsMatch(part,@"^[a-zA-Z0-9_가-힣 -][a-zA-Z0-9._가-힣 -]*$") ||
                    part.EndsWith(".") || part.EndsWith(" ") ||
                    Regex.IsMatch(part,@"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)",RegexOptions.IgnoreCase))
                    throw new InvalidDataException("모호한 파일 경로 " + path);
            }
        }
        public static string SafePath(string root,string relative)
        {
            string current=Path.GetFullPath(root);
            foreach (string part in relative.Split('/')) {
                if(part.Length==0||part=="."||part==".."||part.IndexOfAny(new[]{'\\',':'})>=0)throw new InvalidDataException(relative);
                current=Path.Combine(current,part);
                try {
                    if((File.GetAttributes(current)&FileAttributes.ReparsePoint)!=0)throw new IOException("링크 경로 "+relative);
                } catch(FileNotFoundException) {} catch(DirectoryNotFoundException) {}
            }
            return current;
        }
        private static Dictionary<string,StudioPackageFile> Index(StudioPackageIndex manifest)
        {
            var map=new Dictionary<string,StudioPackageFile>(StringComparer.OrdinalIgnoreCase);
            if(manifest==null || manifest.format!="dreamwalker-unity-pack" || manifest.version!=1 || manifest.revision<0 ||
                !(manifest.kind=="content"||manifest.kind=="project") || manifest.files==null || manifest.files.Length>10000)
                throw new InvalidDataException("드림워커 Unity 팩 목록을 확인하세요.");
            long total=0;
            foreach(var f in manifest.files) {
                if(f==null)throw new InvalidDataException("빈 파일 항목");
                CheckPath(f.path);
                if(manifest.kind=="content"&&!f.path.StartsWith(ContentRoot,StringComparison.Ordinal))throw new InvalidDataException(f.path);
                if(f.sha256==null||!Regex.IsMatch(f.sha256,"^[0-9a-f]{64}$")||f.bytes<0||f.bytes>MaxEntryBytes||map.ContainsKey(f.path))
                    throw new InvalidDataException("중복 또는 잘못된 파일 정보 "+f.path);
                map.Add(f.path,f);
                if((total+=f.bytes)>1024L*1024*1024)throw new InvalidDataException("1GB를 넘는 팩");
            }
            return map;
        }
        public static List<StudioImportRow> Review(string root,StudioPackageIndex before,StudioPackageIndex incoming)
        {
            var old=Index(before??new StudioPackageIndex());
            var next=Index(incoming);
            var rows=new List<StudioImportRow>();
            var paths=new SortedSet<string>(next.Keys,StringComparer.OrdinalIgnoreCase);
            foreach(var path in old.Keys)if(incoming.kind=="project"||path.StartsWith(ContentRoot,StringComparison.Ordinal)) paths.Add(path);
            foreach(var path in paths) {
                old.TryGetValue(path,out var prior);next.TryGetValue(path,out var file);
                if(prior!=null&&file!=null&&prior.path!=file.path)throw new InvalidDataException("대소문자만 다른 경로 "+path);
                var local=FileHash(SafePath(root,path));StudioFileChange change;
                if(local==file?.sha256) change=StudioFileChange.Unchanged;
                else if(prior==null)change=local==null?StudioFileChange.New:StudioFileChange.UntrackedCollision;
                else if(local==null)change=StudioFileChange.LocalDeletion;
                else if(local!=prior.sha256)change=StudioFileChange.LocalEdit;
                else change=file==null?StudioFileChange.Removed:StudioFileChange.Update;
                rows.Add(new StudioImportRow {Path=path, Before=prior, Incoming=file, LocalHash=local, Change=change,
                    Chosen=change==StudioFileChange.New||change==StudioFileChange.Update});
            }
            return rows;
        }
        // Only files actually written or already identical become the new merge base.
        public static StudioPackageIndex NextIndex(StudioPackageIndex previous,StudioPackageIndex incoming,List<StudioImportRow> rows)
        {
            var result=Index(previous??new StudioPackageIndex());
            foreach(var item in rows)if(item.Chosen||item.Change==StudioFileChange.Unchanged) {
                if(item.Incoming==null)result.Remove(item.Path);else result[item.Path]=item.Incoming;
            }
            return new StudioPackageIndex {kind="project",revision=incoming.revision,files=result.Values.OrderBy(x=>x.path,StringComparer.Ordinal).ToArray()};
        }
        // Tablet delivery is restricted to the data and media emitted by the content exporter.
        public static void CheckTabletContent(StudioPackageIndex manifest, int revision)
        {
            if (manifest == null || manifest.kind != "content" || manifest.revision != revision)
                throw new InvalidDataException("요청한 공유 버전의 콘텐츠 팩을 확인하세요.");
            var files = Index(manifest);
            if (!files.ContainsKey(ContentRoot + "release.json"))
                throw new InvalidDataException("게임 데이터가 빠져 있어요.");
            foreach (var entry in manifest.files)
            {
                string name = entry.path.Substring(ContentRoot.Length);
                if (name != "release.json" && name != "Images/builtin-player.png" && name != "Images/builtin-stage.jpg" &&
                    !Regex.IsMatch(name, @"^(Images/[a-f0-9]{64}\.(png|jpg)|Audio/[a-f0-9]{64}\.(mp3|ogg|wav))$"))
                    throw new InvalidDataException("콘텐츠 전송에서 지원하지 않는 파일 " + name);
            }
        }
        private static void CopyVerified(Stream input,string dest,StudioPackageFile file)
        {
            long copied=0;var buffer=new byte[65536];
            using(var output=new FileStream(dest,FileMode.CreateNew,FileAccess.Write)) {
                int n;
                while((n=input.Read(buffer,0,buffer.Length))>0) {
                    copied+=n;if(copied>file.bytes)throw new InvalidDataException(file.path);
                    output.Write(buffer,0,n);
                }
            }
            if(copied!=file.bytes||FileHash(dest)!=file.sha256)throw new InvalidDataException("내용이 다른 파일 "+file.path);
        }
        public static void Apply(string root,List<StudioImportRow> rows,Func<string,Stream> open,string json,string expectedIndexHash)
        {
            string state=SafePath(root,StatePath);
            if(FileHash(state)!=expectedIndexHash)throw new IOException("다른 가져오기가 완료됐어요. 다시 검사하세요.");
            string txn=SafePath(root,"Library/DreamwalkerImports/"+Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(txn);
            var writes=new List<Tuple<string,string,string>>();
            var started=new List<Tuple<string,string,string>>();
            try {
                foreach(var item in rows) {
                    string local=SafePath(root,item.Path);
                    if(FileHash(local)!=item.LocalHash)throw new IOException("검토 중 변경된 파일 "+item.Path);
                    if(!item.Chosen||item.Change==StudioFileChange.Unchanged)continue;
                    string next=null,backup=null;
                    if(item.Incoming!=null) {
                        next=Path.Combine(txn,writes.Count+".new");
                        using(var stream=open(item.Path))CopyVerified(stream,next,item.Incoming);
                    }
                    if(item.LocalHash!=null){backup=Path.Combine(txn,writes.Count+".bak");File.Copy(local,backup);}
                    writes.Add(Tuple.Create(local,next,backup));
                }
                string indexFile=Path.Combine(txn,"index.new"),indexBackup=null;File.WriteAllText(indexFile,json);
                if(File.Exists(state)){indexBackup=Path.Combine(txn,"index.bak");File.Copy(state,indexBackup);}
                writes.Add(Tuple.Create(state,indexFile,indexBackup));
                foreach(var item in writes) {
                    if(FileHash(item.Item1)!=(item.Item3==null?null:FileHash(item.Item3)))throw new IOException("검토 중 변경된 파일 "+item.Item1);
                    Directory.CreateDirectory(Path.GetDirectoryName(item.Item1));
                    started.Add(item);
                    if(item.Item2==null)File.Delete(item.Item1);else File.Copy(item.Item2,item.Item1,true);
                }
            } catch {
                for(int i=started.Count-1;i>=0;i--){var item=started[i];if(item.Item3!=null)File.Copy(item.Item3,item.Item1,true);else File.Delete(item.Item1);}
                throw;
            } finally {Directory.Delete(txn,true);}
        }
    }
}

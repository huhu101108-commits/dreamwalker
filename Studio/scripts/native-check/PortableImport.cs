using System;
using System.IO;
using System.Linq;
using System.Text;
using Dreamwalker.EditorTools;
public static class PortableImport
{
    private static byte[] Data(string s) => Encoding.UTF8.GetBytes(s);
    private static StudioPackageFile Item(string path,string value)
    {
        var bytes=Data(value);
        using var b=new MemoryStream(bytes);
        return new StudioPackageFile {path=path,bytes=bytes.Length,sha256=StudioPackagePlan.Digest(b)};
    }
    internal static void Run()
    {
        string root=Path.Combine(Path.GetTempPath(),"dw-import-"+Guid.NewGuid().ToString("N"));
        string src="Assets/Custom/Extension.cs", release=StudioPackagePlan.ContentRoot+"release.json";
        void Store(string path,string content){string full=StudioPackagePlan.SafePath(root,path);Directory.CreateDirectory(Path.GetDirectoryName(full));File.WriteAllText(full,content);}
        string Read(string path)=>File.ReadAllText(StudioPackagePlan.SafePath(root,path));
        bool Reject(Action fn){try{fn();return false;}catch(Exception error) when(error is IOException || error is InvalidDataException){return true;}}
        try {
            var a=Item(src,"v1");var b=Item(release,"released");var c=Item("Assets/Custom/New.cs","new");
            var old=new StudioPackageIndex {files=new[]{a,b},revision=22};
            var next=new StudioPackageIndex {files=new[]{Item(src,"engine v2"),Item(release,"updated"),c},revision=23};
            Store(src,"my extension");Store(release,"released");
            var rows=StudioPackagePlan.Review(root,old,next);
            var edited=rows.Single(r=>r.Path==src);var content=rows.Single(r=>r.Path==release);
            if(edited.Change!=StudioFileChange.LocalEdit || edited.Chosen || !content.Chosen)throw new Exception("modified file selection");
            var baseline=StudioPackagePlan.NextIndex(old,next,rows);
            if(baseline.files.Single(f=>f.path==src).sha256!=a.sha256)throw new Exception("declined override must preserve its base");
            Stream Open(string p)=>new MemoryStream(Data(p==release?"updated":"new"));
            if(!Reject(()=>StudioPackagePlan.Apply(root,rows,p=>new MemoryStream(Data("tampered")),"index",null)))throw new Exception("corrupt package");
            if(Read(release)!="released"||File.Exists(Path.Combine(root,c.path)))throw new Exception("partial import");
            Store(release,"concurrent");
            if(!Reject(()=>StudioPackagePlan.Apply(root,rows,Open,"index",null)))throw new Exception("race");
            Store(release,"released");StudioPackagePlan.Apply(root,rows,Open,"index",null);
            if(Read(release)!="updated"||Read(src)!="my extension"||Read(c.path)!="new")throw new Exception("merge");
            var contentOnly=new StudioPackageIndex {kind="content",files=new[]{next.files[1]},revision=23};
            var subset=StudioPackagePlan.Review(root,baseline,contentOnly);
            if(subset.Count!=1||subset[0].Change!=StudioFileChange.Unchanged)throw new Exception("pack scope");
            if(!Reject(()=>StudioPackagePlan.CheckPath("Assets/../outside.cs")))throw new Exception("traversal");
            var deleted=new StudioPackageIndex{files=new[]{a}};
            File.Delete(Path.Combine(root,src));
            if(StudioPackagePlan.Review(root,old,deleted).Single(r=>r.Path==src).Change!=StudioFileChange.LocalDeletion)throw new Exception("local deletion");
            Console.WriteLine("PASS native import local overrides, stale review, digest mismatch, retry, partial-pack scope and path boundaries");
        } finally {if(Directory.Exists(root))Directory.Delete(root,true);}
    }
}

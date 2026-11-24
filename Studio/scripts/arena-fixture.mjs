import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function arenaFixture() {
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  // Every migration in journal order, as the hosted database applies them.
  const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
  for(const entry of journal.entries.sort((a,b)=>a.idx-b.idx))
    db.exec(readFileSync(new URL('../drizzle/'+entry.tag+'.sql',import.meta.url),'utf8').replaceAll('--> statement-breakpoint',''));
  const statement=(sql,args=[])=>({
    bind:(...values)=>statement(sql,values),
    first:async()=>db.prepare(sql).get(...args)??null,
    all:async()=>({results:db.prepare(sql).all(...args)}),
    run:async()=>({meta:db.prepare(sql).run(...args)}),
  });
  return {DB:{prepare:statement},close:()=>db.close()};
}

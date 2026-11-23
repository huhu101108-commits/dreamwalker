import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function arenaFixture() {
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(readFileSync(new URL('../drizzle/0000_online.sql',import.meta.url),'utf8'));
  const statement=(sql,args=[])=>({
    bind:(...values)=>statement(sql,values),
    first:async()=>db.prepare(sql).get(...args)??null,
    all:async()=>({results:db.prepare(sql).all(...args)}),
    run:async()=>({meta:db.prepare(sql).run(...args)}),
  });
  return {DB:{prepare:statement},close:()=>db.close()};
}

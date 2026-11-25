import {test} from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {reserveBudget,LIMITS} from './paidAi';
function fresh(){const db=new Database(':memory:');db.exec('CREATE TABLE paid_budget (id TEXT PRIMARY KEY, month TEXT NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL)');return db;}
test('PDF and chat have separate caps and cannot borrow',()=>{const db=fresh();try{reserveBudget(db,'pdf',LIMITS.pdf,'2026-11');assert.throws(()=>reserveBudget(db,'pdf',1,'2026-11'),/exhausted/);reserveBudget(db,'chat',LIMITS.chat,'2026-11');assert.throws(()=>reserveBudget(db,'chat',1,'2026-11'),/exhausted/);assert.equal((db.prepare('SELECT SUM(amount) as total FROM paid_budget').get() as {total:number}).total,5000000);}finally{db.close();}});
test('monthly renewal and invalid amounts',()=>{const db=fresh();try{reserveBudget(db,'pdf',LIMITS.pdf,'2026-11');reserveBudget(db,'pdf',LIMITS.pdf,'2026-12');for(const x of [-1,0,NaN,Infinity,0.5])assert.throws(()=>reserveBudget(db,'pdf',x,'2026-12'));}finally{db.close();}});
test('successive reservations cannot exceed the remaining budget',()=>{const db=fresh();try{reserveBudget(db,'chat',600000,'2026-11');assert.throws(()=>reserveBudget(db,'chat',600000,'2026-11'));reserveBudget(db,'chat',400000,'2026-11');}finally{db.close();}});


import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('budget survives closing and reopening a file-backed ledger', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yazan-ledger-'));
  const location = join(dir, 'budget.sqlite');
  let db: Database.Database | undefined;
  try {
    db = new Database(location);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE paid_budget (id TEXT PRIMARY KEY, month TEXT NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL)');
    reserveBudget(db, 'pdf', 3500000, '2026-11');
    reserveBudget(db, 'chat', 900000, '2026-11');
    db.close();
    db = new Database(location);
    assert.throws(() => reserveBudget(db!, 'pdf', 500001, '2026-11'), /exhausted/);
    assert.throws(() => reserveBudget(db!, 'chat', 100001, '2026-11'), /exhausted/);
    reserveBudget(db, 'pdf', 500000, '2026-11');
    reserveBudget(db, 'chat', 100000, '2026-11');
    db.close();
    db = new Database(location);
    assert.throws(() => reserveBudget(db!, 'pdf', 1, '2026-11'), /exhausted/);
    assert.throws(() => reserveBudget(db!, 'chat', 1, '2026-11'), /exhausted/);
    reserveBudget(db, 'pdf', LIMITS.pdf, '2026-12');
    reserveBudget(db, 'chat', LIMITS.chat, '2026-12');
  } finally {
    if (db?.open) db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

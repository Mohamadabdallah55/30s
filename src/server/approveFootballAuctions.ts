import type Database from 'better-sqlite3';
import { FULL_BANK_ID } from './importFullBank';

const approvalKey = 'approved-football-auctions-v1';
const externalIds = Array.from({ length: 54 }, (_, i) => i + 1)
  .filter((n) => n < 45 || n > 48) // These four duplicates were excluded from the bundled pack.
  .map((n) => `FBPA${String(n).padStart(4, '0')}`);

export function approveFootballAuctions(db: Database.Database): number {
  return db.transaction(() => {
    if (db.prepare('SELECT 1 FROM app_settings WHERE key = ?').get(approvalKey)) return 0;
    const selection = `bank_id = ? AND round_type = 'bid_challenge' AND status = 'needs_review'
      AND external_id IN (${externalIds.map(() => '?').join(',')})`;
    db.prepare(`INSERT INTO question_reviews (id, question_id, action, notes, previous_status, new_status)
      SELECT ? || ':' || id, id, 'approve', 'اعتماد دفعة مزاد لاعبي كرة القدم بطلب صاحب المشروع',
        'needs_review', 'published' FROM questions WHERE ${selection}`).run(approvalKey, FULL_BANK_ID, ...externalIds);
    const { changes } = db.prepare(`UPDATE questions SET status = 'published' WHERE ${selection}`)
      .run(FULL_BANK_ID, ...externalIds);
    if (changes) db.prepare('UPDATE question_banks SET version = version + 1 WHERE id = ?').run(FULL_BANK_ID);
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(approvalKey, String(changes));
    return changes;
  }).immediate();
}

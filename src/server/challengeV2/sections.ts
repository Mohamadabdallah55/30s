import crypto from 'node:crypto';
import type { CoreV2, SlotV2 } from '../../shared/challengeV2';

export function awardV2(c: CoreV2, slot: SlotV2, team: number, points: number, reason: string) {
  if (!points) return;
  c.scores[team] += points;
  c.ledger.push({ id: crypto.randomUUID(), slotId: slot.id, team, points, reason });
}
export function closeV2(c: CoreV2) {
  c.stage = 'result'; c.deadline = null; c.remainingMs = 0; c.paused = false;
}
export function settleKnowledge(c: CoreV2, slot: SlotV2, plan: SlotV2[]) {
  if (slot.team !== null) c.counts[slot.id] = c.accepted.length;
  const pair = plan.filter(s => s.section === 'knowledge' && s.encounter === slot.encounter);
  if (pair.length !== 2 || pair.some(s => c.counts[s.id] === undefined)) return;
  const [a,b] = pair;
  if (c.counts[a.id] === c.counts[b.id]) {
    awardV2(c, slot, 0, 1, 'تعادل ماذا تعرف'); awardV2(c, slot, 1, 1, 'تعادل ماذا تعرف');
  } else awardV2(c, slot, c.counts[a.id] > c.counts[b.id] ? a.team! : b.team!, 3, 'الفوز بمواجهة ماذا تعرف');
}
export function settleAuction(c: CoreV2, slot: SlotV2) {
  const won = c.accepted.length >= c.bid;
  awardV2(c, slot, won ? c.bidder : 1-c.bidder, won ? 3 : 2, won ? 'نجاح المزايدة' : 'فشل المزايدة');
}
export function turnClock(c: CoreV2, now: number, ms: number, kind: CoreV2['timerKind']) {
  c.remainingMs = ms; c.deadline = now + ms; c.timerKind = kind; c.paused = false;
}

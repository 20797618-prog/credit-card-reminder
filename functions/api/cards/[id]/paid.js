// POST /api/cards/:id/paid -> 标记本期已还
import { json, handleOptions, resolveSession } from '../../../_account_lib.js';
import { getCards, saveCards, computeStatus, today, nextDueAfter, tsToDateStr, prevDue } from '../../../_cards_lib.js';

function dateStrToTs(s) {
  return Date.parse(s + 'T00:00:00Z');
}

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405);

  const sess = await resolveSession(request, env);
  if (!sess) return json({ ok: false, error: 'unauthorized' }, 401);

  const id = params.id;
  const cards = await getCards(env, sess.email);
  const idx = cards.findIndex((c) => c.id === id);
  if (idx === -1) return json({ ok: false, error: 'card not found' }, 404);

  const base = today();
  const card = cards[idx];
  // 把 lastPaidDue 推进到「当前应还日」，倒计时自然滚到下一期
  const lastTs = card.lastPaidDue
    ? dateStrToTs(card.lastPaidDue)
    : Date.parse('T00:00:00Z'); // 兜底（正常不会出现）
  const next = nextDueAfter(card.payDay, lastTs);
  const dueStr = tsToDateStr(next);      // 本期应还日
  const paidStr = tsToDateStr(base);     // 实际还款日（今天）
  card.lastPaidDue = dueStr;
  // 追加还款历史记录（应还日 + 实际还款日）
  if (!Array.isArray(card.paidHistory)) card.paidHistory = [];
  const dup = card.paidHistory.some((h) => h && h.dueDate === dueStr);
  if (!dup) card.paidHistory.push({ dueDate: dueStr, paidAt: paidStr });
  card.updatedAt = Date.now();
  await saveCards(env, sess.email, cards);

  return json({ ok: true, card: { ...card, ...computeStatus(card, base) } });
}

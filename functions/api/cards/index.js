// GET /api/cards -> 当前用户全部卡片（含计算后状态）
// POST /api/cards -> 新增卡片
import { json, handleOptions, resolveSession } from '../../_account_lib.js';
import { getCards, saveCards, computeStatus, validateCard, today, prevDue, tsToDateStr } from '../../_cards_lib.js';

// 列表排序：逾期（越久越前）→ 未还（剩余天数升序）
function sortKey(c) {
  if (c.status === 'overdue') return -1000 - c.overdueDays;
  return c.daysLeft;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();

  const sess = await resolveSession(request, env);
  if (!sess) return json({ ok: false, error: 'unauthorized' }, 401);

  if (request.method === 'GET') {
    const base = today();
    const cards = await getCards(env, sess.email);
    const list = cards
      .map((c) => ({ ...c, ...computeStatus(c, base) }))
      .sort((a, b) => sortKey(a) - sortKey(b));
    return json({ ok: true, cards: list });
  }

  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'invalid json' }, 400); }
    const v = validateCard(body);
    if (v.error) return json({ ok: false, error: v.error }, 400);

    const cards = await getCards(env, sess.email);
    const now = Date.now();
    const base = today();
    const card = {
      id: crypto.randomUUID(),
      ...v.value,
      // 新卡默认「最近一期已还」，从下一个还款日开始倒计时，避免误报历史逾期
      lastPaidDue: tsToDateStr(prevDue(v.value.payDay, base)),
      createdAt: now,
      updatedAt: now
    };
    cards.push(card);
    await saveCards(env, sess.email, cards);
    return json({ ok: true, card: { ...card, ...computeStatus(card, base) } });
  }

  return json({ ok: false, error: 'method not allowed' }, 405);
}

// GET /api/repayments -> 当前用户全部还款记录（跨卡聚合，按还款时间降序）
import { json, handleOptions, resolveSession } from '../_account_lib.js';
import { getCards } from '../_cards_lib.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'GET') {
    return json({ ok: false, error: 'method_not_allowed', message: '不支持的请求方法' }, 405);
  }

  const sess = await resolveSession(request, env);
  if (!sess) return json({ ok: false, error: 'unauthorized', message: '请先登录' }, 401);

  const cards = await getCards(env, sess.email);
  const records = [];
  for (const c of cards) {
    const hist = Array.isArray(c.paidHistory) ? c.paidHistory : [];
    for (const h of hist) {
      if (!h || !h.dueDate) continue;
      records.push({
        id: c.id + '|' + h.dueDate,
        cardId: c.id,
        alias: c.alias,
        last4: c.last4,
        bank: c.bank || null,
        dueDate: h.dueDate,   // 应还日 YYYY-MM-DD
        paidAt: h.paidAt || h.dueDate // 实际还款日（老数据兜底用应还日）
      });
    }
  }
  // 最近还款在前
  records.sort((a, b) => (a.paidAt < b.paidAt ? 1 : a.paidAt > b.paidAt ? -1 : 0));
  return json({ ok: true, records });
}

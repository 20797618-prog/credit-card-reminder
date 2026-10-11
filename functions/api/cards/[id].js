// PUT /api/cards/:id -> 编辑卡片
// DELETE /api/cards/:id -> 删除卡片
import { json, handleOptions, resolveSession } from '../../_account_lib.js';
import { getCards, saveCards, computeStatus, validateCard, today, prevDue, tsToDateStr } from '../../_cards_lib.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return handleOptions();

  const sess = await resolveSession(request, env);
  if (!sess) return json({ ok: false, error: 'unauthorized', message: '请先登录' }, 401);

  const id = params.id;
  const cards = await getCards(env, sess.email);
  const idx = cards.findIndex((c) => c.id === id);
  if (idx === -1) return json({ ok: false, error: 'card_not_found', message: '卡片不存在' }, 404);

  if (request.method === 'PUT') {
    let body;
    try { body = await request.json(); } catch (e) {
      return json({ ok: false, error: 'invalid_json', message: '请求格式错误' }, 400);
    }
    const v = validateCard(body);
    if (v.error) return json({ ok: false, error: v.code, message: v.error }, 400);

    const old = cards[idx];
    const merged = {
      ...old,
      ...v.value,
      id: old.id,
      createdAt: old.createdAt,
      updatedAt: Date.now()
    };
    // validateCard 返回的 lastPaidDue 恒为 null（那是「新建卡片」的默认值），
    // 编辑时必须保留已有的还款指针，否则「本期已还 / 本期无需还」推进过的期数会被重置，
    // 已经处理过的账单又被提醒一次。
    merged.lastPaidDue = old.lastPaidDue || null;
    // 还款日变更后，旧指针不再对应任何一期，重新初始化为「最近一期已还」
    if (v.value.payDay !== old.payDay) {
      merged.lastPaidDue = tsToDateStr(prevDue(v.value.payDay, today()));
    }

    cards[idx] = merged;
    await saveCards(env, sess.email, cards);
    return json({ ok: true, card: { ...merged, ...computeStatus(merged, today()) } });
  }

  if (request.method === 'DELETE') {
    cards.splice(idx, 1);
    await saveCards(env, sess.email, cards);
    return json({ ok: true });
  }

  return json({ ok: false, error: 'method_not_allowed', message: '不支持的请求方法' }, 405);
}

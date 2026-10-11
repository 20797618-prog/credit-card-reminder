// POST /api/cards/:id/paid -> 标记本期已还
// 业务逻辑与 /skip 共用 applyCycleAction，区别只在记录的 type。
import { json, handleOptions, resolveSession } from '../../../_account_lib.js';
import { applyCycleAction, today } from '../../../_cards_lib.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed', message: '不支持的请求方法' }, 405);
  }

  const sess = await resolveSession(request, env);
  if (!sess) return json({ ok: false, error: 'unauthorized', message: '请先登录' }, 401);

  const r = await applyCycleAction(env, sess.email, params.id, 'paid', today());
  if (r.error) return json({ ok: false, error: r.code, message: r.error }, r.status);
  return json({ ok: true, card: r.card });
}

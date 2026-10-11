// POST /api/cards/:id/skip -> 标记本期无需还款
// 与 /paid 一样把还款指针推进一期（倒计时滚到下一期），只在历史记录里标记 type='skip'。
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

  const r = await applyCycleAction(env, sess.email, params.id, 'skip', today());
  if (r.error) return json({ ok: false, error: r.code, message: r.error }, r.status);
  return json({ ok: true, card: r.card });
}

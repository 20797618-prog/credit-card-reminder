// 后端接口端到端测试（依赖本地 wrangler pages dev 运行在 127.0.0.1:8788）
const BASE = 'http://127.0.0.1:8788';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + '  ' + (detail || '')); }
}

async function main() {
  // 1. 静态首页
  const page = await fetch(BASE + '/');
  const html = await page.text();
  check('静态首页可达', page.status === 200 && html.includes('信用卡还款提醒'), 'status=' + page.status);

  // 2. 发验证码（dev 模式直接返回 code）
  const email = 'test-' + Date.now() + '@example.com';
  const rcRes = await fetch(BASE + '/api/auth/request-code', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const rc = await rcRes.json();
  check('发验证码(dev返回code)', rc.ok === true && rc.dev === true && !!rc.code, JSON.stringify(rc));

  // 3. 验证码登录
  const vcRes = await fetch(BASE + '/api/auth/verify-code', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code: rc.code })
  });
  const vc = await vcRes.json();
  const token = vc.token;
  check('验证码登录拿token', !!token, JSON.stringify(vc));

  // 4. 校验会话
  const meRes = await fetch(BASE + '/api/auth/me', { headers: { 'Authorization': 'Bearer ' + token } });
  const me = await meRes.json();
  check('会话校验返回email', me.ok === true && me.user.email === email, JSON.stringify(me));

  const auth = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };

  // 5. 建卡（还款日 20 号）
  const createRes = await fetch(BASE + '/api/cards', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ alias: '招行主卡', last4: '1234', bank: '招商银行', payDay: 20 })
  });
  const create = await createRes.json();
  check('建卡成功', create.ok === true && !!create.card.id, JSON.stringify(create));
  const card = create.card;
  console.log('      → 新卡状态:', JSON.stringify({ status: card.status, nextDueDate: card.nextDueDate, daysLeft: card.daysLeft }));
  check('新卡含状态字段', !!card.status && !!card.nextDueDate);

  // 6. 列表
  const list = await (await fetch(BASE + '/api/cards', { headers: auth })).json();
  check('列表返回1张', list.ok === true && list.cards.length === 1, 'length=' + list.cards.length);

  // 7. 标记本期已还
  const paid = await (await fetch(BASE + '/api/cards/' + card.id + '/paid', { method: 'POST', headers: auth })).json();
  console.log('      → 已还后状态:', JSON.stringify({ status: paid.card.status, nextDueDate: paid.card.nextDueDate, daysLeft: paid.card.daysLeft }));
  check('标记已还后滚到下期', paid.ok === true && paid.card.status === 'normal', JSON.stringify(paid.card));

  // 7.5 还款记录查询
  const reps = await (await fetch(BASE + '/api/repayments', { headers: auth })).json();
  const rec = reps.records && reps.records[0];
  check('还款记录返回1条且含应还日/还款日',
    reps.ok === true && reps.records.length === 1 &&
    rec.dueDate === paid.card.lastPaidDue && !!rec.paidAt && rec.alias === '招行主卡',
    JSON.stringify(reps.records));

  // 8. 编辑卡
  const edit = await (await fetch(BASE + '/api/cards/' + card.id, {
    method: 'PUT', headers: auth,
    body: JSON.stringify({ alias: '招行副卡', last4: '5678', bank: '招商银行', payDay: 25 })
  })).json();
  check('编辑成功且还款日生效', edit.ok === true && edit.card.alias === '招行副卡' && edit.card.payDay === 25, JSON.stringify(edit.card));

  // 9. 删除卡
  const del = await (await fetch(BASE + '/api/cards/' + card.id, { method: 'DELETE', headers: auth })).json();
  check('删除成功', del.ok === true, JSON.stringify(del));
  const list2 = await (await fetch(BASE + '/api/cards', { headers: auth })).json();
  check('删除后列表为空', list2.ok === true && list2.cards.length === 0, 'length=' + list2.cards.length);

  // 10. 未登录访问应 401
  const unauth = await fetch(BASE + '/api/cards');
  check('未登录访问返回401', unauth.status === 401, 'status=' + unauth.status);

  // 11. 非法字段校验
  const bad = await (await fetch(BASE + '/api/cards', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ alias: '', last4: '12', payDay: 99 })
  })).json();
  check('非法字段被拒绝', bad.ok === false && !!bad.error, JSON.stringify(bad));

  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });

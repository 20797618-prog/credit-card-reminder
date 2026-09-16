import { computeStatus, prevDue, tsToDateStr } from './functions/_cards_lib.js';

// m 为 1-based 月份，返回「东八区该天 00:00」的基准时间戳
function d(y, m, day) { return Date.UTC(y, m - 1, day); }

let pass = 0, fail = 0;
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + '\n        got  ' + g + '\n        want ' + w); }
}

console.log('还款日算法验证：');

// 1. 新卡（lastPaidDue 已初始化为上月还款日）→ 剩 5 天，属「临近」
let r = computeStatus({ payDay: 20, lastPaidDue: '2026-08-20' }, d(2026, 9, 15));
check('新卡剩5天(临近)', { s: r.status, n: r.nextDueDate, d: r.daysLeft }, { s: 'warning', n: '2026-09-20', d: 5 });

// 2. 逾期 2 天
r = computeStatus({ payDay: 20, lastPaidDue: '2026-08-20' }, d(2026, 9, 22));
check('逾期2天', { s: r.status, o: r.overdueDays }, { s: 'overdue', o: 2 });

// 3. 今天到期
r = computeStatus({ payDay: 20, lastPaidDue: '2026-08-20' }, d(2026, 9, 20));
check('今天到期', { s: r.status, d: r.daysLeft }, { s: 'urgent', d: 0 });

// 4. 已还后滚到下一期
r = computeStatus({ payDay: 20, lastPaidDue: '2026-09-20' }, d(2026, 9, 22));
check('已还后滚下期', { s: r.status, n: r.nextDueDate, d: r.daysLeft }, { s: 'normal', n: '2026-10-20', d: 28 });

// 5. 月末边界：31 号在非闰年 2 月取 2/28
r = computeStatus({ payDay: 31, lastPaidDue: '2026-01-31' }, d(2026, 2, 15));
check('月末边界(2月)', { n: r.nextDueDate }, { n: '2026-02-28' });

// 6. 跨年
r = computeStatus({ payDay: 5, lastPaidDue: '2026-12-05' }, d(2026, 12, 15));
check('跨年', { n: r.nextDueDate, d: r.daysLeft }, { n: '2027-01-05', d: 21 });

// 7. prevDue：月初（本月还款日还没到）→ 上月
check('prevDue月初', tsToDateStr(prevDue(20, d(2026, 9, 5))), '2026-08-20');

// 8. prevDue：本月还款日已过 → 本月
check('prevDue已过', tsToDateStr(prevDue(20, d(2026, 9, 25))), '2026-09-20');

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
if (fail > 0) process.exit(1);

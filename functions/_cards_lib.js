// 信用卡还款提醒器 · 卡片业务库
// 职责：
//   - 还款日算法（固定每月几号 + 跨月滚动 + 月末边界）
//   - 卡片数据读写（存储于 CARDS_KV，键 cards:<email>）
//   - 卡片字段校验
// 文件名以「_」开头，Pages Functions 不会为其生成路由。

// 目标用户为中国用户，还款日按东八区（Asia/Shanghai，UTC+8）取「今天」。
// 如需支持其他时区，可将 TZ_OFFSET_HOURS 改为可配置。
const TZ_OFFSET_HOURS = 8;
const CARDS_PREFIX = 'cards:';
const DAY_MS = 86400000;

// ---------- 核心模型 ----------
// 每张卡存 lastPaidDue =「最后已还的那个还款日」（YYYY-MM-DD）。
// 下一个应还日 = lastPaidDue 之后的下一个还款日。
// 倒计时与逾期都基于「下一个应还日」计算：
//   - 未到期：剩 N 天（分档预警）
//   - 已过：逾期 N 天
// 用户点「本期已还」= 把 lastPaidDue 推进到当前应还日，倒计时自然滚到下一期。

// ---------- 日期工具（统一用 UTC 时间戳表示「东八区的某一天 00:00」） ----------

// 返回「今天」对应的基准时间戳（东八区当天 00:00，用 UTC 时间戳表示）
export function today() {
  const now = new Date();
  const shifted = new Date(now.getTime() + TZ_OFFSET_HOURS * 3600 * 1000);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

function daysInMonth(y, m) {
  // m: 0-based
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

// 某年某月的还款日（月末边界：payDay 超过当月天数时取当月最后一天）
function dueOfMonth(payDay, y, m) {
  return Date.UTC(y, m, Math.min(payDay, daysInMonth(y, m)));
}

// 最近一个「已过去」的还款日（≤ 今天），用于新卡初始化：默认历史各期已还清
export function prevDue(payDay, base) {
  const d = new Date(base);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const thisMonth = dueOfMonth(payDay, y, m);
  if (thisMonth <= base) return thisMonth;
  const prevLast = new Date(Date.UTC(y, m, 0)); // 上月最后一天
  return dueOfMonth(payDay, prevLast.getUTCFullYear(), prevLast.getUTCMonth());
}

// lastPaidDue 之后的下一个还款日
export function nextDueAfter(payDay, lastTs) {
  const d = new Date(lastTs);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (m === 11) return dueOfMonth(payDay, y + 1, 0);
  return dueOfMonth(payDay, y, m + 1);
}

// 时间戳 -> "YYYY-MM-DD"（东八区日期）
export function tsToDateStr(ts) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// "YYYY-MM-DD" -> 时间戳（UTC 00:00）
function dateStrToTs(s) {
  return Date.parse(s + 'T00:00:00Z');
}

// ---------- 状态计算 ----------

// 计算一张卡的还款状态，返回计算后字段：
//   status: normal | warning | urgent | overdue
//   lastPaidDue: 最后已还的还款日（YYYY-MM-DD）
//   nextDueDate: 下一个应还日（YYYY-MM-DD）
//   daysLeft: 距下一个应还日的天数（逾期时为 0）
//   overdueDays: 逾期天数（非逾期为 0）
export function computeStatus(card, base) {
  const payDay = card.payDay;
  const lastTs = card.lastPaidDue
    ? dateStrToTs(card.lastPaidDue)
    : prevDue(payDay, base); // 兜底：异常数据按「最近一期已还」处理

  const next = nextDueAfter(payDay, lastTs);
  const daysLeft = Math.round((next - base) / DAY_MS);

  let status, overdueDays = 0, left = daysLeft;
  if (daysLeft < 0) {
    status = 'overdue';
    overdueDays = -daysLeft;
    left = 0;
  } else if (daysLeft <= 2) {
    status = 'urgent'; // 今天到期 / 剩 1-2 天
  } else if (daysLeft <= 7) {
    status = 'warning';
  } else {
    status = 'normal';
  }

  return {
    status,
    lastPaidDue: tsToDateStr(lastTs),
    nextDueDate: tsToDateStr(next),
    daysLeft: left,
    overdueDays
  };
}

// ---------- 数据读写 ----------

export async function getCards(env, email) {
  const raw = await env.CARDS_KV.get(CARDS_PREFIX + email);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

export async function saveCards(env, email, cards) {
  await env.CARDS_KV.put(CARDS_PREFIX + email, JSON.stringify(cards));
}

// ---------- 字段校验 ----------

// 返回 { error, code } 或 { value }
// code 供前端做多语言映射（error 保留中文原文，兼容旧调用方）
export function validateCard(body) {
  const alias = String(body && body.alias || '').trim();
  if (!alias) return { error: '卡别名不能为空', code: 'alias_empty' };
  if (alias.length > 30) return { error: '卡别名不能超过30字', code: 'alias_long' };

  const last4 = String(body && body.last4 || '').trim();
  if (!/^\d{4}$/.test(last4)) return { error: '卡号后4位必须是4位数字', code: 'last4_invalid' };

  const payDay = Number(body && body.payDay);
  if (!Number.isInteger(payDay) || payDay < 1 || payDay > 31) {
    return { error: '还款日必须是1-31的整数', code: 'payday_invalid' };
  }

  let billDay = null;
  if (body && body.billDay !== undefined && body.billDay !== null && body.billDay !== '') {
    billDay = Number(body.billDay);
    if (!Number.isInteger(billDay) || billDay < 1 || billDay > 31) {
      return { error: '账单日必须是1-31的整数', code: 'billday_invalid' };
    }
  }

  const bank = String(body && body.bank || '').trim().slice(0, 30);

  return {
    value: {
      alias,
      last4,
      bank: bank || null,
      billDay,
      payDay,
      amount: (body && body.amount != null && body.amount !== '') ? Number(body.amount) : null,
      amountSource: null,
      lastPaidDue: null
    }
  };
}

// 信用卡还款提醒器 · 多语言模块（简体中文 / English）
// 依赖：无。加载后暴露全局 I18N。
//
//   I18N.t(key, params)          取文案，{name} 占位符插值
//   I18N.tp(key, n, params)      取文案 + 按数量选单复数（英文用 .one/.other，中文用基础键）
//   I18N.errorText(data)         后端错误对象 -> 当前语言的提示文案
//   I18N.period('2026-09-20')    期数：2026年9月 / Sep 2026
//   I18N.date('2026-09-20')      完整日期：2026年9月20日 / Sep 20, 2026
//   I18N.monthName(9)            月份下拉标签：9月 / September
//   I18N.dayLabel(20)            还款日数字：20 号 / 20th
//   I18N.applyStatic(root)       扫描并翻译带 data-i18n 的静态节点
//   I18N.get() / I18N.set(lang)  读取 / 切换语言（写入 localStorage，并通知订阅者）
//   I18N.onChange(fn)            语言变化订阅（用于重渲染动态内容）

(function (global) {
  'use strict';

  var STORAGE_KEY = 'lang';
  var LANGS = ['zh', 'en'];

  // ---------- 词典 ----------
  var DICT = {
    zh: {
      'app.title': '信用卡还款提醒',
      'app.brand': '💳 还款提醒',
      'app.shortName': '还款提醒',

      // 登录
      'login.tagline': '多卡还款倒计时，临近自动预警',
      'login.tabCode': '验证码登录',
      'login.tabPassword': '密码登录',
      'login.email': '邮箱',
      'login.code': '验证码',
      'login.sendCode': '发送验证码',
      'login.signIn': '登录 / 注册',
      'login.password': '6 位数字密码',
      'login.signInOnly': '登录',
      'login.hint': '首次登录自动注册，未注册邮箱验证码登录即建号',
      'login.codeSent': '验证码已发送，请查收邮箱',
      'login.devCode': '开发模式，验证码：{code}',
      'header.logout': '退出',

      // 主导航
      'nav.cards': '我的信用卡',
      'nav.records': '还款记录',

      // 工具栏
      'cards.title': '我的信用卡',
      'style.ariaLabel': '卡片样式',
      'style.a': '方案A',
      'style.aTitle': '完整卡面：信息全铺开',
      'style.b': '方案B',
      'style.bTitle': '倒计时卡面：大号剩余天数',
      'import.button': '导入邮箱账单',
      'import.buttonTitle': '暂未开通，点击查看原因',
      'import.badge': '未开通',
      'btn.add': '＋ 添加卡片',

      // 导入账单安全声明
      'import.head': '导入账单功能暂未开通',
      'import.body': '导入账单需要你的邮箱「授权码」，而授权码等同于邮箱的完全控制权——拿到它的人能读取、删除你的所有邮件，甚至以你的名义发信。目前还没有既能读取账单、又不触碰你其他邮件的方法，在找到更安全的方案之前，我们暂不开放此功能。',

      // 空状态
      'empty.cards.title': '还没有信用卡',
      'empty.cards.desc': '点击「添加卡片」，录入还款日即可开始提醒',
      'empty.records.title': '还没有还款记录',
      'empty.records.desc': '点卡片上的「本期已还」后，这里会记录每次还款',

      // 汇总
      'summary.overdue': '{n} 张已逾期',
      'summary.soon': '{n} 张临近还款',

      // 卡片
      'card.bankFallback': '信用卡',
      'card.statementLabel': '账单日',
      'card.dueLabel': '还款日',
      'card.dayOfMonth': '{d} 号',
      'card.monthlyOn': '每月 {d} 号',
      'card.period': '本期 {p}',
      'card.actionPaid': '本期已还',
      'card.actionEdit': '编辑',
      'card.actionDelete': '删除',
      'card.confirmDelete': '确认删除',

      // 状态
      'status.overdue': '已逾期 {n} 天',
      'status.dueToday': '今天到期',
      'status.dueIn': '剩 {n} 天',
      'status.paidNext': '已还 · {n} 天后下期',
      'countdown.unit': '天',
      'countdown.overdue': '已逾期',
      'countdown.today': '今天到期',
      'countdown.due': '距应还日',

      // 还款记录
      'record.ending': '尾号 {n}',
      'record.dueDate': '应还日',
      'record.paidOn': '还款日',
      'filter.allCards': '全部卡片',
      'filter.allYears': '全部年份',
      'filter.allMonths': '全部月份',
      'filter.allDays': '全部日期',
      'filter.byCard': '按卡筛选',
      'filter.byYear': '按年筛选',
      'filter.byMonth': '按月筛选',
      'filter.byDay': '按日筛选',

      // 表单
      'modal.addTitle': '添加卡片',
      'modal.editTitle': '编辑卡片',
      'form.alias': '卡别名',
      'form.aliasPh': '如：招行主卡',
      'form.last4': '卡号后 4 位',
      'form.bank': '银行（可选）',
      'form.bankPh': '如：招商银行',
      'form.billDay': '账单日（可选）',
      'form.payDay': '还款日',
      'form.hint': '还款日填「每月几号」，如每月 20 号填 20',
      'form.cancel': '取消',
      'form.save': '保存',

      // 提示
      'toast.paidRecorded': '已记录本期还款',
      'toast.deleted': '已删除',

      // 前端校验 / 通用错误
      'err.generic': '请求失败',
      'err.session': '登录已过期，请重新登录',
      'err.needEmail': '请先填写邮箱',
      'err.needEmailCode': '请填写邮箱和验证码',
      'err.needEmailPass': '请填写邮箱和密码'
    },

    en: {
      'app.title': 'Credit Card Payment Reminder',
      'app.brand': '💳 Card Reminder',
      'app.shortName': 'Card Reminder',

      // Sign in
      'login.tagline': "See every card's due date at a glance — with alerts before you're late.",
      'login.tabCode': 'Email code',
      'login.tabPassword': 'Password',
      'login.email': 'Email',
      'login.code': 'Verification code',
      'login.sendCode': 'Send code',
      'login.signIn': 'Sign in / Sign up',
      'login.password': '6-digit password',
      'login.signInOnly': 'Sign in',
      'login.hint': 'New here? Signing in with a code creates your account automatically.',
      'login.codeSent': 'Code sent — check your inbox',
      'login.devCode': 'Dev mode — your code is {code}',
      'header.logout': 'Sign out',

      // Navigation
      'nav.cards': 'My Cards',
      'nav.records': 'Payment History',

      // Toolbar
      'cards.title': 'My Cards',
      'style.ariaLabel': 'Card layout',
      'style.a': 'Style A',
      'style.aTitle': 'Full card details',
      'style.b': 'Style B',
      'style.bTitle': 'Big countdown',
      'import.button': 'Import e-bill',
      'import.buttonTitle': 'Not available yet — tap to see why',
      'import.badge': 'Coming soon',
      'btn.add': '+ Add card',

      // E-bill import notice
      'import.head': "E-bill import isn't available yet",
      'import.body': "Importing your bill would require your email app password. That password is full control of your mailbox — whoever holds it can read, delete, or send mail as you. Right now there's no way to read only your bank statements without touching the rest of your inbox, so we're keeping this feature switched off until we find a safer approach.",

      // Empty states
      'empty.cards.title': 'No cards yet',
      'empty.cards.desc': 'Tap “Add card” and enter your due date to start tracking.',
      'empty.records.title': 'No payments yet',
      'empty.records.desc': 'Tap “Paid this cycle” on a card and every payment will show up here.',

      // Summary
      'summary.overdue.one': '1 card overdue',
      'summary.overdue.other': '{n} cards overdue',
      'summary.soon.one': '1 card due soon',
      'summary.soon.other': '{n} cards due soon',

      // Cards
      'card.bankFallback': 'Credit card',
      'card.statementLabel': 'Statement',
      'card.dueLabel': 'Due date',
      'card.dayOfMonth': '{d}',
      'card.monthlyOn': '{d} of each month',
      'card.period': '{p} cycle',
      'card.actionPaid': 'Paid this cycle',
      'card.actionEdit': 'Edit',
      'card.actionDelete': 'Delete',
      'card.confirmDelete': 'Confirm',

      // Status
      'status.overdue.one': '1 day overdue',
      'status.overdue.other': '{n} days overdue',
      'status.dueToday': 'Due today',
      'status.dueIn.one': 'Due in 1 day',
      'status.dueIn.other': 'Due in {n} days',
      'status.paidNext.one': 'Paid · next in 1 day',
      'status.paidNext.other': 'Paid · next in {n} days',
      'countdown.unit.one': 'day',
      'countdown.unit.other': 'days',
      'countdown.overdue': 'Overdue',
      'countdown.today': 'Due today',
      'countdown.due': 'days until due',

      // Payment history
      'record.ending': 'Ending {n}',
      'record.dueDate': 'Due date',
      'record.paidOn': 'Paid on',
      'filter.allCards': 'All cards',
      'filter.allYears': 'All years',
      'filter.allMonths': 'All months',
      'filter.allDays': 'All days',
      'filter.byCard': 'Filter by card',
      'filter.byYear': 'Filter by year',
      'filter.byMonth': 'Filter by month',
      'filter.byDay': 'Filter by day',

      // Form
      'modal.addTitle': 'Add card',
      'modal.editTitle': 'Edit card',
      'form.alias': 'Card nickname',
      'form.aliasPh': 'e.g. Chase Sapphire',
      'form.last4': 'Last 4 digits',
      'form.bank': 'Bank (optional)',
      'form.bankPh': 'e.g. Chase',
      'form.billDay': 'Statement date (optional)',
      'form.payDay': 'Due date',
      'form.hint': 'Enter the day of the month your payment is due — 20 for the 20th.',
      'form.cancel': 'Cancel',
      'form.save': 'Save',

      // Toasts
      'toast.paidRecorded': 'Payment recorded',
      'toast.deleted': 'Card deleted',

      // Client-side + generic errors
      'err.generic': 'Something went wrong',
      'err.session': 'Your session expired — please sign in again',
      'err.needEmail': 'Enter your email first',
      'err.needEmailCode': 'Enter your email and the verification code',
      'err.needEmailPass': 'Enter your email and password',

      // 后端错误码（英文）
      'err.invalid_email': 'That email address looks invalid.',
      'err.rate_limited': 'Too many requests — try again in 60 seconds.',
      'err.mail_failed': "We couldn't send the email. Please try again.",
      'err.bad_code': 'That code is incorrect or has expired.',
      'err.invalid_input': 'Check your email address and code.',
      'err.locked': 'Too many attempts. Try again in 15 minutes, or sign in with a code.',
      'err.user_not_found': 'No account with that email — sign in with a code first.',
      'err.no_password': 'No password set for this account — sign in with a code first.',
      'err.bad_password': 'Incorrect password.',
      'err.invalid_password': 'Your password must be 6 digits.',
      'err.bad_request': 'Something was wrong with that request.',
      'err.unauthorized': 'Please sign in again.',
      'err.alias_empty': 'Enter a card nickname.',
      'err.alias_long': 'Card nickname must be 30 characters or fewer.',
      'err.last4_invalid': 'Last 4 digits must be exactly 4 digits.',
      'err.payday_invalid': 'Due date must be a day between 1 and 31.',
      'err.billday_invalid': 'Statement date must be a day between 1 and 31.',
      'err.card_not_found': 'Card not found.',
      'err.invalid_json': 'Something was wrong with that request.',
      'err.method_not_allowed': 'That action isn’t supported here.'
    }
  };

  // ---------- 语言状态 ----------
  function readStored() {
    try {
      var s = localStorage.getItem(STORAGE_KEY);
      if (LANGS.indexOf(s) !== -1) return s;
    } catch (e) {}
    return null;
  }

  function detect() {
    var stored = readStored();
    if (stored) return stored;
    var nav = (global.navigator && (global.navigator.language || global.navigator.userLanguage)) || '';
    if (/^zh/i.test(nav)) return 'zh';
    if (/^en/i.test(nav)) return 'en';
    return 'zh';
  }

  // 首次进来若浏览器是英文且用户没手动选过，直接给英文（中文用户仍默认中文）
  var lang = detect();
  var listeners = [];

  function dict() { return DICT[lang] || DICT.zh; }

  // ---------- 取文案 ----------
  function interpolate(str, params) {
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, function (m, k) {
      return params[k] == null ? m : String(params[k]);
    });
  }

  function t(key, params) {
    var s = dict()[key];
    if (s == null) s = DICT.zh[key];
    if (s == null) return key;
    return interpolate(s, params);
  }

  // 带单复数：英文查 key.one / key.other，中文用基础键
  function tp(key, n, params) {
    var p = Object.assign({}, params || {}, { n: n });
    var d = dict();
    var s = null;
    if (lang === 'en') {
      s = d[n === 1 ? key + '.one' : key + '.other'];
    }
    if (s == null) s = d[key];
    if (s == null) s = DICT.zh[key];
    if (s == null) return key;
    return interpolate(s, p);
  }

  // ---------- 日期 / 数字格式 ----------
  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  function split(ds) {
    if (!ds) return null;
    var p = String(ds).split('-');
    if (p.length < 3) return null;
    return { y: Number(p[0]), m: Number(p[1]), d: Number(p[2]) };
  }

  // 英文序数：1st / 2nd / 3rd / 20th
  function ordinal(n) {
    var rem100 = n % 100;
    if (rem100 >= 11 && rem100 <= 13) return n + 'th';
    switch (n % 10) {
      case 1: return n + 'st';
      case 2: return n + 'nd';
      case 3: return n + 'rd';
      default: return n + 'th';
    }
  }

  // "2026-09-20" -> 2026年9月 / Sep 2026
  function period(ds) {
    var p = split(ds);
    if (!p) return '';
    return lang === 'en' ? MONTHS_SHORT[p.m - 1] + ' ' + p.y : p.y + '年' + p.m + '月';
  }

  // "2026-09-20" -> 2026年9月20日 / Sep 20, 2026
  function date(ds) {
    var p = split(ds);
    if (!p) return '';
    return lang === 'en'
      ? MONTHS_SHORT[p.m - 1] + ' ' + p.d + ', ' + p.y
      : p.y + '年' + p.m + '月' + p.d + '日';
  }

  // 月份下拉标签：9 -> 9月 / September
  function monthName(m) {
    var i = Number(m) - 1;
    if (i < 0 || i > 11) return String(m);
    return lang === 'en' ? MONTHS_LONG[i] : m + '月';
  }

  // 年份下拉标签：2026 -> 2026 / 2026 年
  function yearName(y) {
    return lang === 'en' ? String(y) : y + '年';
  }

  // 日期下拉标签：9 -> 9 / 9 日
  function dayName(d) {
    return lang === 'en' ? String(d) : d + '日';
  }

  // 还款日数字：20 -> 20 号 / 20th
  function dayLabel(n) {
    return t('card.dayOfMonth', { d: lang === 'en' ? ordinal(Number(n)) : Number(n) });
  }

  // ---------- 后端错误 -> 当前语言 ----------
  function errorText(data) {
    if (!data) return t('err.generic');
    // 中文直接用服务端返回的中文文案（最贴合语境）
    if (lang === 'zh') return data.message || data.error || t('err.generic');
    var key = data.code || data.error;
    if (key && DICT.en['err.' + key]) return DICT.en['err.' + key];
    if (data.message) return data.message;
    return t('err.generic');
  }

  // ---------- 静态节点翻译 ----------
  // data-i18n="key"         -> textContent
  // data-i18n-html="key"    -> innerHTML（文案含标签时用）
  // data-i18n-ph="key"      -> placeholder
  // data-i18n-title="key"   -> title
  // data-i18n-aria="key"    -> aria-label
  function applyStatic(root) {
    var scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    scope.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      el.placeholder = t(el.getAttribute('data-i18n-ph'));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
    scope.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
    // 页面标题与 iOS 主屏名
    document.title = t('app.title');
    var appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitle) appleTitle.setAttribute('content', t('app.shortName'));
  }

  // ---------- 切换 ----------
  function setLang(next) {
    if (LANGS.indexOf(next) === -1) return;
    if (next === lang) return;
    lang = next;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    document.documentElement.setAttribute('lang', lang === 'en' ? 'en' : 'zh-CN');
    document.documentElement.setAttribute('data-lang', lang);
    applyStatic(document);
    listeners.forEach(function (fn) { try { fn(lang); } catch (e) {} });
  }

  function onChange(fn) { listeners.push(fn); }

  var I18N = {
    LANGS: LANGS,
    get: function () { return lang; },
    set: setLang,
    onChange: onChange,
    t: t,
    tp: tp,
    errorText: errorText,
    applyStatic: applyStatic,
    period: period,
    date: date,
    monthName: monthName,
    yearName: yearName,
    dayName: dayName,
    dayLabel: dayLabel,
    ordinal: ordinal
  };

  // 首屏就把 html[lang] 与静态节点对齐，避免闪一下中文
  document.documentElement.setAttribute('lang', lang === 'en' ? 'en' : 'zh-CN');
  document.documentElement.setAttribute('data-lang', lang);

  global.I18N = I18N;
})(typeof window !== 'undefined' ? window : this);

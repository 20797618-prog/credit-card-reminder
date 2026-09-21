// 信用卡还款提醒器 · 前端业务逻辑
// 依赖：i18n.js（I18N）、auth.js（AccountAuth）、后端 /api/cards 接口
(function () {
  'use strict';

  // ---------- 工具 ----------
  function $(sel) { return document.querySelector(sel); }
  function t(key, params) { return I18N.t(key, params); }
  function tp(key, n, params) { return I18N.tp(key, n, params); }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 取日期串的年/月/日数字（part: 'y' | 'm' | 'd'）
  function ymd(s, part) {
    if (!s) return null;
    const p = String(s).split('-');
    if (p.length < 3) return null;
    return Number(part === 'y' ? p[0] : part === 'm' ? p[1] : p[2]);
  }

  // 错误 -> 当前语言文案（后端带 code 时优先查词典）
  function errMsg(e) {
    if (e && e.data) return I18N.errorText(e.data);
    if (e && e.status === 401) return t('err.session');
    return (e && e.message) || t('err.generic');
  }

  // ---------- 轻提示（预览面板会拦截 alert，统一用页内 toast） ----------
  let toastTimer = null;
  function toast(text, isErr) {
    let el = $('#toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = text || '';
    el.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, 3000);
  }

  // 业务请求封装：自动带 Bearer token，401 跳回登录
  async function api(path, options) {
    options = options || {};
    const headers = Object.assign({}, options.headers || {});
    const token = AccountAuth.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(path, Object.assign({}, options, { headers: headers }));
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (res.status === 401) {
      showLogin();
      const err = new Error(I18N.errorText(data) || t('err.session'));
      err.status = 401;
      err.data = data;
      throw err;
    }
    if (!res.ok) {
      const err = new Error(I18N.errorText(data));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // ---------- 视图切换 ----------
  const loginView = $('#login-view');
  const mainView = $('#main-view');

  function showLogin() {
    loginView.classList.remove('hidden');
    mainView.classList.add('hidden');
  }
  function showMain() {
    loginView.classList.add('hidden');
    mainView.classList.remove('hidden');
  }

  // ---------- 登录 ----------
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(function (el) {
    el.addEventListener('click', function () {
      tabs.forEach(function (x) { x.classList.remove('active'); });
      el.classList.add('active');
      const tab = el.getAttribute('data-tab');
      $('#tab-code').classList.toggle('hidden', tab !== 'code');
      $('#tab-password').classList.toggle('hidden', tab !== 'password');
      setMsg('');
    });
  });

  function setMsg(text, isErr) {
    const el = $('#login-msg');
    el.textContent = text || '';
    el.className = 'msg' + (text ? (isErr ? ' err' : ' ok') : '');
  }

  // 发送验证码（含 60 秒倒计时）
  let countdownTimer = null;
  $('#btn-send-code').addEventListener('click', async function () {
    const email = $('#login-email').value.trim();
    if (!email) { setMsg(t('err.needEmail'), true); return; }
    const btn = $('#btn-send-code');
    try {
      btn.disabled = true;
      const r = await AccountAuth.requestCode(email);
      if (r && r.dev) setMsg(t('login.devCode', { code: r.code || '' }), false);
      else setMsg(t('login.codeSent'), false);
      let left = 60;
      btn.textContent = left + 's';
      countdownTimer = setInterval(function () {
        left--;
        if (left <= 0) {
          clearInterval(countdownTimer);
          btn.disabled = false;
          btn.textContent = t('login.sendCode');
        } else {
          btn.textContent = left + 's';
        }
      }, 1000);
    } catch (e) {
      btn.disabled = false;
      setMsg(errMsg(e), true);
    }
  });

  $('#btn-login-code').addEventListener('click', async function () {
    const email = $('#login-email').value.trim();
    const code = $('#login-code').value.trim();
    if (!email || !code) { setMsg(t('err.needEmailCode'), true); return; }
    try {
      await AccountAuth.verifyCode(email, code);
      enterApp();
    } catch (e) {
      setMsg(errMsg(e), true);
    }
  });

  $('#btn-login-password').addEventListener('click', async function () {
    const email = $('#login-email2').value.trim();
    const password = $('#login-password').value.trim();
    if (!email || !password) { setMsg(t('err.needEmailPass'), true); return; }
    try {
      await AccountAuth.loginPassword(email, password);
      enterApp();
    } catch (e) {
      setMsg(errMsg(e), true);
    }
  });

  $('#btn-logout').addEventListener('click', function () {
    AccountAuth.logout();
    showLogin();
  });

  // 登录成功进入应用
  async function enterApp() {
    setMsg('');
    const me = await AccountAuth.me();
    $('#user-email').textContent = me.user.email;
    showMain();
    loadCards();
  }

  // ---------- 卡片列表 ----------
  function statusMeta(card) {
    switch (card.status) {
      case 'overdue':
        return { cls: 'overdue', text: tp('status.overdue', card.overdueDays) };
      case 'urgent':
        return {
          cls: 'urgent',
          text: card.daysLeft === 0 ? t('status.dueToday') : tp('status.dueIn', card.daysLeft)
        };
      case 'warning':
        return { cls: 'warning', text: tp('status.dueIn', card.daysLeft) };
      case 'paid':
        return { cls: 'paid', text: tp('status.paidNext', card.daysLeft) };
      default:
        return { cls: 'normal', text: tp('status.dueIn', card.daysLeft) };
    }
  }

  // 卡片样式偏好：'A' 完整卡面（信息全铺开）/ 'B' 倒计时焦点（大号剩余天数）
  let cardStyle = 'A';
  try { cardStyle = localStorage.getItem('cardStyle') === 'B' ? 'B' : 'A'; } catch (e) {}

  // 方案 B 的大号倒计时数字
  function countdown(c) {
    const n = c.status === 'overdue' ? c.overdueDays : c.daysLeft;
    return { num: n, unit: tp('countdown.unit', n) };
  }

  // 三枚操作按钮（两方案共用）
  function cardActionsHtml(c) {
    return '<div class="card-actions">' +
      '<button class="btn-paid" data-act="paid" data-id="' + c.id + '">' + t('card.actionPaid') + '</button>' +
      '<button class="btn-mini" data-act="edit" data-id="' + c.id + '">' + t('card.actionEdit') + '</button>' +
      '<button class="btn-mini danger" data-act="del" data-id="' + c.id + '">' + t('card.actionDelete') + '</button>' +
    '</div>';
  }

  // 方案 A：完整卡面（银行/别名/尾号/账单日/还款日）+ 右侧状态与操作
  function renderCardA(c) {
    const m = statusMeta(c);
    const bank = c.bank ? escapeHtml(c.bank) : t('card.bankFallback');
    const billDay = c.billDay ? I18N.dayLabel(c.billDay) : '—';
    const period = c.nextDueDate
      ? '<div class="card-period">' + t('card.period', { p: I18N.period(c.nextDueDate) }) + '</div>' : '';
    return '' +
      '<div class="card style-a ' + m.cls + '">' +
        '<div class="card-face">' +
          '<div class="face-top">' +
            '<span class="face-bank">' + bank + '</span>' +
            '<span class="face-logo">💳</span>' +
          '</div>' +
          '<div class="face-alias">' + escapeHtml(c.alias) + '</div>' +
          '<div class="face-number">•••• •••• •••• ' + escapeHtml(c.last4) + '</div>' +
          '<div class="face-bottom">' +
            '<div class="face-field"><span>' + t('card.statementLabel') + '</span><b>' + billDay + '</b></div>' +
            '<div class="face-field"><span>' + t('card.dueLabel') + '</span><b>' + I18N.dayLabel(c.payDay) + '</b></div>' +
          '</div>' +
        '</div>' +
        '<div class="card-side">' +
          '<div class="side-top">' +
            '<div class="badge ' + m.cls + '">' + m.text + '</div>' +
            period +
          '</div>' +
          cardActionsHtml(c) +
        '</div>' +
      '</div>';
  }

  // 方案 B：简洁卡面 + 右侧大号倒计时焦点
  function renderCardB(c) {
    const m = statusMeta(c);
    const bank = c.bank ? escapeHtml(c.bank) : t('card.bankFallback');
    const cd = countdown(c);
    // 大数字已表达天数，label 只做语义说明，避免重复
    const label = c.status === 'overdue' ? t('countdown.overdue')
      : (c.status === 'urgent' && c.daysLeft === 0) ? t('countdown.today')
      : t('countdown.due');
    const period = c.nextDueDate
      ? '<div class="card-period">' + t('card.period', { p: I18N.period(c.nextDueDate) }) + '</div>' : '';
    return '' +
      '<div class="card style-b ' + m.cls + '">' +
        '<div class="card-face compact">' +
          '<div class="face-top">' +
            '<span class="face-bank">' + bank + '</span>' +
            '<span class="face-logo">💳</span>' +
          '</div>' +
          '<div class="face-number">•••• ' + escapeHtml(c.last4) + '</div>' +
          '<div class="face-field"><span>' + t('card.dueLabel') + '</span><b>' +
            t('card.monthlyOn', { d: I18N.dayLabel(c.payDay) }) + '</b></div>' +
        '</div>' +
        '<div class="card-side">' +
          '<div class="countdown ' + m.cls + '">' +
            '<span class="countdown-num">' + cd.num + '</span>' +
            '<span class="countdown-unit">' + cd.unit + '</span>' +
          '</div>' +
          '<div class="countdown-label ' + m.cls + '">' + label + '</div>' +
          period +
          cardActionsHtml(c) +
        '</div>' +
      '</div>';
  }

  function renderCards(cards) {
    const listEl = $('#card-list');
    const emptyEl = $('#empty-state');
    const summaryEl = $('#summary');

    if (!cards.length) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      summaryEl.innerHTML = '';
      return;
    }
    emptyEl.classList.add('hidden');

    // 汇总：逾期 / 临近（≤7天未还）
    const overdue = cards.filter(function (c) { return c.status === 'overdue'; }).length;
    const soon = cards.filter(function (c) {
      return c.status !== 'overdue' && c.daysLeft <= 7;
    }).length;
    let summaryHtml = '';
    if (overdue || soon) {
      const parts = [];
      if (overdue) parts.push('<span class="sum-overdue">' + tp('summary.overdue', overdue) + '</span>');
      if (soon) parts.push('<span class="sum-soon">' + tp('summary.soon', soon) + '</span>');
      summaryHtml = '<div class="summary-alert">' + parts.join('　') + '</div>';
    }
    summaryEl.innerHTML = summaryHtml;

    listEl.innerHTML = cards.map(function (c) {
      return cardStyle === 'B' ? renderCardB(c) : renderCardA(c);
    }).join('');
  }

  // 样式切换（即时重排 + 持久化）
  document.querySelectorAll('.style-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      cardStyle = btn.getAttribute('data-style');
      try { localStorage.setItem('cardStyle', cardStyle); } catch (e) {}
      document.querySelectorAll('.style-btn').forEach(function (x) {
        x.classList.toggle('active', x === btn);
      });
      loadCards();
    });
  });
  // 初始高亮与已存偏好对齐
  document.querySelectorAll('.style-btn').forEach(function (x) {
    x.classList.toggle('active', x.getAttribute('data-style') === cardStyle);
  });

  async function loadCards() {
    try {
      const data = await api('/api/cards');
      renderCards(data.cards || []);
    } catch (e) {
      if (AccountAuth.isLoggedIn()) toast(errMsg(e), true);
    }
  }

  // 事件委托：已还 / 编辑 / 删除
  $('#card-list').addEventListener('click', async function (ev) {
    const btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    const id = btn.getAttribute('data-id');

    if (act === 'paid') {
      try {
        await api('/api/cards/' + id + '/paid', { method: 'POST' });
        toast(t('toast.paidRecorded'));
        loadCards();
      } catch (e) { toast(errMsg(e), true); }
    } else if (act === 'edit') {
      openEdit(id);
    } else if (act === 'del') {
      // 预览面板会拦截 confirm，改用「二次点击确认」
      if (btn.getAttribute('data-confirm') !== '1') {
        btn.setAttribute('data-confirm', '1');
        const orig = btn.textContent;
        btn.textContent = t('card.confirmDelete');
        btn.classList.add('confirming');
        setTimeout(function () {
          btn.removeAttribute('data-confirm');
          btn.textContent = orig;
          btn.classList.remove('confirming');
        }, 2500);
        return;
      }
      try {
        await api('/api/cards/' + id, { method: 'DELETE' });
        toast(t('toast.deleted'));
        loadCards();
      } catch (e) { toast(errMsg(e), true); }
    }
  });

  // ---------- 主视图 tab 切换 ----------
  document.querySelectorAll('.main-tab').forEach(function (el) {
    el.addEventListener('click', function () {
      document.querySelectorAll('.main-tab').forEach(function (x) { x.classList.remove('active'); });
      el.classList.add('active');
      const v = el.getAttribute('data-view');
      $('#cards-panel').classList.toggle('hidden', v !== 'cards');
      $('#records-panel').classList.toggle('hidden', v !== 'records');
      if (v === 'records') loadRepayments();
    });
  });

  // ---------- 还款记录 ----------
  let records = [];
  const filter = { cardId: '', year: '', month: '', day: '' };

  function uniq(arr) {
    return Array.from(new Set(arr.filter(function (v) { return v != null; })));
  }

  // labelOf 可选：用于「值 -> 显示文案」不一致的场景（如月份 9 显示为 September）
  function fillSelect(sel, values, allLabel, labelOf) {
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">' + escapeHtml(allLabel) + '</option>' +
      values.map(function (v) {
        return '<option value="' + escapeHtml(v) + '">' +
          escapeHtml(labelOf ? labelOf(v) : v) + '</option>';
      }).join('');
    if (Array.prototype.some.call(sel.options, function (o) { return o.value === cur; })) {
      sel.value = cur;
    }
  }

  // 按卡筛选下拉：从记录里聚合出出现过的卡（cardId -> alias）
  function fillCardSelect() {
    const sel = $('#filter-card');
    if (!sel) return;
    const cur = sel.value;
    const map = {};
    records.forEach(function (r) {
      if (!map[r.cardId]) map[r.cardId] = r.alias;
    });
    const ids = Object.keys(map);
    sel.innerHTML = '<option value="">' + escapeHtml(t('filter.allCards')) + '</option>' +
      ids.map(function (id) {
        return '<option value="' + escapeHtml(id) + '">' + escapeHtml(map[id]) + '</option>';
      }).join('');
    if (ids.indexOf(cur) !== -1) sel.value = cur;
    else filter.cardId = '';
  }

  function rebuildFilters() {
    const y = filter.year ? Number(filter.year) : null;

    const years = uniq(records.map(function (r) { return ymd(r.paidAt, 'y'); }))
      .sort(function (a, b) { return b - a; });
    fillSelect($('#filter-year'), years, t('filter.allYears'), I18N.yearName);

    const months = uniq(records.filter(function (r) { return !y || ymd(r.paidAt, 'y') === y; })
      .map(function (r) { return ymd(r.paidAt, 'm'); }))
      .sort(function (a, b) { return b - a; });
    if (filter.month && months.indexOf(Number(filter.month)) === -1) filter.month = '';
    fillSelect($('#filter-month'), months, t('filter.allMonths'), I18N.monthName);

    const m = filter.month ? Number(filter.month) : null;
    const days = uniq(records.filter(function (r) {
      return (!y || ymd(r.paidAt, 'y') === y) && (!m || ymd(r.paidAt, 'm') === m);
    }).map(function (r) { return ymd(r.paidAt, 'd'); }))
      .sort(function (a, b) { return b - a; });
    if (filter.day && days.indexOf(Number(filter.day)) === -1) filter.day = '';
    fillSelect($('#filter-day'), days, t('filter.allDays'), I18N.dayName);
  }

  function applyFilter() {
    const list = records.filter(function (r) {
      if (filter.cardId && r.cardId !== filter.cardId) return false;
      if (filter.year && ymd(r.paidAt, 'y') !== Number(filter.year)) return false;
      if (filter.month && ymd(r.paidAt, 'm') !== Number(filter.month)) return false;
      if (filter.day && ymd(r.paidAt, 'd') !== Number(filter.day)) return false;
      return true;
    });
    renderRecords(list);
  }

  function renderRecords(list) {
    const listEl = $('#records-list');
    const emptyEl = $('#records-empty');
    if (!list.length) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');
    listEl.innerHTML = list.map(function (r) {
      const bank = r.bank ? '<span class="record-bank">' + escapeHtml(r.bank) + '</span>' : '';
      return '' +
        '<div class="record">' +
          '<div class="record-head">' +
            '<span class="record-alias">' + escapeHtml(r.alias) + '</span>' +
            '<span class="record-sub">' + bank +
              '<span>' + t('record.ending', { n: escapeHtml(r.last4) }) + '</span></span>' +
          '</div>' +
          '<div class="record-body">' +
            '<div class="record-line"><span>' + t('record.dueDate') + '</span><b>' +
              I18N.date(r.dueDate) + '</b></div>' +
            '<div class="record-line"><span>' + t('record.paidOn') + '</span><b>' +
              I18N.date(r.paidAt) + '</b></div>' +
          '</div>' +
        '</div>';
    }).join('');
  }

  async function loadRepayments() {
    try {
      const data = await api('/api/repayments');
      records = data.records || [];
      fillCardSelect();
      rebuildFilters();
      applyFilter();
    } catch (e) {
      if (AccountAuth.isLoggedIn()) toast(errMsg(e), true);
    }
  }

  $('#filter-card').addEventListener('change', function () {
    filter.cardId = this.value;
    applyFilter();
  });
  $('#filter-year').addEventListener('change', function () {
    filter.year = this.value;
    rebuildFilters();
    applyFilter();
  });
  $('#filter-month').addEventListener('change', function () {
    filter.month = this.value;
    rebuildFilters();
    applyFilter();
  });
  $('#filter-day').addEventListener('change', function () {
    filter.day = this.value;
    applyFilter();
  });

  // ---------- 添加 / 编辑卡片 ----------
  const modal = $('#modal');
  let editingId = null;

  function openAdd() {
    editingId = null;
    $('#modal-title').textContent = t('modal.addTitle');
    $('#card-form').reset();
    $('#f-id').value = '';
    const msgEl = $('#form-msg');
    if (msgEl) { msgEl.textContent = ''; msgEl.className = 'form-msg'; }
    modal.classList.remove('hidden');
  }

  function openEdit(id) {
    editingId = id;
    // 从当前渲染的数据里找到该卡（重新拉一次更稳）
    api('/api/cards').then(function (data) {
      const c = (data.cards || []).find(function (x) { return x.id === id; });
      if (!c) return;
      $('#modal-title').textContent = t('modal.editTitle');
      $('#f-id').value = c.id;
      $('#f-alias').value = c.alias;
      $('#f-last4').value = c.last4;
      $('#f-bank').value = c.bank || '';
      $('#f-billDay').value = c.billDay || '';
      $('#f-payDay').value = c.payDay;
      modal.classList.remove('hidden');
    }).catch(function (e) { toast(errMsg(e), true); });
  }

  function closeModal() {
    modal.classList.add('hidden');
  }

  $('#btn-add').addEventListener('click', openAdd);
  // 导入邮箱账单（暂未开通）：点击展示安全说明，再点收起
  $('#btn-import-bill').addEventListener('click', function () {
    $('#bill-import-hint').classList.toggle('hidden');
  });
  $('#btn-cancel').addEventListener('click', closeModal);
  $('#modal-mask').addEventListener('click', closeModal);

  $('#card-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    const msgEl = $('#form-msg');
    if (msgEl) { msgEl.textContent = ''; msgEl.className = 'form-msg'; }
    const payload = {
      alias: $('#f-alias').value,
      last4: $('#f-last4').value,
      bank: $('#f-bank').value,
      billDay: $('#f-billDay').value,
      payDay: $('#f-payDay').value
    };
    try {
      if (editingId) {
        await api('/api/cards/' + editingId, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api('/api/cards', { method: 'POST', body: JSON.stringify(payload) });
      }
      closeModal();
      loadCards();
    } catch (e) {
      if (msgEl) { msgEl.textContent = errMsg(e); msgEl.className = 'form-msg err'; }
      else { toast(errMsg(e), true); }
    }
  });

  // ---------- 语言切换 ----------
  function syncLangButtons() {
    const cur = I18N.get();
    document.querySelectorAll('.lang-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-lang') === cur);
    });
  }

  document.querySelectorAll('.lang-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      I18N.set(btn.getAttribute('data-lang'));
    });
  });

  // 切换语言后：静态文案已由 I18N 翻译，这里重渲染所有动态内容
  I18N.onChange(function () {
    syncLangButtons();
    if (modal && !modal.classList.contains('hidden')) {
      $('#modal-title').textContent = t(editingId ? 'modal.editTitle' : 'modal.addTitle');
    }
    if (AccountAuth.isLoggedIn()) {
      loadCards();
      if (!$('#records-panel').classList.contains('hidden')) loadRepayments();
    }
  });

  // ---------- 初始化 ----------
  (async function init() {
    I18N.applyStatic(document);
    syncLangButtons();
    if (!AccountAuth.isLoggedIn()) { showLogin(); return; }
    try {
      const me = await AccountAuth.me();
      $('#user-email').textContent = me.user.email;
      showMain();
      loadCards();
    } catch (e) {
      showLogin();
    }
  })();
})();

// 信用卡还款提醒器 · 前端业务逻辑
// 依赖：auth.js（AccountAuth）、后端 /api/cards 接口
(function () {
  'use strict';

  // ---------- 工具 ----------
  function $(sel) { return document.querySelector(sel); }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // "2026-09-20" -> "2026年9月"（用于卡片上的本期期数）
  function fmtPeriod(ds) {
    if (!ds) return '';
    return Number(ds.slice(0, 4)) + '年' + Number(ds.slice(5, 7)) + '月';
  }
  // "2026-09-20" -> "2026年9月20日"
  function fmtDateCn(ds) {
    if (!ds) return '';
    return Number(ds.slice(0, 4)) + '年' + Number(ds.slice(5, 7)) + '月' + Number(ds.slice(8, 10)) + '日';
  }
  // 取日期串的年/月/日数字（part: 'y' | 'm' | 'd'）
  function ymd(s, part) {
    if (!s) return null;
    const p = String(s).split('-');
    if (p.length < 3) return null;
    return Number(part === 'y' ? p[0] : part === 'm' ? p[1] : p[2]);
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
      throw new Error((data && data.error) || '登录已过期，请重新登录');
    }
    if (!res.ok) throw new Error((data && data.error) || '请求失败');
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
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      tabs.forEach(function (x) { x.classList.remove('active'); });
      t.classList.add('active');
      const tab = t.getAttribute('data-tab');
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
    if (!email) { setMsg('请先填写邮箱', true); return; }
    const btn = $('#btn-send-code');
    try {
      btn.disabled = true;
      const r = await AccountAuth.requestCode(email);
      if (r && r.dev) setMsg('开发模式，验证码：' + (r.code || ''), false);
      else setMsg('验证码已发送，请查收邮箱', false);
      let left = 60;
      btn.textContent = left + 's';
      countdownTimer = setInterval(function () {
        left--;
        if (left <= 0) {
          clearInterval(countdownTimer);
          btn.disabled = false;
          btn.textContent = '发送验证码';
        } else {
          btn.textContent = left + 's';
        }
      }, 1000);
    } catch (e) {
      btn.disabled = false;
      setMsg(e.message, true);
    }
  });

  $('#btn-login-code').addEventListener('click', async function () {
    const email = $('#login-email').value.trim();
    const code = $('#login-code').value.trim();
    if (!email || !code) { setMsg('请填写邮箱和验证码', true); return; }
    try {
      await AccountAuth.verifyCode(email, code);
      enterApp();
    } catch (e) {
      setMsg(e.message, true);
    }
  });

  $('#btn-login-password').addEventListener('click', async function () {
    const email = $('#login-email2').value.trim();
    const password = $('#login-password').value.trim();
    if (!email || !password) { setMsg('请填写邮箱和密码', true); return; }
    try {
      await AccountAuth.loginPassword(email, password);
      enterApp();
    } catch (e) {
      setMsg(e.message, true);
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
        return { cls: 'overdue', text: '已逾期 ' + card.overdueDays + ' 天' };
      case 'urgent':
        return { cls: 'urgent', text: card.daysLeft === 0 ? '今天到期' : '剩 ' + card.daysLeft + ' 天' };
      case 'warning':
        return { cls: 'warning', text: '剩 ' + card.daysLeft + ' 天' };
      case 'paid':
        return { cls: 'paid', text: '已还 · ' + card.daysLeft + ' 天后下期' };
      default:
        return { cls: 'normal', text: '剩 ' + card.daysLeft + ' 天' };
    }
  }

  // 卡片样式偏好：'A' 完整卡面（信息全铺开）/ 'B' 倒计时焦点（大号剩余天数）
  let cardStyle = 'A';
  try { cardStyle = localStorage.getItem('cardStyle') === 'B' ? 'B' : 'A'; } catch (e) {}

  // 方案 B 的大号倒计时数字
  function countdown(c) {
    if (c.status === 'overdue') return { num: c.overdueDays, unit: '天' };
    return { num: c.daysLeft, unit: '天' };
  }

  // 三枚操作按钮（两方案共用）
  function cardActionsHtml(c) {
    return '<div class="card-actions">' +
      '<button class="btn-paid" data-act="paid" data-id="' + c.id + '">本期已还</button>' +
      '<button class="btn-mini" data-act="edit" data-id="' + c.id + '">编辑</button>' +
      '<button class="btn-mini danger" data-act="del" data-id="' + c.id + '">删除</button>' +
    '</div>';
  }

  // 方案 A：完整卡面（银行/别名/尾号/账单日/还款日）+ 右侧状态与操作
  function renderCardA(c) {
    const m = statusMeta(c);
    const bank = c.bank ? escapeHtml(c.bank) : '信用卡';
    const billDay = c.billDay ? (c.billDay + ' 号') : '—';
    const period = c.nextDueDate ? '<div class="card-period">本期 ' + fmtPeriod(c.nextDueDate) + '</div>' : '';
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
            '<div class="face-field"><span>账单日</span><b>' + billDay + '</b></div>' +
            '<div class="face-field"><span>还款日</span><b>' + c.payDay + ' 号</b></div>' +
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
    const bank = c.bank ? escapeHtml(c.bank) : '信用卡';
    const cd = countdown(c);
    // 大数字已表达天数，label 只做语义说明，避免重复
    const label = c.status === 'overdue' ? '已逾期'
      : (c.status === 'urgent' && c.daysLeft === 0) ? '今天到期'
      : '距应还日';
    const period = c.nextDueDate ? '<div class="card-period">本期 ' + fmtPeriod(c.nextDueDate) + '</div>' : '';
    return '' +
      '<div class="card style-b ' + m.cls + '">' +
        '<div class="card-face compact">' +
          '<div class="face-top">' +
            '<span class="face-bank">' + bank + '</span>' +
            '<span class="face-logo">💳</span>' +
          '</div>' +
          '<div class="face-number">•••• ' + escapeHtml(c.last4) + '</div>' +
          '<div class="face-field"><span>还款日</span><b>每月 ' + c.payDay + ' 号</b></div>' +
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
      if (overdue) parts.push('<span class="sum-overdue">' + overdue + ' 张已逾期</span>');
      if (soon) parts.push('<span class="sum-soon">' + soon + ' 张临近还款</span>');
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
      if (AccountAuth.isLoggedIn()) toast(e.message, true);
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
        toast('已记录本期还款');
        loadCards();
      } catch (e) { toast(e.message, true); }
    } else if (act === 'edit') {
      openEdit(id);
    } else if (act === 'del') {
      // 预览面板会拦截 confirm，改用「二次点击确认」
      if (btn.getAttribute('data-confirm') !== '1') {
        btn.setAttribute('data-confirm', '1');
        const orig = btn.textContent;
        btn.textContent = '确认删除';
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
        toast('已删除');
        loadCards();
      } catch (e) { toast(e.message, true); }
    }
  });

  // ---------- 主视图 tab 切换 ----------
  document.querySelectorAll('.main-tab').forEach(function (t) {
    t.addEventListener('click', function () {
      document.querySelectorAll('.main-tab').forEach(function (x) { x.classList.remove('active'); });
      t.classList.add('active');
      const v = t.getAttribute('data-view');
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

  function fillSelect(sel, values, allLabel, suffix) {
    const cur = sel.value;
    sel.innerHTML = '<option value="">' + allLabel + '</option>' +
      values.map(function (v) {
        return '<option value="' + v + '">' + v + (suffix || '') + '</option>';
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
    sel.innerHTML = '<option value="">全部卡片</option>' +
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
    fillSelect($('#filter-year'), years, '全部年份', '年');

    const months = uniq(records.filter(function (r) { return !y || ymd(r.paidAt, 'y') === y; })
      .map(function (r) { return ymd(r.paidAt, 'm'); }))
      .sort(function (a, b) { return b - a; });
    if (filter.month && months.indexOf(Number(filter.month)) === -1) filter.month = '';
    fillSelect($('#filter-month'), months, '全部月份', '月');

    const m = filter.month ? Number(filter.month) : null;
    const days = uniq(records.filter(function (r) {
      return (!y || ymd(r.paidAt, 'y') === y) && (!m || ymd(r.paidAt, 'm') === m);
    }).map(function (r) { return ymd(r.paidAt, 'd'); }))
      .sort(function (a, b) { return b - a; });
    if (filter.day && days.indexOf(Number(filter.day)) === -1) filter.day = '';
    fillSelect($('#filter-day'), days, '全部日期', '日');
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
            '<span class="record-sub">' + bank + '尾号 ' + escapeHtml(r.last4) + '</span>' +
          '</div>' +
          '<div class="record-body">' +
            '<div class="record-line"><span>应还日</span><b>' + fmtDateCn(r.dueDate) + '</b></div>' +
            '<div class="record-line"><span>还款日</span><b>' + fmtDateCn(r.paidAt) + '</b></div>' +
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
      if (AccountAuth.isLoggedIn()) toast(e.message, true);
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
    $('#modal-title').textContent = '添加卡片';
    $('#card-form').reset();
    $('#f-id').value = '';
    modal.classList.remove('hidden');
  }

  function openEdit(id) {
    editingId = id;
    // 从当前渲染的数据里找到该卡（重新拉一次更稳）
    api('/api/cards').then(function (data) {
      const c = (data.cards || []).find(function (x) { return x.id === id; });
      if (!c) return;
      $('#modal-title').textContent = '编辑卡片';
      $('#f-id').value = c.id;
      $('#f-alias').value = c.alias;
      $('#f-last4').value = c.last4;
      $('#f-bank').value = c.bank || '';
      $('#f-billDay').value = c.billDay || '';
      $('#f-payDay').value = c.payDay;
      modal.classList.remove('hidden');
    }).catch(function (e) { toast(e.message, true); });
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
      if (msgEl) { msgEl.textContent = e.message; msgEl.className = 'form-msg err'; }
      else { toast(e.message, true); }
    }
  });

  // ---------- 初始化 ----------
  (async function init() {
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

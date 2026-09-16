import { createRequire } from 'module';
const require = createRequire('/Users/kenmaster/.workbuddy/binaries/node/workspace/');
const puppeteer = require('puppeteer-core');

const BASE = 'http://127.0.0.1:8788';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function ok(name, cond, extra) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

// 1) API 登录 + 建卡
const email = 'layout' + Date.now() + '@test.com';
let r = await fetch(BASE + '/api/auth/request-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
let d = await r.json();
r = await fetch(BASE + '/api/auth/verify-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code: d.code }) });
d = await r.json();
const token = d.token;

const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
r = await fetch(BASE + '/api/cards', { method: 'POST', headers: H, body: JSON.stringify({ alias: '招行主卡', last4: '8888', bank: '招商银行', billDay: 5, payDay: 20 }) });
d = await r.json();
console.log('建卡:', d.ok ? 'OK ' + d.card.id.slice(0, 8) : JSON.stringify(d));

// 2) 浏览器验证
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.evaluate(t => { localStorage.setItem('auth_token', t); localStorage.setItem('cardStyle', 'A'); }, token);
await page.reload({ waitUntil: 'networkidle0' });

// 等待卡片渲染
await page.waitForSelector('#card-list .card', { timeout: 8000 });

// 默认方案 A
const hasA = await page.$('#card-list .card.style-a');
const hasFace = await page.$('#card-list .card-face');
const hasCountdownInit = await page.$('#card-list .countdown');
ok('默认渲染方案A（.style-a）', !!hasA);
ok('方案A含拟物卡面（.card-face）', !!hasFace);
ok('方案A不含倒计时数字（无 .countdown）', !hasCountdownInit);

// 检查方案A卡面字段齐全
const faceText = await page.$eval('#card-list .card-face', el => el.textContent);
ok('卡面含银行/尾号/账单日/还款日', /招商银行/.test(faceText) && /8888/.test(faceText) && /账单日/.test(faceText) && /还款日/.test(faceText), faceText.replace(/\s+/g, ' '));

// 切到方案 B
await page.click('.style-btn[data-style="B"]');
await page.waitForFunction(() => document.querySelector('#card-list .card.style-b'), { timeout: 5000 });
const hasB = await page.$('#card-list .card.style-b');
const hasCountdown = await page.$('#card-list .countdown-num');
const numText = await page.$eval('#card-list .countdown-num', el => el.textContent);
ok('切换到方案B（.style-b）', !!hasB);
ok('方案B含大号倒计时（.countdown-num）', !!hasCountdown, '数字=' + numText);

const stored = await page.evaluate(() => localStorage.getItem('cardStyle'));
ok('cardStyle 持久化 = B', stored === 'B', 'stored=' + stored);

// 刷新后保持方案 B
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('#card-list .card', { timeout: 8000 });
const stillB = await page.$('#card-list .card.style-b');
const activeBtn = await page.$eval('.style-btn.active', el => el.getAttribute('data-style'));
ok('刷新后仍是方案B', !!stillB);
ok('切换按钮高亮 = B', activeBtn === 'B');

ok('无 JS 报错', errors.length === 0, errors.join(' | '));

await browser.close();
console.log('\n完成。' + (process.exitCode ? '存在失败项' : '全部通过'));

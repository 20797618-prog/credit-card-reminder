# 信用卡还款提醒器

一个「还款倒计时仪表盘」：登录后列出你所有信用卡，每张卡持续显示距还款日还剩几天，越临近越醒目，逾期标红，避免漏还。

复用现有账号体系（`account-system`），不同邮箱登录看到各自独立的卡片数据。

## 功能

- **多卡管理**：录入卡别名、卡号后 4 位、银行、账单日（可选）、还款日。
- **还款倒计时**：每张卡实时显示「剩 N 天 / 今天到期 / 已逾期 N 天」，分级预警。
- **本期已还**：点一下标记已还，倒计时自动滚到下一期，并记录本次还款。
- **还款记录**：按年 / 月 / 日三级筛选查看历史还款记录（含应还日与实际还款日）。
- **数据隔离**：卡片数据按登录邮箱隔离，仅存卡号后 4 位。
- **金额预留**：`amount` 字段已预留，后续可接邮箱账单自动读取还款金额。

## 技术栈

Cloudflare Pages + Functions + KV，原生 HTML/CSS/JS，无框架。

## 目录结构

```
├── index.html          # 单页应用（登录 + 卡片列表）
├── app.js              # 前端业务逻辑
├── style.css           # 样式（含预警配色、响应式）
├── auth.js             # 账号体系前端认证模块（复制自 account-system）
├── wrangler.jsonc      # KV 绑定配置
├── PRD.md              # 产品需求文档
├── test-algo.mjs       # 还款日算法单元测试
└── functions/
    ├── _account_lib.js # 账号核心库（复制自 account-system）
    ├── _mail.js        # 邮件发送（复制自 account-system）
    ├── _cards_lib.js   # 卡片业务库（还款日算法 + 数据读写）
    └── api/
        ├── auth/       # 登录接口（复制自 account-system）
        └── cards/      # 卡片 CRUD + 本期已还
```

## 部署步骤

### 1. 创建业务 KV

在 Cloudflare 控制台 → Workers & Pages → KV，新建命名空间，名字随意（如 `CARDS_KV`），记下它的 id。

### 2. 填入 KV id

打开 `wrangler.jsonc`，把 `CARDS_KV` 的 `id` 替换为你刚创建的命名空间 id：

```jsonc
{ "binding": "CARDS_KV", "id": "你的KV-id" }
```

> `ACCOUNTS_KV` 的 id 保持 `e8d41d4739e94a80b3f566fc0d549e96` 不变，这是账号互通的关键。

### 3. 部署到 Cloudflare Pages

- 方式 A（命令行）：`npx wrangler pages deploy .`（需先登录 `npx wrangler login`）。
- 方式 B（网页）：在 Pages 控制台「上传项目文件」，直接上传本目录，框架预设选「无」。

部署后 Pages Functions 会自动生效，`/api/auth/*` 和 `/api/cards` 接口可用。

### 4. 配置环境变量

到项目的 Settings → Environment variables，添加邮件验证码所需变量（值从账号体系项目复制）：

| 变量名 | 说明 |
| --- | --- |
| `MAIL_ENABLED` | `true` 真实发信；`false` 开发模式（验证码直接返回） |
| `MAIL_USER` | 发件邮箱（QQ 邮箱） |
| `MAIL_PASS` | 邮箱授权码（敏感） |
| `MAIL_PORT` | `465` |
| `MAIL_FROM_NAME` | 应用名，如「信用卡还款提醒」 |

### 5. 验证

1. 打开部署后的地址，走「发送验证码 → 输入验证码登录」。
2. 用之前在账号体系项目注册过的邮箱登录，应能直接进入（账号互通）。
3. 添加一张信用卡，观察倒计时与预警颜色。

## 本地测试

### 起本地服务

```bash
npx wrangler pages dev . --ip 127.0.0.1 --persist-to .wrangler/state
```

启动后访问 `http://127.0.0.1:8788`。未配置 SMTP 时自动进入开发模式，验证码会直接显示在页面上，无需真实邮件。

### 算法单元测试

```bash
node --experimental-default-type=module test-algo.mjs
```

### 接口端到端测试

```bash
# 先启动 wrangler pages dev，再运行
node test-api.mjs
```

## 关键设计

- **还款指针模型**：每张卡存 `lastPaidDue`（最后已还的还款日），下一个应还日 = 它之后的下一个还款日。逾期、倒计时、预警都基于这个指针，无需定时任务。
- **时区**：按东八区（UTC+8）取「今天」，适配中国用户；如需其他时区改 `functions/_cards_lib.js` 的 `TZ_OFFSET_HOURS`。
- **月末边界**：还款日 31 号在 2 月自动取 2 月最后一天。

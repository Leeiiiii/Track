# EdgeTrack 首次部署与开发手册

本项目采用固定流程：**本地开发 → 推送 GitHub → GitHub Actions 自动迁移 D1 并部署 Workers → 线上验证**。首次配置完成后，日常不需要在本机登录 Cloudflare 或手动执行远程 D1 命令。

## 0. 前提

- Cloudflare 账户。
- GitHub 仓库，默认发布分支为 `main`。
- 本机 Node.js 22 或更高版本。

## 1. 配置 Cloudflare API Token

在 Cloudflare Dashboard → **My Profile → API Tokens → Create Token** 创建一个自定义 Token。资源范围限制到实际部署的 Cloudflare 账户，至少授予：

- **Account / Workers Scripts / Edit**：发布与更新 Worker。
- **Account / D1 / Edit**：创建数据库、应用迁移并读写数据库配置。

将 Token 复制一次后妥善保存；不要提交到仓库、不要发到聊天记录。

同一页面或 Cloudflare Dashboard 侧栏可找到 **Account ID**。

## 2. 配置 GitHub Secrets（只做一次）

进入 GitHub 仓库 → **Settings → Secrets and variables → Actions → New repository secret**，创建：

| 名称 | 填写内容 |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |
| `CLOUDFLARE_API_TOKEN` | 第 1 步创建的 API Token |
| `DASHBOARD_PASSWORD` | 统计后台登录密码；请使用强密码 |
| `SESSION_SIGNING_KEY` | 至少 32 字符的随机字符串，用于签署登录 Cookie |

可用密码管理器生成 `SESSION_SIGNING_KEY`。这四项均只保存在 GitHub/Cloudflare 的 Secret 存储中，不会写进代码。

## 3. 首次自动创建并绑定 D1（无需手动操作）

你已经删除旧数据库，因此**不要**在 Cloudflare Dashboard 手动创建 D1，也不要把任何 `database_id` 填入 `wrangler.jsonc`。

仓库当前的 [wrangler.jsonc](../wrangler.jsonc) 已声明：

```jsonc
"d1_databases": [
  { "binding": "DB", "database_name": "edge-track" }
]
```

其中 `binding: "DB"` 是 Worker 代码访问数据库的名称，`database_name: "edge-track"` 是要在 Cloudflare 中创建的数据库名称。它刻意没有 `database_id`。

首次 GitHub Actions 运行时，`Provision or update Worker binding` 会执行 `wrangler deploy --x-provision`。Wrangler 发现这个无 ID 的 D1 Binding 后，会自动：

1. 在 `CLOUDFLARE_ACCOUNT_ID` 对应的 Cloudflare 账户创建 `edge-track` D1 数据库。
2. 将该数据库绑定到 Worker 的 `DB` 变量。
3. 接下来让 `d1 migrations apply edge-track --remote` 自动建立全部表和索引。

Actions 成功后，可到 Cloudflare Dashboard → **Workers & Pages → D1 SQL Database** 确认出现 `edge-track`；再进入 Worker → **Settings → Bindings** 确认有 `DB` → `edge-track`。这是检查结果，不是需要预先手动配置的步骤。

## 4. 首次上线

确认 Secrets 已创建后，将当前项目推送到 `main`：

```bash
git add .
git commit -m "chore: initial EdgeTrack deployment"
git push origin main
```

打开 GitHub 仓库的 **Actions → Deploy EdgeTrack**。成功时会依次完成：

1. 安装依赖和 TypeScript 检查。
2. 自动创建并绑定名为 `edge-track` 的 D1 数据库（若不存在）。
3. 自动应用 `migrations/0001_init.sql`。
4. 将后台密码和会话密钥同步为 Worker Secret。
5. 发布 Worker。

在最后一个 `Synchronize Worker secrets and deploy` 步骤的日志中复制 `https://…workers.dev` 地址。该地址是你的线上 Worker 地址。

## 5. 线上验证

1. 打开 `https://<worker-domain>/dashboard`。
2. 输入 `DASHBOARD_PASSWORD`，确认能进入看板。
3. 将以下代码放进一个测试网页，把域名替换为实际 Worker 域名：

   ```html
   <script async src="https://<worker-domain>/tracker.js" data-site="test-site"></script>
   ```

4. 打开该测试网页并停留几秒；刷新或离开页面后回到看板。应看到访问量、IP、浏览器、操作系统与设备型号等汇总。

> 如页面设置了 CSP，请将 Worker 域名加入 `script-src` 与 `connect-src`。如设置了 `ALLOWED_ORIGINS`，也需把测试站点的 Origin 加入允许列表。

## 6. 本地开发与测试

仅第一次：

```bash
npm install
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars`，填写本地使用的 `DASHBOARD_PASSWORD` 和 `SESSION_SIGNING_KEY`。该文件已被 `.gitignore` 忽略。

日常启动：

```bash
npm run dev
```

此命令会自动应用本地未执行的迁移，并启动 `http://localhost:8787`。可通过：

- `http://localhost:8787/dashboard` 验证后台。
- `http://localhost:8787/tracker.js` 在本地测试网页中接入统计脚本。

提交前检查：

```bash
npm run check
```

## 7. 日常发布

完成本地验证后：

```bash
git add .
git commit -m "feat: your change"
git push origin main
```

等待 GitHub Actions 绿色通过，再访问线上 Worker 验证。无需本地执行 `wrangler deploy` 或远程数据库命令。

## 8. 数据库变更规则

每次数据库结构变更都新增一个迁移文件，编号递增，例如：

```text
migrations/0002_add_campaign.sql
```

```sql
ALTER TABLE visits ADD COLUMN campaign TEXT;
CREATE INDEX IF NOT EXISTS idx_visits_campaign ON visits(campaign);
```

迁移文件与对应代码一起推送。Actions 会只执行尚未应用过的迁移。

- 不要修改或删除已推送的迁移文件。
- 删除字段/表属于破坏性操作；先备份数据、审查 SQL，再提交迁移。
- 业务代码必须与迁移一起提交，避免线上 Worker 引用尚不存在的字段。

## 9. 常见故障

| 现象 | 检查方式 |
| --- | --- |
| Actions 认证失败 | 检查 Account ID、Token 是否属于同一账户，以及 Token 是否包含 Workers Scripts / Edit 与 D1 / Edit。 |
| D1 迁移失败 | 查看 Actions 的 `Apply unapplied D1 migrations` 日志；修复新迁移后新增一个后续迁移，不要改已应用文件。 |
| 看板登录失败 | 确认 GitHub Secret `DASHBOARD_PASSWORD` 已设置；重新推送可同步该 Secret。 |
| 网站没有统计数据 | 检查脚本 URL、浏览器控制台 CSP 错误、`data-site`、以及 Worker 域名是否在页面策略允许范围内。 |

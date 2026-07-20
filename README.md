# EdgeTrack

部署在 Cloudflare Workers + D1 的轻量访问统计后台。`/tracker.js` 可由任意网页远程引入；它会上报页面、来源域名、浏览器 UA、IP、语言、访问国家/城市（由 Cloudflare 提供）和停留时长。Worker 使用 `ua-parser-js` 解析并保存浏览器/版本、操作系统/版本、设备厂商、型号和类型。独立访客使用每个站点浏览器本地保存的匿名随机 ID 统计。

## 部署与开发

请直接按 [首次部署与开发手册](docs/DEPLOYMENT.md) 操作。它包含 Cloudflare Token、GitHub Secrets、首次上线、本地开发、线上验证、数据库迁移和排错步骤。

## 快速流程

### 一次性准备

```bash
npm install
cp .dev.vars.example .dev.vars
```

在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 添加 `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`、`DASHBOARD_PASSWORD`、`SESSION_SIGNING_KEY` 四个 Secret。详细权限和用途见下文。

### 每次开发

1. 本地启动（会自动应用尚未执行的本地 D1 迁移）：

   ```bash
   npm run dev
   ```

   打开命令输出中的 `http://localhost:8787/dashboard`，并以本地 `.dev.vars` 中的密码登录。测试站点将统计脚本地址换成 `http://localhost:8787/tracker.js`。

2. 修改代码后，本地确认：

   ```bash
   npm run check
   ```

3. 若涉及数据库，创建一个新的、递增编号的迁移文件，例如 `migrations/0002_add_campaign.sql`；不要修改已推送过的迁移文件。

4. 推送 GitHub：

   ```bash
   git add .
   git commit -m "feat: describe change"
   git push origin main
   ```

5. GitHub Actions 自动创建/连接 D1、应用未执行迁移、同步 Worker Secret 并上线。等待 Actions 绿色通过后，访问 `https://<你的 Worker 域名>/dashboard` 进行线上验证。

你已删除旧数据库，因此首次推送会自动创建并绑定新的 `edge-track` D1 数据库；不需要任何本地 Cloudflare 命令。

## 接入网站

把 Worker 域名替换为实际地址，并为每个网站使用不同的 `data-site`：

```html
<script async src="https://your-worker.workers.dev/tracker.js" data-site="my-website"></script>
```

访问 `https://your-worker.workers.dev/dashboard`，只需填写后台密码即可登录。登录后会展示所有 `data-site` 站点的总访问量、独立访客、站点数量、平均停留时长，以及按站点 ID、来源、页面、国家/地区和原始 IP 的汇总；浏览器会保留一个 8 小时的 `HttpOnly` 安全会话 Cookie，密码不会保存在浏览器、数据库或源码中。

独立访客由统计脚本在访问者浏览器的 `localStorage` 中生成并保存随机 UUID 后去重统计。同一 IP 下的不同浏览器或设备会获得不同 ID；用户清除网站数据、使用无痕模式、换浏览器或换设备时会被视为新访客。

## GitHub 自动部署

仓库已包含 [GitHub Actions 工作流](.github/workflows/deploy.yml)：每次推送到 `main`（或在 Actions 页面手动执行）都会依次进行 TypeScript 检查、确保 Worker/D1 绑定存在、自动执行全部未应用的 D1 迁移、同步 Secret 并部署 Worker。

在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 添加以下 Repository secrets：

- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账户 ID。
- `CLOUDFLARE_API_TOKEN`：仅授予此账户所需 Workers 与 D1 权限的 API Token。
- `DASHBOARD_PASSWORD`：后台登录密码。
- `SESSION_SIGNING_KEY`：一段长期随机密钥，用于签署登录会话。

工作流会安全地将 `DASHBOARD_PASSWORD` 与 `SESSION_SIGNING_KEY` 写入 Cloudflare Worker Secret，再部署代码；两者不会出现在仓库、部署日志或 `wrangler.jsonc` 中。之后只要把改动推送到 `main` 即会自动同步和上线。

### 今后修改数据库

不要改写已经推送过的迁移文件。需要新增、删除或修改字段时，在 `migrations/` 新增一个按顺序编号的 SQL 文件，例如 `0002_add_campaign.sql`：

```sql
ALTER TABLE visits ADD COLUMN campaign TEXT;
CREATE INDEX IF NOT EXISTS idx_visits_campaign ON visits(campaign);
```

将代码和该迁移文件一起推送到 `main` 即可。GitHub Actions 会只应用这个尚未执行过的迁移；无需手动运行数据库命令。对于破坏性操作（如删列或删表），请先确认数据备份与保留策略。

## 合规提示

IP 地址属于个人数据。请在被统计站点的隐私政策中说明其统计目的、数据项、访问权限、保留期限和退出方式，并按适用的 GDPR、PDPA 等法规取得所需同意。不要把此项目用于未经授权的跟踪。

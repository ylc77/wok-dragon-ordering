# Wok Dragon 餐馆官网 + 扫码点餐系统

这是一个面向餐馆、奶茶店、咖啡店和小吃店的线上点餐系统模板，包含餐馆官网、公开菜单、顾客扫码点餐、中文后台管理、POS 前台点单和 Windows 本地自动打印助手。

线上演示：

- Production: https://wok-dragon-ordering.vercel.app/

## 一、主要功能

- 餐馆官网首页
- 公开菜单 `/menu`
- 桌台二维码扫码点餐 `/table/:qrToken`
- 菜品口味选项和备注
- 同桌多人购物车同步
- 后台订单管理
- 后台菜单、分类、图片、桌台二维码管理
- POS 前台人工点单
- CSV 菜单导入 / 导出
- DeepSeek 菜单自动翻译
- 英文 / 希腊语前台，中文后台
- Windows 本地打印助手自动打印厨房小票

## 二、技术栈

| 模块 | 技术 |
| --- | --- |
| 前端 | React 19 + Vite 7 + TypeScript |
| 数据库 | Supabase PostgreSQL |
| 权限 | Supabase Auth + RLS + RPC |
| 图片 | Supabase Storage |
| 部署 | Vercel |
| 自动翻译 | DeepSeek API，可选 |
| 本地打印 | Windows print-agent |

## 三、快速开始

```bash
pnpm install
pnpm dev
```

环境变量：

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
DEEPSEEK_API_KEY=sk-xxx
```

`DEEPSEEK_API_KEY` 是可选项，只用于后台自动翻译。

不要把 `SUPABASE_SERVICE_ROLE_KEY` 放到前端或客户电脑。

## 四、新客户部署

新客户数据库初始化只执行：

```text
supabase/client-init.sql
```

不要执行：

```text
supabase/schema.sql
```

`schema.sql` 是 legacy 快照，不用于新客户部署。

详细部署见：

- [README_CLIENT_DATABASE.md](README_CLIENT_DATABASE.md)
- [docs/deploy-client-zh.md](docs/deploy-client-zh.md)
- [docs/client-install-checklist-zh.md](docs/client-install-checklist-zh.md)

老客户升级前必须先备份数据库，并按 `supabase/patches/README.md` 选择补丁执行，不要重新执行 `client-init.sql`。

## 五、本地打印助手

Windows 自动打印助手位于：

```text
print-agent/
```

客户部署推荐：

```powershell
pnpm print-agent -- --setup-ui
pnpm print-agent -- --test-print
pnpm print-agent
```

如需开机自启：

```powershell
pnpm print-agent -- --install-startup
```

说明：

- 打印助手优先读取 `print-agent/config.json`。
- 如果没有 `config.json`，才读取 `print-agent/.env`。
- `config.json` 和 `logs/` 是客户本地文件，不要提交到 Git。
- 厨房小票不是希腊税务正式发票，正式税务收据仍由餐馆原收银机或 POS 开具。

详细说明：

- [print-agent/README.md](print-agent/README.md)
- [docs/print-agent-client-guide-zh.md](docs/print-agent-client-guide-zh.md)
- [docs/print-agent-portable-package-zh.md](docs/print-agent-portable-package-zh.md)
- [docs/print-agent-windows-installer-zh.md](docs/print-agent-windows-installer-zh.md)

构建客户便携版：

```bash
npm run build:print-agent-package
```

生成目录：

```text
dist-print-agent/YANLCPrintAgent/
dist-print-agent/YANLCPrintAgent.zip
```

构建正式 Windows 安装包：

```bash
npm run build:print-agent-installer
npm run verify:print-agent-installer
```

生成：

```text
dist-print-agent/YANLCPrintAgentSetup.exe
```

## 六、商业交付文档

| 文档 | 用途 |
| --- | --- |
| [docs/commercial-delivery-zh.md](docs/commercial-delivery-zh.md) | 商业交付版 1.0 范围和边界 |
| [docs/client-handover-package-zh.md](docs/client-handover-package-zh.md) | 客户交付包目录 |
| [docs/client-install-checklist-zh.md](docs/client-install-checklist-zh.md) | 客户现场安装检查 |
| [docs/client-acceptance-form-zh.md](docs/client-acceptance-form-zh.md) | 客户验收确认单 |
| [docs/pre-launch-checklist-zh.md](docs/pre-launch-checklist-zh.md) | 上线前检查清单 |
| [docs/print-agent-client-guide-zh.md](docs/print-agent-client-guide-zh.md) | 打印助手客户使用指南 |
| [docs/print-agent-portable-package-zh.md](docs/print-agent-portable-package-zh.md) | 打印助手 Windows 便携版交付说明 |
| [docs/print-agent-windows-installer-zh.md](docs/print-agent-windows-installer-zh.md) | 打印助手 Windows 正式安装包说明 |
| [docs/client-guide-zh.md](docs/client-guide-zh.md) | 老板 / 员工后台操作指南 |
| [docs/maintenance-zh.md](docs/maintenance-zh.md) | 开发维护说明 |
| [docs/client-pricing-zh.md](docs/client-pricing-zh.md) | 报价和套餐参考 |
| [docs/sales-pitch-zh.md](docs/sales-pitch-zh.md) | 销售话术 |

## 七、常用命令

```bash
npm run typecheck
npm run build
npm test
npm run smoke
```

或使用 pnpm：

```bash
pnpm run typecheck
pnpm run build
pnpm test
pnpm run smoke
```

## 八、项目结构

```text
src/pages/       前台页面和后台页面
src/lib/         API、类型、本地化、图片、导入导出工具
api/             Vercel Serverless Functions
supabase/        新客户初始化 SQL、demo 数据、历史补丁
print-agent/     Windows 本地自动打印助手
docs/            部署、交付、维护和客户文档
scripts/         smoke test、录屏等辅助脚本
```

## 九、上线前提醒

- 新客户只执行 `supabase/client-init.sql`。
- 不要提交 `.env.local`、真实密钥、`print-agent/config.json` 或日志。
- 交付前必须真实手机扫码测试。
- 打印助手需要 Windows 电脑或 Windows 平板保持运行。
- 厨房小票不是税务发票。

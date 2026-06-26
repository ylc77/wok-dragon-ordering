# 餐馆官网 + 扫码点餐系统

React + Vite + TypeScript + Supabase 餐馆系统模板，可复制部署给不同餐馆客户。

- 餐馆官网首页（多语言）
- 菜单展示页
- 桌台二维码扫码点餐
- 共享购物车（Supabase Realtime 同步）
- 中文后台管理

## 线上地址

- Production: https://wok-dragon-ordering.vercel.app/

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19 + Vite 7 + TypeScript |
| 数据库 | Supabase (PostgreSQL + RLS + RPC) |
| 部署 | Vercel |
| 翻译 | DeepSeek API（后台可选） |
| 图片 | Supabase Storage + WebP 压缩 |

## 快速开始

```bash
pnpm install
pnpm dev
```

### 环境变量

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

## 新客户部署

见 [docs/deploy-client-zh.md](docs/deploy-client-zh.md)。

简要流程：
1. 新建 Supabase 项目 → 只执行 `supabase/client-init.sql`
2. 创建管理员账号
3. 部署 Vercel
4. 后台录入餐馆信息 + 菜单 + 桌台

`supabase/client-init.sql` 是新客户初始化的唯一权威文件，已包含表结构、RLS、RPC、Storage bucket/policy 和默认数据。`supabase/schema.sql` 仅为 legacy 快照，不要用于新客户部署。

补充说明：
- 普通菜单 CSV 支持 `is_sold_out` 和 `options` 字段，适合批量更新菜品基础信息；完整备份 CSV 用于迁移/恢复，包含更完整的数据关系和系统字段。
- POS 当前支持浏览器小票打印/打印提示；真实热敏打印机静默自动打印属于后续增强，需要本地 print-agent 配合。
- 老客户升级前必须先备份数据库，并按 `supabase/patches/README.md` 顺序执行补丁，不要重新执行 `client-init.sql`。

## 项目结构

```
src/pages/       # 前台: HomePage, MenuPage, TableOrderPage / 后台: AdminPage
src/lib/         # API, 类型, 多语言, 图片压缩, 数据导出
src/i18n.ts      # 三语资源 (el / en / zh)
api/             # Vercel Serverless Functions
supabase/        # client-init.sql（新客户唯一初始化）, demo-menu.sql, schema.sql（legacy 快照）, patches-archive/
docs/            # 部署指南, 操作指南, 维护说明
```

## 后台页面

| Tab | 功能 |
|-----|------|
| 仪表盘 | 今日订单/营收/桌台状态/热销菜品/30天统计 |
| 订单 | 查看/筛选/确认收款/打印/删除 |
| 菜品 | 新增/编辑/删除/批量操作/CSV导入导出/图片上传 |
| 分类 | 新增/编辑/删除 |
| 桌台 | 管理桌号和二维码/清桌 |
| 餐馆 | 多语言信息/Logo/Hero/联系方式/外卖平台/付款方式 |
| 系统 | 健康检查/数据备份 |

## 业务规则

- 前台支持英语/希腊语，后台固定中文
- 菜单和餐馆信息全部来自 Supabase，不写死
- 桌台二维码固定，session 动态生成
- 清桌后旧 session 失效，新扫码自动创建新 session
- 所有删除操作需二级密码
- 菜品图片自动压缩为 WebP

## 文档

| 文件 | 说明 |
|------|------|
| [docs/deploy-client-zh.md](docs/deploy-client-zh.md) | 新客户部署步骤 |
| [docs/client-guide-zh.md](docs/client-guide-zh.md) | 餐馆老板操作指南 |
| [docs/maintenance-zh.md](docs/maintenance-zh.md) | 开发者维护说明 |
| [README_CLIENT_DATABASE.md](README_CLIENT_DATABASE.md) | 数据库部署英文指南 |

## Build

```bash
pnpm build
```

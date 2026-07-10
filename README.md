# 餐馆官网 + 扫码点餐系统模板

这是一个面向餐馆、奶茶店、咖啡店、小吃店和快餐店的线上点餐系统模板，包含餐馆官网、公开菜单、顾客扫码点餐、中文后台、前台 POS 点单、菜单管理、桌台二维码管理、多语言菜单、厨房小票打印助手和客户交付文档。

线上演示：

- Production: deploy this template to the customer's own Vercel domain before sharing it.

## 一、系统包含什么

### 顾客前台

- 餐馆官网首页 `/`
- 公开菜单 `/menu`
- 顾客扫码点餐 `/table/:qrToken`
- 英文 / 希腊语前台显示
- 菜品分类、菜品图片、价格、描述、售罄状态
- 菜品口味选项，例如辣度、加料、饮料温度、特殊要求
- 同桌多人购物车同步
- 提交订单、请求结账、清桌后结束页
- 基础法律页面：Privacy Policy、Terms of Service、Cookie Policy、Contact、Cancellation Policy

### 餐馆后台

- 后台登录 `/admin`
- 订单管理、订单状态、收款确认、清桌
- 菜单分类管理
- 菜品新增、编辑、上架、下架、售罄、隐藏
- 菜品图片上传到 Supabase Storage
- CSV 菜单导入 / 导出
- DeepSeek 自动翻译和 AI 菜单内容补全
- OpenAI 菜品图片生成接口预留
- 桌台管理、二维码下载、二维码重生成
- POS 前台人工点单
- 厨房小票浏览器打印预览
- 系统设置、品牌外观、数据备份

### 后端和部署

- Supabase PostgreSQL 数据库
- Supabase Auth 管理员 / 员工登录
- Supabase RLS 权限策略
- Supabase RPC 点餐、购物车、订单、清桌、二维码等业务函数
- Supabase Storage 菜品图片 bucket
- Vercel 静态前端部署
- Vercel Serverless Functions 用于 AI、健康检查和供应商功能控制
- Windows 本地打印助手，用于自动打印厨房小票

## 二、技术栈

| 模块 | 技术 |
| --- | --- |
| 前端 | React 19 + Vite 7 + TypeScript |
| 路由 | react-router-dom |
| 数据库 | Supabase PostgreSQL |
| 权限 | Supabase Auth + RLS + RPC |
| 图片 | Supabase Storage |
| 部署 | Vercel |
| AI 文本 | DeepSeek API，可选 |
| AI 图片 | OpenAI API，可选 |
| 本地打印 | Windows print-agent |

## 三、本地开发

推荐使用 pnpm：

```bash
pnpm install
pnpm dev
```

也可以使用 npm：

```bash
npm install
npm run dev
```

常用检查命令：

```bash
npm run typecheck
npm run build
npm test
npm run smoke
```

## 四、新客户部署总流程

新客户从零部署建议按这个顺序做：

1. 创建新的 Supabase 项目。
2. 在 Supabase SQL Editor 执行 `supabase/client-init.sql`。
3. 可选：执行 `supabase/demo-menu.sql` 导入演示菜单。
4. 创建后台管理员账号。
5. 把项目部署到 Vercel。
6. 在 Vercel 配置环境变量。
7. 登录后台填写餐馆信息、菜单、桌台和二维码。
8. 真实手机扫码测试点餐流程。
9. 如需自动出厨房小票，安装 Windows 本地打印助手。
10. 绑定客户域名并完成上线验收。

重要：新客户只执行 `supabase/client-init.sql`。不要执行 `supabase/schema.sql`，它只是 legacy 快照，不用于新客户部署。

## 五、Supabase 新客户部署

### 1. 创建 Supabase 项目

1. 打开 [Supabase](https://supabase.com)。
2. 登录账号后点击 **New project**。
3. 项目名建议使用客户名，例如 `restaurant-client-name`。
4. 设置数据库密码，并保存到安全位置。
5. 区域建议选择离希腊较近的区域，例如 Frankfurt 或 London。
6. 等待项目创建完成。

建议每个客户使用独立 Supabase 项目，避免不同客户数据混在一起。

### 2. 初始化数据库

在 Supabase Dashboard：

1. 打开 **SQL Editor**。
2. 新建 query。
3. 打开本仓库的 `supabase/client-init.sql`。
4. 全选复制 SQL 内容到 SQL Editor。
5. 点击 **Run**。
6. 等待执行完成，确认没有关键错误。

`supabase/client-init.sql` 已包含：

- 核心表结构
- RLS policy
- RPC 函数
- Storage bucket 和 policy
- 默认餐馆设置
- 默认桌台 / 菜单基础数据
- 必要索引和约束
- 功能版本字段 `plan_tier` / `feature_flags`

不要执行：

```text
supabase/schema.sql
```

`schema.sql` 是 legacy 文件，只用于历史参考。

### 3. 可选：导入演示菜单

如果需要先给客户演示效果，可以在 `client-init.sql` 执行成功后，再执行：

```text
supabase/demo-menu.sql
```

正式客户上线时不一定需要演示菜单，可以直接在后台录入真实菜单，或使用 CSV 导入。

### 4. 检查 Storage

初始化 SQL 会创建菜品图片 bucket：

```text
menu-images
```

上线前确认：

- `menu-images` 可以公开读取，前台能显示菜品图片。
- 上传、更新、删除图片只允许 staff/admin。
- 普通顾客不能上传、修改或删除图片。

Supabase 官方也强调：暴露给 API 的表应启用 RLS，service role / secret key 不能放到前端。参考官方文档：

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase secure data](https://supabase.com/docs/guides/database/secure-data)

### 5. 创建后台管理员

#### 创建 Auth 用户

在 Supabase Dashboard：

1. 打开 **Authentication**。
2. 进入 **Users**。
3. 点击 **Add user**。
4. 输入后台邮箱和密码。
5. 勾选 **Auto Confirm User**。
6. 创建用户。

#### 设置管理员角色

复制新用户的 UUID，在 SQL Editor 执行：

```sql
insert into public.profiles (id, role, display_name)
values ('USER_UUID', 'admin', '管理员')
on conflict (id) do update
set role = excluded.role,
    display_name = excluded.display_name;
```

如果是普通员工，把 `role` 改成 `staff`。

### 6. 设置后台归档确认密码

后台订单归档、菜品隐藏、分类归档等危险操作可以设置二次确认密码。管理员登录后可以在后台设置，也可以在 SQL Editor 执行：

```sql
select public.admin_set_delete_password('你的确认密码');
```

不要把这个密码写进 README、代码或 Git。

## 六、Vercel 部署

### 1. 导入项目

1. 打开 [Vercel](https://vercel.com)。
2. 点击 **Add New** → **Project**。
3. 选择 GitHub 仓库。
4. Framework Preset 选择 Vite，通常 Vercel 会自动识别。
5. Build Command 使用：

```bash
npm run build
```

6. Output Directory 使用：

```text
dist
```

Vercel 对 Vite 项目有官方支持，GitHub 连接后会自动为每次 push 创建部署。参考：

- [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel Git deployments](https://vercel.com/docs/git)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)

### 2. 配置 Vercel 环境变量

必填：

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
```

建议显式配置：

```env
VITE_ENABLE_SUPABASE_IMAGE_TRANSFORM=false
```

可选 AI 功能：

```env
DEEPSEEK_API_KEY=
OPENAI_API_KEY=
```

供应商功能版本控制，可选但建议你自己交付客户时配置：

```env
VENDOR_SETTINGS_PASSWORD=
SUPABASE_SERVICE_ROLE_KEY=
```

说明：

- `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY` 会进入前端浏览器，可以公开使用，但仍要依赖 RLS 保护数据。
- `SUPABASE_SERVICE_ROLE_KEY` 只能放在 Vercel 服务端环境变量，不能加 `VITE_` 前缀，不能放到前端，不能放到客户电脑。
- `VENDOR_SETTINGS_PASSWORD` 用于访问隐藏的供应商配置页 `/settings`。
- `DEEPSEEK_API_KEY` 用于后台自动翻译和 AI 菜单内容补全。
- `OPENAI_API_KEY` 用于后台 AI 菜品图片生成。没有配置时不会影响普通菜单管理。

### 3. Vercel 路由配置

项目已包含 `vercel.json`：

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

这个配置用于支持 React SPA 路由，确保 `/menu`、`/admin`、`/table/:qrToken`、`/settings` 直接刷新时不会 404。

### 4. 首次部署后检查

部署完成后检查：

- `/` 首页能打开。
- `/menu` 公开菜单能打开。
- `/admin` 登录页能打开。
- `/table/:qrToken` 手机扫码页能打开。
- `/settings` 能打开供应商配置登录页，但不会出现在普通导航里。

## 七、后台初始化配置

登录 `/admin` 后，建议按顺序配置：

### 1. 餐馆设置

- 餐馆名称：中文 / 英文 / 希腊语
- 地址：中文 / 英文 / 希腊语
- 电话
- 营业时间
- Logo
- 首页 Hero 图片
- WhatsApp / Instagram / Google Maps
- Wolt / efood / Box 等外卖链接
- 支持的付款方式
- 品牌主色、网页标题、favicon
- 法律页面所需的商家信息

### 2. 菜单分类

- 创建分类名称：中文 / 英文 / 希腊语
- 设置排序
- 启用或停用分类
- 分类归档后前台不再显示

### 3. 菜品管理

- 添加菜品名称、描述、价格、分类、图片
- 设置上架 / 下架 / 售罄
- 设置口味选项，例如辣度、特殊要求、饮料温度
- 可使用 AI 补全描述和翻译
- 可使用 CSV 批量导入

普通菜单 CSV 支持：

- `sku`
- `name_zh`
- `name_en`
- `name_el`
- `description_zh`
- `description_en`
- `description_el`
- `category`
- `price`
- `image_url`
- `is_available`
- `is_sold_out`
- `options`
- `sort_order`

说明：

- 普通菜单 CSV 用于批量新增 / 更新菜单，不是完整系统备份。
- `options` 必须是合法 JSON 字符串。
- 空字段不会随便清空已有图片、翻译、售罄状态或口味选项。
- 完整备份请使用后台系统设置里的备份导出。

### 4. 桌台和二维码

- 创建桌台。
- 下载每个桌台二维码。
- 打印二维码并贴到对应桌面。
- 如果重生成二维码，旧二维码会失效。
- 禁用桌台后，旧二维码不能继续点餐。

### 5. POS 前台点单

- 支持堂食 / 外带。
- 支持选择桌号。
- 支持现金 / POS / 刷卡 / 未付款记录。
- 提交成功后显示下一步操作和小票打印预览。
- 浏览器打印需要人工确认，真正自动打印请使用本地打印助手。

## 八、供应商功能版本控制

隐藏入口：

```text
/settings
```

用途：

- 给不同客户版本开启 / 关闭功能。
- 例如扫码点餐、POS、CSV、AI、图片生成、数据备份、打印助手等。
- 普通客户后台不会显示这个入口。

使用条件：

- Vercel 环境变量已配置 `VENDOR_SETTINGS_PASSWORD`。
- Vercel 环境变量已配置 `SUPABASE_SERVICE_ROLE_KEY`。
- `SUPABASE_SERVICE_ROLE_KEY` 只存在 Vercel 服务端，绝不能放到前端或客户电脑。

详细说明见：

- [docs/vendor-feature-control-zh.md](docs/vendor-feature-control-zh.md)

## 九、Windows 本地打印助手

如果客户需要厨房自动出单，需要安装 Windows 本地打印助手。它独立于网页运行，监听 Supabase 新订单，自动打印厨房小票，并标记订单已打印，避免重复出纸。

支持方式：

- Windows 电脑
- Windows 平板
- 已安装系统驱动的 USB / 网口热敏打印机
- 58mm / 80mm 小票纸

不支持或不承诺：

- iPad 全自动打印
- 安卓收银机全自动打印
- 蓝牙打印机深度兼容
- 希腊税务正式发票

厨房小票不是希腊税务正式发票。正式税务收据仍由餐馆原收银机、税控 POS 或合法税务系统开具。

### 开发模式运行

```bash
pnpm print-agent -- --setup
pnpm print-agent -- --test-print
pnpm print-agent
```

### 构建便携版

```bash
npm run build:print-agent-package
npm run verify:print-agent-package
```

输出：

```text
dist-print-agent/YANLCPrintAgent/
dist-print-agent/YANLCPrintAgent.zip
```

### 构建 Windows 安装包

```bash
npm run build:print-agent-installer
npm run verify:print-agent-installer
```

输出：

```text
dist-print-agent/YANLCPrintAgentSetup.exe
```

打印助手文档：

- [print-agent/README.md](print-agent/README.md)
- [docs/print-agent-client-guide-zh.md](docs/print-agent-client-guide-zh.md)
- [docs/print-agent-portable-package-zh.md](docs/print-agent-portable-package-zh.md)
- [docs/print-agent-windows-installer-zh.md](docs/print-agent-windows-installer-zh.md)

## 十、客户域名绑定

在 Vercel：

1. 打开项目设置。
2. 进入 **Domains**。
3. 添加客户域名，例如 `restaurant.gr`。
4. 按 Vercel 提示配置 DNS。
5. 等待 SSL 证书自动签发。
6. 测试首页、菜单、后台和扫码点餐链接。

绑定域名后，建议重新下载 / 打印桌台二维码，确保二维码指向正式域名。

## 十一、上线前验收清单

### 技术检查

- [ ] `npm run typecheck` 通过
- [ ] `npm run build` 通过
- [ ] `npm test` 通过
- [ ] `npm run smoke` 通过
- [ ] Vercel 部署成功
- [ ] Vercel 环境变量完整
- [ ] Supabase `client-init.sql` 执行成功
- [ ] Supabase Storage 图片上传正常
- [ ] RLS / RPC 没有明显报错

### 前台检查

- [ ] 首页显示餐馆名称、地址、电话、营业时间
- [ ] `/menu` 菜单显示正常
- [ ] 英文 / 希腊语切换正常
- [ ] 菜品图片 fallback 正常
- [ ] 手机端没有横向滚动
- [ ] 桌码页 `/table/:qrToken` 能进入点餐
- [ ] 加菜、口味选择、购物车、提交订单正常
- [ ] 清桌后旧顾客不能继续向旧 session 下单

### 后台检查

- [ ] 管理员可以登录
- [ ] 订单列表能看到新订单
- [ ] 确认收款正常
- [ ] 清桌正常
- [ ] 菜单新增 / 编辑 / 隐藏正常
- [ ] 分类新增 / 编辑 / 归档正常
- [ ] 桌台新增 / 删除 / 二维码下载正常
- [ ] CSV 导入 / 导出正常
- [ ] AI 功能未配置 key 时有清晰提示
- [ ] POS 点单正常

### 打印助手检查

- [ ] Windows 打印机驱动安装完成
- [ ] Windows 测试页能打印
- [ ] 打印助手 setup 完成
- [ ] 测试小票能打印
- [ ] 新订单能自动打印厨房小票
- [ ] 打印失败不会标记为已打印，下一轮会重试
- [ ] 如需开机自启，已配置成功

## 十二、项目目录

```text
src/pages/       前台页面和后台页面
src/components/  通用组件
src/lib/         API、类型、本地化、图片、导入导出工具
src/styles/      分层样式
api/             Vercel Serverless Functions
supabase/        新客户初始化 SQL、demo 数据、legacy SQL
print-agent/     Windows 本地自动打印助手
docs/            部署、交付、维护和客户文档
scripts/         smoke test、录屏、打包、检查脚本
```

## 十三、交付文档

| 文档 | 用途 |
| --- | --- |
| [README_CLIENT_DATABASE.md](README_CLIENT_DATABASE.md) | 新客户数据库部署说明 |
| [docs/deploy-client-zh.md](docs/deploy-client-zh.md) | 新客户部署步骤 |
| [docs/client-install-checklist-zh.md](docs/client-install-checklist-zh.md) | 客户现场安装检查 |
| [docs/commercial-delivery-zh.md](docs/commercial-delivery-zh.md) | 商业交付范围说明 |
| [docs/client-handover-package-zh.md](docs/client-handover-package-zh.md) | 客户交付包目录 |
| [docs/pre-launch-checklist-zh.md](docs/pre-launch-checklist-zh.md) | 上线前检查清单 |
| [docs/client-guide-zh.md](docs/client-guide-zh.md) | 老板 / 员工后台操作指南 |
| [docs/maintenance-zh.md](docs/maintenance-zh.md) | 开发维护说明 |
| [docs/vendor-feature-control-zh.md](docs/vendor-feature-control-zh.md) | 供应商功能版本控制 |
| [CLIENT_LEGAL_CHECKLIST.md](CLIENT_LEGAL_CHECKLIST.md) | 客户法律页面信息确认 |

## 十四、安全和交付注意事项

- 不要提交 `.env.local`。
- 不要提交真实密钥。
- 不要提交 `print-agent/config.json`。
- 不要提交打印日志。
- 不要把 `SUPABASE_SERVICE_ROLE_KEY` 放到前端或客户电脑。
- 不要让普通客户执行 `supabase/schema.sql`。
- 新客户只执行 `supabase/client-init.sql`。
- 当前项目没有真实老客户时，不需要执行升级 patch。
- 后续如果已有真实客户数据库，升级前必须先备份数据库，再写独立 patch。
- 厨房小票不是正式税务发票。

## 十五、推荐的新客户交付顺序

1. 确认客户版本和需要开启的功能。
2. 创建客户 Supabase 项目。
3. 执行 `supabase/client-init.sql`。
4. 创建管理员账号。
5. 部署 Vercel 并配置环境变量。
6. 用 `/settings` 设置客户功能版本。
7. 登录 `/admin` 填写餐馆信息。
8. 导入或录入菜单。
9. 设置桌台并下载二维码。
10. 手机扫码测试点餐。
11. 测试后台订单、收款、清桌。
12. 如需要，安装 Windows 打印助手。
13. 绑定客户域名。
14. 完成客户验收。

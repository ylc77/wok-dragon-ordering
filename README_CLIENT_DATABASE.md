# 新客户数据库部署指南

本文档用于给新餐馆客户部署独立 Supabase 数据库。新客户只执行 `supabase/client-init.sql`，不要执行旧的 `supabase/schema.sql`。

## 一、创建 Supabase 项目

1. 打开 [Supabase](https://supabase.com)，登录账号。
2. 点击 **New project**。
3. 填写项目名称，例如 `wok-dragon-client-xxx`。
4. 设置数据库密码，并妥善保存。
5. 选择离希腊较近的区域，例如 Frankfurt 或 London。
6. 等待项目创建完成。

建议每个客户使用独立 Supabase 项目，避免不同客户的数据混在一起。

## 二、初始化数据库

1. 进入 Supabase Dashboard。
2. 打开 **SQL Editor**。
3. 新建 query。
4. 打开本仓库的 `supabase/client-init.sql`。
5. 全选复制到 Supabase SQL Editor。
6. 点击 **Run**。
7. 等待执行完成，并确认没有关键错误。

重要说明：

- `supabase/client-init.sql` 是新客户初始化的唯一权威 SQL 文件。
- 它包含表结构、RLS、RPC、Storage bucket / policy、默认数据和必要索引。
- `supabase/schema.sql` 是 legacy 快照，不用于新客户部署。
- 新客户不需要逐个执行 `supabase/patches-archive/` 里的历史补丁。
- 老客户升级不要重新执行 `client-init.sql`，应先备份数据库，再按 `supabase/patches/README.md` 执行缺失补丁。

## 三、确认 Storage

初始化 SQL 会创建项目需要的 Storage bucket 和 policy。

上线前确认：

- `menu-images` 可公开读取，前台能显示菜品图片。
- 图片上传、修改、删除只允许后台 staff/admin 或服务端受控路径。
- 普通顾客不能上传、修改或删除菜单图片。
- 如果使用店铺 Logo、Hero 图等资源，确认对应 bucket 或 URL 能正常访问。

## 四、创建后台管理员账号

### 1. 创建 Auth 用户

在 Supabase Dashboard 中：

1. 打开 **Authentication**。
2. 进入 **Users**。
3. 点击 **Add user**。
4. 输入后台邮箱和密码。
5. 勾选 **Auto Confirm User**。
6. 创建用户。

### 2. 设置管理员角色

复制新用户的 UUID，在 SQL Editor 中执行：

```sql
insert into public.profiles (id, role, display_name)
values ('USER_UUID', 'admin', '管理员')
on conflict (id) do update
set role = excluded.role,
    display_name = excluded.display_name;
```

如果是普通员工，可以把 `role` 改成 `staff`。

### 3. 设置私有删除确认密码

如果客户需要后台归档 / 隐藏操作的二次确认密码，在 SQL Editor 中执行：

```sql
insert into private.admin_settings (key, value)
values ('delete_password', extensions.crypt('你的删除确认密码', extensions.gen_salt('bf')))
on conflict (key) do update set value = excluded.value;
```

## 五、部署到 Vercel

1. 打开 [Vercel](https://vercel.com)。
2. 导入 GitHub 仓库 `ylc77/wok-dragon-ordering`。
3. 配置环境变量。

必填：

```text
VITE_SUPABASE_URL=https://你的项目ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=你的 Supabase publishable key
```

可选：

```text
DEEPSEEK_API_KEY=sk-xxx
OPENAI_API_KEY=sk-xxx
```

说明：

- `DEEPSEEK_API_KEY` 只用于后台菜单自动翻译、AI 补全菜单内容和生成图片提示词。
- `OPENAI_API_KEY` 只用于后台 AI 生成菜品图片，可后续再配置。
- 不要在 Vercel 配置 `SUPABASE_SERVICE_ROLE_KEY`。
- 不要把 service role key 放到前端或客户电脑。

## 六、后台基础配置

登录 `/admin` 后，按顺序配置：

### 1. 餐馆设置

- 餐馆名称：中文 / 英文 / 希腊语
- 地址：中文 / 英文 / 希腊语
- 电话
- 营业时间
- Logo
- 首页图片
- WhatsApp / Instagram / Google Maps 链接
- Wolt / efood / Box 等外卖链接

### 2. 菜单分类

- 添加分类名称：中文 / 英文 / 希腊语
- 设置排序
- 启用或停用分类

### 3. 菜品

- 添加菜品名称、描述、价格、图片
- 设置分类、排序
- 设置上架 / 下架 / 售罄
- 设置口味选项，例如辣度、加料、饮料温度
- 可使用 CSV 批量导入

普通菜单 CSV 支持：

- 多语言名称和描述
- 分类
- 价格
- 图片 URL
- 上架状态
- 售罄状态 `is_sold_out`
- 口味选项 `options`

说明：

- 普通菜单 CSV 用于菜单批量导入 / 更新，不等同于完整系统备份。
- 完整备份应使用后台系统设置里的备份导出功能。

### 4. 桌台和二维码

- 添加或确认桌台数量
- 下载每个桌台二维码
- 打印二维码并贴到对应桌面
- 如果重生成二维码，旧二维码会失效

## 七、本地打印助手

如果客户需要厨房自动出单，安装 Windows 本地打印助手。

简化流程：

```powershell
pnpm print-agent -- --setup
pnpm print-agent -- --test-print
pnpm print-agent
```

如需开机自启：

```powershell
pnpm print-agent -- --install-startup
```

详细说明见：

- `docs/print-agent-client-guide-zh.md`
- `print-agent/README.md`

重要说明：

- 厨房小票不是希腊税务正式发票。
- 正式税务收据仍由餐馆原收银机、税控 POS 或合法税务系统开具。

## 八、上线前检查清单

部署完成后逐项检查：

- [ ] `npm run typecheck` 通过
- [ ] `npm run build` 通过
- [ ] `npm test` 通过
- [ ] `npm run smoke` 通过
- [ ] Supabase `client-init.sql` 执行成功
- [ ] Vercel 环境变量配置正确
- [ ] 后台管理员可以登录
- [ ] 首页显示餐馆信息
- [ ] `/menu` 显示公开菜单
- [ ] 手机扫码进入 `/table/:qrToken`
- [ ] 顾客可以加菜、选择口味、提交订单
- [ ] 后台可以看到新订单
- [ ] POS 前台点单可以创建订单
- [ ] 后台确认收款正常
- [ ] 清桌后旧顾客不能继续向旧 session 下单
- [ ] 本地打印助手可以测试打印
- [ ] 英文 / 希腊语切换正常
- [ ] 菜品图片 fallback 正常

## 九、常见注意事项

- 每个客户建议独立 Supabase 项目。
- 定期导出数据备份。
- 不要提交 `.env.local`、`print-agent/config.json`、`print-agent/logs/`。
- 老客户升级前必须先备份数据库。
- 老客户不要重新执行 `supabase/client-init.sql`。
- 如果客户需要正式支付、税务发票或多打印机分流，应作为专业版定制评估。

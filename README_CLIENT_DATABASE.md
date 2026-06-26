# 新客户数据库部署指南

## 1. 创建 Supabase 项目

1. 打开 https://supabase.com，登录你的账号
2. 点击 **New project**
3. 填写项目名称（例如 `wok-dragon-client2`）
4. 设置数据库密码（记下来，后续可能需要）
5. 选择区域（建议 `Frankfurt` 或 `London`，离希腊近）
6. 等待项目创建完成（约 2 分钟）

## 2. 初始化数据库

1. 进入 Supabase Dashboard → **SQL Editor**
2. 点击 **New query**
3. 打开本仓库的 `supabase/client-init.sql`，全选复制
4. 粘贴到 SQL Editor，点击 **Run**
5. 等待执行完成，确认没有报错

> `supabase/client-init.sql` 是新客户初始化的唯一权威文件，已经包含完整表结构、RLS、RPC、Storage bucket/policy 和默认数据。不要执行 `supabase/schema.sql`，它只是 legacy 快照。

> 如果报错，检查是否有 `alter publication supabase_realtime drop table public.restaurant_settings` 报错，这是正常的（新项目还没有这个表在 Realtime 中），忽略即可。

## 3. 创建管理员账号

### 3.1 通过 Supabase Dashboard 创建

1. 进入 **Authentication** → **Users** → **Add user**
2. 输入邮箱和密码
3. 勾选 **Auto Confirm User**（不需要邮件验证）
4. 点击 **Create user**

### 3.2 设置管理员角色

在 SQL Editor 执行（替换 `USER_UUID` 为上面创建的用户 ID）：

```sql
insert into public.profiles (id, role, display_name)
values ('USER_UUID', 'admin', '管理员');
```

### 3.3 设置删除密码

```sql
insert into private.admin_settings (key, value)
values ('delete_password', extensions.crypt('你的密码', extensions.gen_salt('bf')))
on conflict (key) do update set value = excluded.value;
```

## 4. 部署前端到 Vercel

### 4.1 新建 Vercel 项目

1. 打开 https://vercel.com
2. 点击 **Add New** → **Project**
3. 导入 GitHub 仓库 `ylc77/wok-dragon-ordering`
4. 在 **Environment Variables** 中设置：

```
VITE_SUPABASE_URL=https://你的项目ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=你的 anon key（在 Supabase → Settings → API 中找到）
DEEPSEEK_API_KEY=sk-xxx（可选，用于菜单自动翻译）
```

5. 点击 **Deploy**

## 5. 客户上线前需要手动配置

以下数据需要在后台管理页面逐项录入：

### 餐馆信息（/admin → 餐馆）
- 三语言餐馆名称
- 地址（中文/英文/希腊文）
- 营业时间
- Logo 图片链接
- 首页主图链接
- 电话
- WhatsApp / Instagram / Google Maps 链接
- Wolt / efood / Box 外卖链接
- 付款方式（刷卡 / 现金）

### 菜单（/admin → 菜品 + 分类）
- 创建菜单分类（热菜、冷菜、饮品等）
- 添加菜品（名称、价格、描述）— 三语言
- 上传菜品图片
- 设置菜品状态（上架/下架/售罄）

> 可选：使用 CSV 批量导入。在菜品管理页点击「模板」下载模板，填好后「导入」。
> 普通菜单 CSV 支持 `is_sold_out` 和 `options` 字段；空字段不会覆盖已有售罄状态或口味选项。普通菜单 CSV 只用于菜单批量导入/导出，不等同于系统完整备份。完整备份 CSV 请在后台「系统设置」导出，适合迁移、审计或恢复。

### 桌台（/admin → 桌台）
- 确认桌台数量和桌号
- 下载每个桌台的二维码，打印张贴到对应桌面

## 6. 验证清单

客户正式使用前，逐项验证：

- [ ] 前台首页正常显示餐馆信息
- [ ] /menu 页面显示菜品和分类
- [ ] 扫码进入 /table/xxx 显示点餐界面
- [ ] 加入桌台 → 加菜 → 提交订单
- [ ] 多设备共享购物车（用两部手机测试同一桌）
- [ ] 请求结账 → 后台确认收款
- [ ] 厨房打印小票
- [ ] POS 浏览器小票打印/重新打印提示正常；真实热敏打印机静默自动打印需要后续接入本地 print-agent
- [ ] 清桌后新顾客可扫码进入新会话
- [ ] 后台所有功能正常（菜品管理、订单管理、桌台管理、数据备份等）

## 7. 环境变量参考

| 变量 | 说明 |
|------|------|
| `VITE_SUPABASE_URL` | Supabase 项目 URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase 匿名公钥（不是 service_role key） |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥（可选，用于后台自动翻译菜单） |

## 8. 注意事项

- **不要**在 Vercel 环境变量中设置 `SUPABASE_SERVICE_ROLE_KEY`，service_role key 永远不要出现在前端环境
- `delete_password` 通过数据库直接设置，不在后台 UI 暴露
- 每个客户的 Supabase 项目独立，数据不互通
- 定期在后台系统设置页导出数据备份
- 老客户升级前先备份数据库，并按 `supabase/patches/README.md` 顺序执行补丁；不要对已有客户重新执行 `supabase/client-init.sql`
- Supabase 免费套餐有 500MB 数据库限制，如果数据量大需升级

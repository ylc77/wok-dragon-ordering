# 新客户部署指南

> ⚡ **10 分钟快启**：创建 Supabase → 执行 SQL → 部署 Vercel → 填品牌信息 → 上线

## 一、新建 Supabase 项目

1. 打开 https://supabase.com，登录你的账号
2. 点击 **New project**
3. 填写项目名称（例如 `restaurant-client-name`）
4. 设置数据库密码（记下来）
5. 选择区域（建议 Frankfurt 或 London，离希腊近）
6. 点击 **Create project**，等待 2 分钟

## 二、初始化数据库

1. 进入 Supabase Dashboard → **SQL Editor** → **New query**
2. 打开本仓库 `supabase/client-init.sql`，全选复制粘贴到 SQL Editor
3. 点击 **Run**，等待执行完成
4. 确认没有报错

> 如果报错 `publication supabase_realtime drop table restaurant_settings` 之类的，忽略即可——新项目还没有这个表在 Realtime 中。

## 三、可选：导入演示菜单

如果需要演示数据来展示效果，再执行：

1. 打开 `supabase/demo-menu.sql`，全选复制粘贴到 SQL Editor
2. 点击 **Run**

> 正式客户不需要执行此文件。

## 四、检查数据库

在 SQL Editor 执行以下检查：

```sql
-- 检查表是否存在
select table_name from information_schema.tables where table_schema = 'public' order by table_name;

-- 检查 Storage bucket
select * from storage.buckets;
```

应该能看到这些表：
- `profiles`
- `restaurant_settings`
- `menu_categories`
- `menu_items`
- `restaurant_tables`
- `table_sessions`
- `table_session_participants`
- `cart_items`
- `orders`
- `order_items`
- `bill_requests`
- `table_reentry_requests`
- `audit_logs`

Storage bucket应该有 `menu-images`。

## 五、创建管理员账号

### 5.1 通过 Supabase Dashboard

1. 进入 **Authentication** → **Users** → **Add user**
2. 输入邮箱和密码
3. 勾选 **Auto Confirm User**
4. 点击 **Create user**

### 5.2 设置管理员角色

在 SQL Editor 执行（替换 `USER_UUID` 为上一步创建的用户 ID）：

```sql
insert into public.profiles (id, role, display_name) values ('USER_UUID', 'admin', '管理员');
```

### 5.3 设置删除密码

```sql
update public.restaurant_settings
set delete_password = extensions.crypt('你的密码', extensions.gen_salt('bf'));
```

## 六、部署前端到 Vercel

### 6.1 新建项目

1. 打开 https://vercel.com
2. 点击 **Add New** → **Project**
3. 导入 GitHub 仓库（Fork 或直接导入）
4. 参考 `.env.template` 设置 **Environment Variables**：

```
VITE_SUPABASE_URL=https://你的项目ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=你的 anon key
DEEPSEEK_API_KEY=sk-xxx（可选，用于菜单自动翻译）
```

5. 点击 **Deploy**

## 七、配置餐馆信息

登录后台 `/admin` → **餐馆信息**：

1. 填写三语言餐馆名称
2. 填写地址（中/英/希）
3. 填写营业时间
4. 上传 Logo 和首页 Hero 图
5. 填写电话、WhatsApp、Instagram、Google Maps 链接
6. 填写 Wolt / efood / Box 外卖链接（可选）
7. 设置付款方式（现金 / POS）
8. 点击保存

## 八、管理桌台

进入 `/admin` → **桌台**：

1. 确认桌台数量和桌号
2. 下载每个桌台的二维码
3. 打印二维码张贴到对应桌面

## 九、录入菜单

进入 `/admin` → **菜品分类** → 创建分类（如：前菜、主菜、饮品等）

进入 `/admin` → **菜品管理** → 添加菜品：

- 填写三语言名称和描述
- 设置价格
- 上传菜品图片
- 设置上架状态

> 也可使用 CSV 批量导入：点击「模板」下载 CSV 模板，填好后「导入」。

## 十、测试

### 顾客端

1. 用手机扫描桌台二维码 → 进入点餐页面
2. 选择菜品 → 加入购物车
3. 点击结账 → 选择现金或刷卡 → 确认
4. 检查后台是否出现新订单

### 后台

1. 订单页面确认收款 → 点击确认收款并清桌
2. 检查订单状态变为已付款
3. 检查桌台状态变为空闲

### 多设备

1. 两部手机扫描同一个桌台二维码
2. 确认购物车同步

## 十一、绑定域名

1. 在 Vercel 项目设置中 → **Domains**
2. 添加客户的域名（如 `restaurant.com`）
3. 按提示配置 DNS 记录

## 十二、交付检查清单

- [ ] Supabase 项目创建成功
- [ ] client-init.sql 执行成功
- [ ] 管理员账号创建成功，可以登录后台
- [ ] 餐馆信息填写完成
- [ ] Logo 和首页图上传完成
- [ ] 菜单录入完成
- [ ] 桌台二维码下载并打印张贴
- [ ] 扫码点餐测试通过
- [ ] 结账、收款、清桌测试通过
- [ ] Vercel 部署成功
- [ ] 域名绑定完成
- [ ] 客户认可

## 十一、品牌外观定制

进入 `/admin` → **餐馆设置** → **品牌外观**：

| 设置项 | 说明 |
|--------|------|
| 主色调 | 网站强调色，例如按钮、标签颜色，默认红色 `#b51f24` |
| 网页标题 | 浏览器标签页显示的标题 |
| 浏览器图标 | 网站 favicon URL，32×32 PNG 即可 |

修改后刷新前台页面即可看到效果。

## 十二、执行升级补丁（老客户）

如果 Supabase 项目是旧版，需要在 SQL Editor 依次执行以下补丁：

```sql
-- 品牌外观自定义
supabase/patches/2026-06-25-brand-customization.sql
```

## 十三、功能模块开关

进入 `/admin` → **餐馆设置** → **功能模块**：

- **前台点单 POS**：关闭后侧边栏 POS tab 消失
- **扫码点餐**：关闭后首页不再显示扫码入口，/table 链接被拦截

同时关闭两个开关 → 纯菜单展示模式（仅保留菜品/分类/设置）。

## 十四、演示数据

新客户可执行 `supabase/demo-menu.sql` 获得通用演示菜单（6 分类 12 菜品，含三语）。

执行前先确保 `client-init.sql` 已完成。

## 重要提示

- 新客户正式初始化只执行 `supabase/client-init.sql`
- `supabase/demo-menu.sql` 用于演示或初始数据
- 老客户升级不要执行 client-init.sql，应使用 `supabase/patches/` 下的升级补丁
- 不要在 SQL Editor 手动改表结构而不提交 SQL 文件

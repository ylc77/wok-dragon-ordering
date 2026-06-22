# 开发者维护说明

## 项目结构

```
├── src/
│   ├── pages/
│   │   ├── HomePage.tsx          # 前台首页
│   │   ├── MenuPage.tsx          # 前台菜单页
│   │   ├── TableOrderPage.tsx    # 扫码点餐页
│   │   └── AdminPage.tsx         # 后台管理（所有tab）
│   ├── lib/
│   │   ├── supabase.ts           # Supabase 客户端初始化
│   │   ├── menuApi.ts            # 菜单/设置 API + 图片上传
│   │   ├── orderApi.ts           # 订单/桌台 API
│   │   ├── types.ts              # TypeScript 类型定义
│   │   ├── localized.ts          # 多语言工具 + 价格格式化
│   │   ├── imageCompress.ts      # WebP 压缩工具
│   │   └── dataExport.ts         # 数据备份导出
│   ├── i18n.ts                   # i18next 三语资源
│   ├── App.tsx                   # 路由 + 公共布局
│   └── styles.css                # 全局样式
├── api/
│   ├── health.js                 # Vercel health check endpoint
│   └── admin/
│       └── translate-menu-item.js # DeepSeek 翻译 API
├── supabase/
│   ├── client-init.sql           # 新客户一键初始化
│   ├── schema.sql                # 完整 schema（开发用）
│   ├── demo-menu.sql             # 演示菜单数据
│   ├── seed.sql                  # 初始种子数据（仅第一客户）
│   └── patches/                  # 老客户升级补丁
├── docs/                         # 文档
├── vercel.json                   # Vercel 配置
└── package.json
```

## 前台页面结构

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | HomePage | 首页，Hero + 卖点 + 推荐菜品 + 联系区 |
| `/menu` | MenuPage | 菜单页，分类导航 + 菜品列表 |
| `/table/:qrToken` | TableOrderPage | 扫码点餐，购物车 + 下单 + 结账 |

## 后台页面结构

所有后台功能在 `AdminPage.tsx` 中，通过 tab 切换：

| Tab | 功能 |
|-----|------|
| dashboard | 仪表盘：今日订单/营收/桌台状态/热销菜品/30天统计 |
| orders | 订单管理：查看/筛选/确认收款/打印/删除 |
| items | 菜品管理：CRUD/批量操作/CSV导入导出/图片上传 |
| categories | 分类管理：CRUD/搜索/状态筛选 |
| tables | 桌台管理：CRUD/二维码/清桌 |
| settings | 餐馆信息：多语言/Logo/Hero/联系方式/外卖/付款方式 |
| system | 系统设置：健康检查/数据备份导出 |

## Supabase 表结构

| 表 | 用途 |
|----|------|
| profiles | 用户角色（admin/staff） |
| restaurant_settings | 餐馆信息（单行） |
| menu_categories | 菜单分类 |
| menu_items | 菜品 |
| restaurant_tables | 桌台（含二维码 token） |
| table_sessions | 桌台点餐会话 |
| table_session_participants | 会话参与者 |
| cart_items | 购物车 |
| orders | 订单 |
| order_items | 订单明细（含菜名快照） |
| bill_requests | 结账请求 |
| table_reentry_requests | 重新进桌请求（保留字段，已简化流程不再默认使用） |
| audit_logs | 操作审计日志 |

## 订单流程

```
顾客扫码 → 进入桌台页 → 选择菜品 → 加入购物车 →
提交订单 → 请求结账(选现金/POS) → 后台确认收款 → 清桌
```

## Table Session / 清桌逻辑

- 每张桌有固定二维码 token
- 扫码时若无 active session → 自动创建新 session
- 若有 active session → 加入当前 session（同桌多人）
- 后台清桌 → session 状态变为 closed → 旧页面不能下单
- 清桌后重新扫码 → 自动创建新 session
- 不再有 24 小时默认申请限制

## 购物车逻辑

- 购物车与 table_session 绑定
- 同 session 内所有设备共享购物车（Realtime 同步）
- 提交订单后购物车自动清空
- 请求结账后购物车锁定，不能加菜

## 支付方式逻辑

- 后台设置：刷卡 POS / 现金
- 至少保留一种
- 顾客结账弹窗只显示后台启用的选项
- 如果关闭某种方式，前端不显示对应按钮

## 菜单多语言规则

- 英文界面：`name_en` → fallback `name_zh`
- 希腊语界面：`name_el` → `name_en` → `name_zh`
- 后台固定中文

## 餐馆设置多语言规则

所有前台显示的餐馆信息都来自 `restaurant_settings`：
- 餐馆名：`name_zh` / `name_en` / `name_el`
- 地址、营业时间、介绍同理
- Logo 和 Hero 图来自 `logo_url` / `hero_image_url`
- 前台代码不写死任何品牌信息

## 图片上传和 WebP 压缩

- `imageCompress.ts`：Canvas 压缩转 WebP
- 不同类型不同尺寸限制（菜品 1200px、分类 1600px、Logo 800px、Hero 1920px）
- 上传到 `menu-images` Storage bucket
- 压缩失败时 fallback 原图

## Storage Bucket

- `menu-images`：public read，authenticated upload
- 路径：`menu-items/`、`menu-categories/`、`restaurant/`
- 上传文件类型限制：jpg/png/webp

## RLS / RPC 注意事项

- 所有写操作通过 security definer RPC 函数
- `protect_order_history` 触发器保护已付款订单不被修改
- `admin_hard_delete_*` 函数需要 admin 角色 + bcrypt 密码
- 匿名用户只能读取公开的菜单和餐馆设置（`delete_password` 已排除）

## 环境变量

| 变量 | 说明 |
|------|------|
| `VITE_SUPABASE_URL` | Supabase 项目 URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥（可选） |

## Vercel 部署

- 从 GitHub main 分支自动部署
- Rewrite 规则：所有非 API 路径回退到 index.html（SPA）
- API 路径自动映射到 `api/` 目录

## 常见问题排查

### 图片上传失败
- 检查 Storage bucket 是否存在
- 检查 Storage policy 是否正确
- 文件是否超过 10MB

### 菜品图片不显示
- 检查 `image_url` 字段是否有值
- 检查 Supabase URL 是否正确
- 浏览器 F12 → Network 查看图片请求状态

### 菜单不显示
- 检查 `menu_categories.is_active` 和 `menu_items.is_available`
- 检查 RLS 策略是否允许 anon 读取

### 订单不出现
- 检查日期筛选是否正确
- 检查 Realtime 连接状态（顶部绿点）
- 刷新页面

### 确认收款失败
- 检查 session 是否已经被关闭（`table session is already closed`）
- 检查 bill_requests 状态是否为 pending

### 清桌失败
- 检查是否还有未完成订单（pending/preparing/served）
- 先取消或完成这些订单再清桌

### 旧 session 还能下单
- 正常：清桌后 session 关闭，旧页面会显示结束状态
- 如果还能下单，检查 `close_table_session` RPC 是否正确执行

### 新顾客扫码不能点餐
- 检查桌台是否有 active session（`get_table_entry_state` 会自动创建）
- 检查二维码 token 是否匹配

### 多语言显示错乱
- 检查菜单字段：`name_en` / `name_el` 是否填写
- 检查 i18n.ts 中的 fallback 规则

### Vercel build 失败
- 本地先运行 `npm run build` 检查 TypeScript 错误
- 检查环境变量是否配置
- 查看 Vercel build logs

## 数据备份建议

- 定期在后台「系统设置」页手动导出数据备份
- Supabase Dashboard → Database → Backups 确认自动备份开启
- 建议每月导出一次完整备份

## 新客户复制部署

1. 新建 Supabase 项目
2. 执行 `supabase/client-init.sql`
3. 创建管理员账号
4. 部署 Vercel
5. 后台录入餐馆信息 + 菜单 + 桌台

详见 `docs/deploy-client-zh.md`。

## 数据库维护规则

所有数据库结构改动必须同时维护：
1. `supabase/patches/` — 用于老客户升级（增量 SQL）
2. `supabase/client-init.sql` — 用于新客户初始化（完整 SQL）
3. `docs/` — 更新部署文档

不要只在 Supabase SQL Editor 手动改库而不提交 SQL 文件。

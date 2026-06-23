\# CLAUDE.md

默认用中文回答我

\## Project Overview



This project is a restaurant official website + QR code table ordering system.



The system is designed for real restaurant use in Greece/Athens. It includes:



\* Restaurant landing page

\* QR code table ordering page

\* Shared cart for the same table

\* Multi-device ordering

\* Order submission

\* Cash / POS payment request

\* Staff/admin backend

\* Table session management

\* Clear table flow

\* Reopen / join table approval flow

\* Menu management

\* CSV menu import

\* DeepSeek-powered menu translation

\* Kitchen receipt printing

\* Supabase database with RLS/RPC

\* Vercel Production deployment



Frontend customer UI supports English and Greek.

Admin backend UI should stay in Chinese.



Do not rebuild the project from scratch.



\---



\## Tech Stack



\* React / Vite frontend

\* TypeScript

\* Supabase database, Auth, RLS, RPC, Realtime

\* Vercel deployment

\* DeepSeek API for backend-only translation

\* Browser-based kitchen printing



Important:



\* Never expose DeepSeek API keys in frontend code.

\* Never expose Supabase service role keys in frontend code.

\* All sensitive operations must go through secure backend routes or controlled Supabase RPC functions.



\---



\## Current Production Site



Production URL:



```text

https://wok-dragon-ordering.vercel.app

```



Important routes:



```text

/

&#x20;/menu

/table/table-01-demo-token

/admin

```



Do not break these routes.



\---



\## Core Business Rules



\### 1. Static QR Code Rule



Each table uses a fixed static QR token.



The QR code should not directly create or join a session.



Scanning a table QR should first enter a table entry page.



The user must click a button such as:



\* 开始点餐

\* 加入当前桌点餐

\* 申请加入当前桌点餐



Only then can the device join a session.



\---



\### 2. Table Session Rule



Each table should have one current active session.



After clearing a table or confirming payment:



\* Old session must be closed.

\* A new empty active session should be pre-created.

\* The new active session should have no participants at first.

\* A session with no participants and no unfinished orders should be treated as idle.



Do not treat an empty pre-created active session as occupied.



\---



\### 3. Old Device Protection Rule



If a device has a saved old session and that session is already closed:



\* Within 24 hours after `closed\_at`, the device must not directly join the new session.

\* It must show an ended page and require staff approval to join/start again.

\* After 24 hours, the local old session record may be cleared.

\* Even after clearing the old record, the device must still show an entry button.

\* Do not automatically enter the ordering page.



24-hour calculation must use server-side `closed\_at`, not client device time.



\---



\### 4. New Device Rule



A new device without an old closed session may:



\* Click “开始点餐” if the table is idle.

\* Click “加入当前桌点餐” if the table is already in use.



This is accepted to reduce staff workload for normal same-table guests.



However, joining must still go through a controlled RPC with database-side validation.



Do not allow old legacy RPCs to bypass the entry/session protection rules.



\---



\### 5. Join / Reopen Approval Rule



Old devices within the 24-hour protection period must create a join/reopen request.



Staff/admin can approve or reject the request in the backend.



After approval:



\* Only the requesting device is allowed to join.

\* Other devices from the old session are not automatically approved.

\* Realtime should update the customer page if possible.



Backend wording should use:



```text

加入桌台请求

```



\---



\### 6. Cart and Bill Lock Rule



Once a customer requests the bill:



\* The cart must be locked.

\* Customers must not add items.

\* Customers must not update quantities.

\* Customers must not delete cart items.

\* Customers must not submit new orders.



This must be enforced at the database/RPC level, not only in frontend UI.



`request\_bill` must also reject the request if there are unsubmitted cart items.



Customer clicking checkout means:



```text

请求付款

```



It does not mean the order is already paid.



\---



\### 7. Payment Rule



Orders must not be manually changed to `paid` through a generic status update.



Paid status must only be set through the confirmed payment transaction/RPC.



Confirming payment must consistently update:



\* order status

\* payment status

\* payment method

\* paid\_at

\* session close status



Avoid data such as:



```text

status = paid

payment\_status = unpaid

paid\_at = null

```



\---



\### 8. Clear Table Rule



Do not allow clearing a table if the session still has unfinished orders such as:



\* pending

\* preparing

\* served



The backend should require staff to complete, cancel, or properly handle unfinished orders before clearing.



If a forced clear option exists, it must have a strong confirmation and clear business meaning.



\---



\### 9. Admin Permission Rule



The `/admin` area must require real staff/admin permission.



Do not only check whether a Supabase session exists.



Only users with `profiles.role` equal to:



```text

admin

staff

```



may enter the backend.



Anonymous customers or normal authenticated users must not see the admin layout, sidebar, dashboard, or zero-data admin screen.



If unauthorized, show a clear no-permission message or redirect to login.



\---



\## Menu and Translation Rules



\### Frontend Language Rules



Customer-facing frontend supports:



\* English

\* Greek



Menu content should come from Supabase, not hardcoded frontend content.



Use localized fields:



```text

name\_en

name\_el

name\_zh

description\_en

description\_el

description\_zh

```



Fallback rules:



```text

Greek UI: Greek -> English -> Chinese

English UI: English -> Chinese

```



Do not mix Greek descriptions into the English UI unless fallback is necessary.

Do not mix English descriptions into the Greek UI unless fallback is necessary.



\### Admin Language Rule



Admin UI should remain Chinese.



The admin can edit Chinese, English, and Greek fields.



\### DeepSeek Translation Rule



DeepSeek translation must be backend-only.



Never put API keys in:



\* React components

\* frontend env variables exposed to browser

\* client-side code



Translation APIs must verify admin/staff permission.



\---



\## Backend UI Principles



The backend is for real restaurant staff.



Optimize for speed and clarity, not just visual design.



Important backend states:



```text

空闲

使用中

待付款

已付款 / 待清桌

有加入桌台请求

```



Backend dashboard should eventually show:



\* 今日营业额

\* 今日订单数

\* 当前使用中桌台

\* 待处理订单

\* 待付款桌台

\* 待清桌桌台

\* 待处理加入桌台请求



Do not make staff click through many pages for common actions.



\---



\## Printing Rules



Kitchen printing is browser-based.



Do not mark an order as printed before the print call is actually triggered.



If printing fails or the user cancels, the system should not permanently treat it as successfully printed unless the current implementation intentionally records “print attempted”.



Avoid breaking existing kitchen printing flow.



\---



\## Data Safety Rules



Orders, order items, payments, and session history are business records.



Do not hard delete important business data by default.



Prefer:



\* soft delete

\* archived status

\* `deleted\_at`

\* hidden/inactive flags



Menu items and categories may be hidden or soft deleted.



Order snapshots must preserve historical dish name, price, and notes.



\---



\## Supabase and Database Rules



Be very careful when editing:



```text

supabase/schema.sql

Supabase RPC functions

RLS policies

Realtime subscriptions

```



Do not casually drop tables, reset data, or overwrite production data.



When changing database logic:



1\. Explain the migration.

2\. Keep existing data safe.

3\. Preserve historical orders.

4\. Keep old interfaces compatible if needed during deployment.

5\. Prefer controlled RPCs for sensitive operations.

6\. Run build/tests after changes.



Important:



\* Frontend checks are not enough.

\* Business rules must be enforced in database/RPC where possible.



\---



\## Deployment Rules



Production deploys from GitHub `main` to Vercel.



Before pushing to `main`:



1\. Run build.

2\. Confirm TypeScript passes.

3\. Check changed files.

4\. Summarize risk.

5\. Avoid unrelated changes.



Do not push broken code to `main`.



If the change affects restaurant business logic, list manual test steps before final confirmation.



\---



\## Testing Checklist



For any change affecting ordering, session, payment, or clearing tables, test:



\### QR / Session



\* New device scans table QR.

\* It does not auto-join.

\* User clicks start ordering.

\* Device joins current active session.

\* Old closed device refreshes and remains on ended page.

\* Old device within 24 hours must request staff approval.

\* Staff approval only lets that device join.

\* After payment/clear table, a new empty active session exists.



\### Cart / Orders



\* Add item.

\* Change quantity.

\* Delete item.

\* Submit order.

\* Multi-device shared cart updates via Realtime.

\* Same dish with different notes does not merge incorrectly.



\### Bill / Payment



\* Customer requests bill.

\* Cart becomes locked.

\* Customer cannot add or submit new orders after bill request.

\* Cash/POS request is visible in backend.

\* Staff confirms payment.

\* Order becomes paid through confirmed payment flow only.

\* Session closes after payment.



\### Clear Table



\* Table cannot be cleared with unfinished orders.

\* After orders are handled, clear table works.

\* Backend shows table as idle after clearing.

\* Old customer cannot continue ordering from the closed session.



\### Admin



\* Admin user can enter backend.

\* Staff user can enter allowed backend areas.

\* Anonymous customer cannot see backend dashboard/sidebar.

\* Unauthorized user sees no-permission/login state.



\### Printing



\* Kitchen print button works.

\* Print status is not incorrectly marked before print attempt.

\* Failed/cancelled printing does not silently lose retry ability.



\### Multilingual



\* English page uses English fields.

\* Greek page uses Greek fields.

\* Fallback works correctly.

\* Backend stays Chinese.



\---



\## What Not To Do



Do not add these unless explicitly requested:



\* Online payment

\* Customer membership system

\* Delivery platform

\* Dynamic QR code replacement

\* WiFi/location verification

\* Complex device fingerprinting

\* Customer-to-customer approval

\* Full inventory system

\* Multi-store system

\* Large UI rewrite

\* Complete project rebuild



Do not change working core logic unless the task explicitly requires it.



\---



\## Recommended Development Style



For every task:



1\. First inspect the current code.

2\. Explain the current behavior.

3\. Identify the smallest safe change.

4\. Modify only necessary files.

5\. Avoid unrelated refactors.

6\. Run build/tests.

7\. Provide clear manual test steps.

8\. Commit only when the user confirms or when explicitly asked.



When unsure, ask before making destructive changes.



\---



\## Current Project Priorities



Highest priority:



1\. Keep QR ordering flow stable.

2\. Keep table session logic correct.

3\. Keep payment and clear table flow safe.

4\. Keep admin permission secure.

5\. Keep production deploy reliable.



Next useful improvements:



1\. Backend dashboard usability.

2\. Table status cards.

3\. Manual data backup export.

4\. `/api/health` system health check.

5\. System status page.

6\. Better kitchen print retry handling.

7\. Browser automation tests for QR-to-clear-table flow.



Do not prioritize visual redesign over business correctness.




---

## 数据库维护规则

所有数据库结构改动必须同时维护三处：

1. **supabase/patches/** — 新建日期命名的增量 SQL 文件，用于老客户升级。必须可重复执行（`if not exists`、`create or replace`、`drop policy if exists`）。
2. **supabase/client-init.sql** — 同步更新完整初始化文件，用于新客户。
3. **docs/** — 更新相关部署和维护文档。

数据库改动包括：新增/修改表、字段、索引、RLS、RPC、Storage bucket、默认数据。

**禁止**：只在 Supabase SQL Editor 手动改库而不提交 SQL 文件。

## 新客户初始化

- 新客户只执行 `supabase/client-init.sql`
- 演示数据使用 `supabase/demo-menu.sql`（可选）
- 老客户升级使用 `supabase/patches/`

## 关键业务规则（不可破坏）

- 前台英语/希腊语，后台中文
- 菜单和餐馆信息来自 Supabase，不写死
- 桌台二维码固定，session 动态生成
- 清桌后旧 session 失效，重新扫码自动创建新 session（无 24h 限制）
- 结账后购物车锁定
- 付款方式由后台控制
- 暂停接单后顾客不能提交订单
- 所有删除操作需 admin + 密码
- 图片自动压缩 WebP

## 交付文档

| 文件 | 用途 |
|------|------|
| `docs/deploy-client-zh.md` | 新客户部署步骤 |
| `docs/client-guide-zh.md` | 餐馆老板/员工操作指南 |
| `docs/maintenance-zh.md` | 开发者维护说明 |
| `supabase/client-init.sql` | 一键数据库初始化 |
| `supabase/demo-menu.sql` | 演示菜单数据 |
| `README_CLIENT_DATABASE.md` | 数据库部署英文指南 |

## 2026-06-23/24 新增功能

### 菜品口味选项 (Menu Options)

- `menu_items.options` jsonb — 菜品可选口味配置
- `cart_items.selected_options` jsonb — 购物车中已选口味
- `order_items.selected_options` jsonb — 订单口味快照
- 顾客端：有 options 的菜弹窗选择，无 options 直接加购
- 购物车：同菜同口味合并数量，不同口味分行
- 后台：模板按钮（辣度/特殊要求/饮料温度）+ JSON 编辑器
- SQL: `supabase/patches/2026-06-23-menu-options.sql`

### 后台移动端优化

- 菜品管理卡片化 (≤600px)
- 订单管理卡片化 (≤600px)
- 仪表盘 30 天统计卡片化
- 桌台 QR 缩小、维护按钮触控加高
- 全部 CSS only，不改 TSX

### POS 前台点单

- 新 tab "前台点单 POS" (/admin)
- 堂食/外带 + 桌号可选
- 本地购物车 state，不使用 cart_items 表
- `pos_submit_order` RPC (staff/admin 专用)
- 支持口味选择、付款方式（未付款/现金/刷卡）
- 搜索菜品（中/英/希三语）
- SQL: `supabase/patches/2026-06-24-pos-submit-order.sql`
- SQL: `supabase/patches/2026-06-24-pos-order-type.sql`

### 后台手动确认收款

- 订单卡片优先显示 payment_status（已收款·现金/刷卡/未付款）
- "收款" 红色按钮 + 弹窗选现金/刷卡
- 有 session 订单：收款并清桌（关闭旧 session + 新建）
- 无 session 订单（外带/无桌号）：仅标记已收款
- SQL: `supabase/patches/2026-06-24-admin-confirm-payment.sql`

### 支付适配器骨架

- `src/lib/payments/` — types, adapters, index
- 当前实现：manual/cash/pos 手动模式
- 未来扩展：viva/nexi/cardlink (TODO)
- 不接真实第三方支付

### 打印优化

- 纸张宽度选择 80mm/58mm (localStorage)
- 预览小票按钮
- 小票含餐馆名、总价、口味、备注
- SQL: `supabase/patches/2026-06-24-admin-order-null-table.sql` (LEFT JOIN 修复)

### 统计和筛选修复

- 已付款/营业额统一基于 `payment_status='paid'`
- 待处理/制作中等筛选排除已付款订单
- SQL: `supabase/patches/2026-06-24-payment-status-stats.sql`

### 声音和刷新优化

- 轮询间隔：30s → 5s (顾客端 + 后台)
- visibilitychange 切回立即刷新
- POS 提交后播放声音提醒
- 加餐自动打印修复

## 架构约定 (重要)

| 概念 | 说明 |
|------|------|
| `status` | 订单处理状态 (pending/preparing/served/cancelled)，**不再作为收款判断** |
| `payment_status` | 收款状态 (unpaid/paid)，已收款/营业额/筛选都基于此 |
| 顾客扫码订单 | 使用 table_session + cart_items + submit_order |
| POS 订单 | 使用本地购物车 + pos_submit_order (不经过 cart_items) |
| POS 外带/无桌号 | 允许 session_id/table_id 为 null |
| 有 session 收款 | 关闭 session + 清空 cart + 创建新 session |
| 无 session 收款 | 仅标记该订单 payment_status='paid' |
| 支付适配器 | 骨架，不接真实 Viva/Nexi/Cardlink |
| 报税小票 | 不由厨房小票替代，未来对接客户 POS/收银/AADE |

## 需要执行的 SQL Patch

| Patch | 说明 | 状态 |
|-------|------|:---:|
| `2026-06-23-menu-options.sql` | menu/cart/order items options 字段 | ✅ 已执行 |
| `2026-06-24-pos-submit-order.sql` | pos_submit_order RPC | ✅ 已执行 |
| `2026-06-24-pos-order-type.sql` | order_type + nullable table/session | ✅ 已执行 |
| `2026-06-24-admin-order-null-table.sql` | admin_order_page LEFT JOIN | ✅ 已执行 |
| `2026-06-24-admin-confirm-payment.sql` | 确认收款 RPC + update_order_status | ✅ 已执行 |
| `2026-06-24-payment-status-stats.sql` | 统计/筛选 payment_status | ✅ 已执行 |
| `2026-06-25-brand-customization.sql` | 品牌外观：颜色/favicon/标题 | ✅ 已执行 |
| `2026-06-25-module-toggles.sql` | 模块开关：POS/扫码点餐 | ✅ 已执行 |

## 2026-06-25 商业化模板化

### 品牌模板化 (P0)

- `restaurant_settings.brand_color` — 主色调（覆盖 CSS --accent）
- `restaurant_settings.meta_title` — 浏览器标题
- `restaurant_settings.favicon_url` — 浏览器图标
- App.tsx 自动应用品牌设置
- localStorage 前缀 `wok-dragon:` → `restaurant:`（含旧 key 迁移）

### 模块开关系统 (P1)

- `restaurant_settings.enable_pos` — 前台点单 POS 开关
- `restaurant_settings.enable_qr_ordering` — 扫码点餐开关
- POS tab/桌台管理随开关隐藏
- /table/:qrToken 在 QR 关闭时显示拦截提示
- 双关时进入纯菜单展示模式（仅菜品/分类/设置）

### 新客户部署 (P2)

- `.env.template` — Vercel 环境变量模板
- `demo-menu.sql` — 通用演示数据（含默认餐馆设置）
- `docs/deploy-client-zh.md` — 10 分钟快启指南

## 2026-06-25 最后修复

### 翻译功能修复

- DeepSeek prompt 强化：必须返回希腊文，不可跳过
- `_idx` 标记防止批量翻译时菜品顺序错乱
- 希腊文为空时用英文兜底
- 纯 JS 语法修复（api/ 目录不支持 TS 泛型）

### POS 体验优化

- 购物车 sticky 定位（不随菜单滚动丢失）
- 清空购物车前 confirm 确认
- 总价格 24px 醒目
- 堂食不强制选桌号

### 声音提醒完善

- 声音开关 localStorage 持久化 (`restaurant:order-sound-enabled`)
- 测试声音按钮 + 浏览器音频解锁
- 新订单标题闪烁 "🔔 新订单 - 餐馆名"
- AudioContext resume 处理

### 客户文档

- `docs/client-pricing-zh.md` — 四版本报价表
- `docs/demo-script-zh.md` — 10 步演示流程
- `docs/sales-pitch-zh.md` — 销售话术 + 广告文案 + Q&A

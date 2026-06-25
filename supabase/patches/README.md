# Supabase Patches

## 新客户部署

新客户只执行 `supabase/client-init.sql`。它已经包含当前完整数据库结构、RLS、RPC、Storage bucket/policy 和默认数据。

不要执行 `supabase/schema.sql`，它只是 legacy 快照。
不要为新客户逐个执行 `supabase/patches-archive/` 里的历史补丁。

## 老客户升级

老客户不要重新执行 `supabase/client-init.sql`，避免覆盖或污染已有数据。

升级前先备份数据库，再根据客户当前版本，从 `supabase/patches-archive/` 选择缺失补丁，按日期和业务依赖顺序执行。

## 2026-06-26 安全补丁顺序

如果老客户已经有扫码点餐、菜单 options、删除密码等近期功能，建议按下面顺序执行这三个补丁：

1. `2026-06-26-storage-staff-only.sql`
   - 目的：将 `menu-images` 上传、更新、删除权限收紧为 admin/staff。
   - 说明：补丁会安全创建/更新 `private.is_staff()`，并使用 `drop policy if exists` 后重建 Storage policy。
   - 幂等性：可重复执行。

2. `2026-06-26-order-soft-delete.sql`
   - 目的：将订单、菜品、分类的后台删除按钮改为 `deleted_at` 归档/软删除，保留 `order_items` 历史明细。
   - 说明：补丁会安全创建 `private.admin_settings`、补齐 `deleted_at` 字段、迁移旧 `restaurant_settings.delete_password`（如果存在）、重建相关保护触发器，并覆盖删除 RPC。
   - 幂等性：可重复执行。

3. `2026-06-26-rpc-execute-tightening.sql`
   - 目的：收紧五参数 `add_cart_item(uuid, uuid, int, text, jsonb)` 的执行权限，禁止 `public/anon` 直接执行。
   - 说明：如果目标数据库还没有这个五参数函数，补丁会跳过并输出 notice，不会失败。
   - 幂等性：可重复执行。

## 历史归档补丁

`supabase/patches-archive/` 中较早的 SQL 是历史升级路径，不代表每个客户都需要执行。

不要机械执行整个目录。先确认客户数据库已包含哪些表、字段、RPC 和 RLS policy，再只执行缺失的补丁。

## 开发说明

- 数据库结构改动请在 `supabase/patches-archive/` 中新增日期命名的增量 SQL。
- 同时同步更新 `supabase/client-init.sql`。
- 维护 `docs/deploy-client-zh.md` 部署文档。
- 不要只在 Supabase SQL Editor 手动改库而不提交 SQL 文件。

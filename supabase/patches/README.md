# Supabase Patches

新客户不需要执行本目录的补丁；只需执行 `supabase/client-init.sql`。

## 新客户部署

新客户只执行：

```text
supabase/client-init.sql
```

`client-init.sql` 是唯一权威初始化文件，已经包含当前完整数据库结构、RLS、RPC、Storage bucket/policy 和默认数据。

不要执行：

- `supabase/schema.sql`：legacy 快照，不用于新客户部署。
- `supabase/patches/`：仅用于已经部署过、需要补齐增量更新的数据库。
- `supabase/patches-archive/`：历史补丁已清理，不用于 1.0 新客户部署。

## 后续已有客户升级

### 当前已部署模板数据库

如果后台删除桌台时提示找不到 `admin_delete_restaurant_table`，在 Supabase Dashboard 的 SQL Editor 中执行一次：

```text
supabase/patches/2026-07-10-add-table-delete-rpc.sql
```

该补丁只创建/更新安全的删除桌台 RPC 及其执行权限；不会删除订单、订单明细或菜单数据。执行完成后刷新后台页面再重试。

### 后续已有客户升级

等项目正式售卖并存在真实客户数据库后，如果需要升级已有客户数据库，再新增日期命名的增量 SQL patch。

新增 patch 时请同时：

1. 先备份客户数据库。
2. 新增 `supabase/patches/YYYY-MM-DD-xxx.sql`。
3. 同步更新 `supabase/client-init.sql`，保证新客户仍然只执行一个初始化文件。
4. 在本 README 中写清楚执行顺序、前置依赖和回滚/验证方式。

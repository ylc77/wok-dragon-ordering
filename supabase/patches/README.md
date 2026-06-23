# Supabase Patches

## 新客户部署

请执行 `supabase/client-init.sql`，它已经包含当前完整数据库结构和所有最新 RPC。

**不要逐个执行本目录下的旧 SQL 文件。**

## 老客户升级

参考 `supabase/patches-archive/` 中的历史 patch，按日期顺序执行缺失的补丁。

执行前请先备份数据库。

## 开发说明

- 数据库结构改动请在 `supabase/patches-archive/` 中新增日期命名的增量 SQL
- 同时同步更新 `supabase/client-init.sql`
- 维护 `docs/deploy-client-zh.md` 部署文档
- 不要只在 Supabase SQL Editor 手动改库而不提交 SQL 文件

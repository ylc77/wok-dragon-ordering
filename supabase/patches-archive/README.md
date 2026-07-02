# Patches Archive

历史 SQL patch 已在 1.0 商业交付整理中清空。

当前项目还没有已上线老客户数据库，新客户只需要执行：

```text
supabase/client-init.sql
```

后续如果已经有真实客户数据库需要升级，再按日期新增增量 patch，并在 `supabase/patches/README.md` 写清楚执行顺序。

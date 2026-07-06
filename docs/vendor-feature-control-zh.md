# 客户版本与功能开关

本项目提供一个交付方专用的隐藏维护入口，用于在不登录客户后台的情况下调整套餐和可见功能。

## 入口

客户域名后追加：

```text
/_vendor-settings
```

该入口不会显示在官网或客户后台导航中。维护密码只由服务端校验，不写入前端源码。

## 首次部署

新客户数据库只执行 `supabase/client-init.sql`，其中已经包含套餐和功能字段。

现有演示数据库可单独执行一次：

```text
supabase/vendor-feature-control.sql
```

不要把真实密码或 service role key 写入代码、SQL、README 或前端环境变量。

## Vercel 环境变量

每个客户部署需要配置：

```text
VENDOR_SETTINGS_PASSWORD=仅交付方知道的高强度密码
SUPABASE_SERVICE_ROLE_KEY=该客户 Supabase 项目的 service role key
```

同时保留项目原有的：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` 和 `VENDOR_SETTINGS_PASSWORD` 只能配置在 Vercel 服务端，绝不能使用 `VITE_` 前缀。配置后重新部署。

## 套餐预设

- 基础版：官网、公开菜单和基础菜单管理。
- 标准版：增加扫码点餐、CSV 和数据备份。
- 高级版：增加 POS、AI、自动打印助手等全部商用模块。

套餐只是快速预设。保存前可以单独调整每个模块。

## 当前控制范围

- POS 前台点单
- 扫码点餐与桌台二维码
- CSV 批量导入导出
- AI 菜单补全
- AI 菜品图片
- 数据备份入口
- 本地打印助手说明与状态

扫码点餐关闭时，顾客桌码页会停止进入点餐流程。其他增值功能主要从客户后台隐藏。

## 安全说明

- API 只接受同站 HTTPS 请求，不开放跨域访问。
- 密码使用恒定时间比较，并带有基础失败次数限制。
- service role key 只在 Vercel Function 中使用，不会发送到浏览器。
- 普通客户后台不再显示 POS / 扫码模块开关，避免客户自行改变套餐。
- 这是一套交付版本控制，不是完整的订阅计费或防破解授权系统。

如果未来需要统一管理几十个客户域名、到期停用、续费和许可证签名，应再建设独立的中央授权服务，不建议继续在单个客户项目中堆叠。

# Wok Dragon 本地自动打印助手

这是餐馆系统的 Windows 本地打印助手 MVP。它在前台电脑或 Windows 平板上运行，监听 Supabase 中未打印的 `pending` 订单，打印厨房小票，成功后调用现有 `mark_order_kitchen_printed` RPC 标记已打印。

## 适用设备

- Windows 电脑
- Windows 平板
- Windows 小主机
- 已在 Windows 中安装好驱动、能打印测试页的 USB / 网口 / 系统打印机

第一版走 Windows 系统打印机，不直接适配 iPad、安卓收银机、蓝牙打印机深度兼容或希腊税务正式发票。

## 配置

复制配置模板：

```powershell
Copy-Item print-agent\.env.example print-agent\.env
```

填写：

```text
SUPABASE_URL=
SUPABASE_KEY=
ADMIN_EMAIL=
ADMIN_PASSWORD=
PRINTER_NAME=
PAPER_WIDTH=80
POLL_INTERVAL_MS=3000
AUTO_PRINT=true
```

`SUPABASE_KEY` 使用前端 publishable key，不要使用 service role key。`ADMIN_EMAIL` / `ADMIN_PASSWORD` 应该是后台 staff/admin 账号。

`PRINTER_NAME` 为空时使用 Windows 默认打印机。指定打印机名称时，需要和 Windows 打印机列表中的名称一致。

## 命令

列出 Windows 打印机：

```powershell
pnpm print-agent -- --list-printers
```

打印测试小票：

```powershell
pnpm print-agent -- --test-print
```

只检查一次未打印订单：

```powershell
pnpm print-agent -- --once
```

持续监听并自动打印：

```powershell
pnpm print-agent
```

## 行为说明

- 只处理 `status = pending`、`deleted_at is null`、`kitchen_printed_at is null` 的订单。
- 打印成功后才调用 `mark_order_kitchen_printed(order_id)`。
- 打印失败不会标记订单，下一轮会继续重试，避免丢单。
- 本地日志写入 `print-agent/logs/print-agent.log`，该目录不会提交到 Git。


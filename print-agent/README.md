# Wok Dragon 本地自动打印助手

这是餐馆系统的 Windows 本地打印助手。它适合安装在前台电脑、Windows 平板或 Windows 小主机上，用来监听新订单并自动打印厨房小票。

## 一、它能做什么

- 监听扫码点餐和 POS 前台点单产生的新订单
- 自动打印厨房小票
- 支持 Windows 默认打印机或指定打印机
- 支持 58mm / 80mm 小票纸
- 打印成功后标记订单已打印，避免重复出纸
- 打印失败不会标记订单，下一轮会继续重试
- 可设置开机自动启动

## 二、适用设备

推荐：

- Windows 电脑
- Windows 平板
- Windows 小主机
- 已在 Windows 中安装好驱动，并且能打印测试页的 USB / 网口 / 系统打印机

暂不承诺：

- iPad 全自动打印
- 安卓收银机自动打印
- 蓝牙打印机深度兼容
- ESC/POS 原生直连所有型号
- 希腊税务正式发票 / AADE fiscal receipt

## 三、首次配置

复制配置模板：

```powershell
Copy-Item print-agent\.env.example print-agent\.env
```

填写 `print-agent\.env`：

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-publishable-key
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-me
PRINTER_NAME=
PAPER_WIDTH=80
POLL_INTERVAL_MS=3000
AUTO_PRINT=true
```

说明：

- `SUPABASE_KEY` 使用前端 publishable key，不要使用 service role key。
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` 使用后台 staff/admin 账号。
- `PRINTER_NAME` 为空时使用 Windows 默认打印机。
- 如果指定打印机名称，需要和 Windows 打印机列表里的名称一致。

## 四、常用操作

双击启动：

```text
print-agent\start-print-agent.cmd
```

列出打印机：

```text
print-agent\list-printers.cmd
```

测试打印：

```text
print-agent\test-print.cmd
```

安装开机自启：

```text
print-agent\install-startup.cmd
```

取消开机自启：

```text
print-agent\uninstall-startup.cmd
```

## 五、运行说明

启动后请保持窗口打开。窗口关闭、电脑关机或程序退出后，就不会继续自动打印。

正式交付给客户时，推荐安装开机自启。这样前台电脑开机后，打印助手会自动运行。

日志文件：

```text
print-agent\logs\print-agent.log
```

本地配置和日志不会提交到 Git。


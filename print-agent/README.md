# Wok Dragon 本地自动打印助手

这是餐馆系统的 Windows 本地打印助手。它适合安装在前台电脑、Windows 平板或 Windows 小主机上，用来监听新订单并自动打印厨房小票。

## 一、客户部署简化流程

给客户安装时，推荐按这个流程走：

1. 先在 Windows 里安装好打印机驱动，并确认能打印 Windows 测试页。
2. 在项目目录打开终端。
3. 运行初始化配置：

```powershell
pnpm print-agent -- --setup
```

4. 按提示填写：
   - Supabase URL
   - Supabase publishable key
   - 后台管理员邮箱
   - 后台管理员密码
   - 打印机名称，可留空使用 Windows 默认打印机
   - 小票纸宽，默认 80
   - 是否自动打印，默认 true

5. 测试打印：

```powershell
pnpm print-agent -- --test-print
```

6. 启动自动打印：

```powershell
pnpm print-agent
```

7. 如果需要电脑开机后自动运行：

```powershell
pnpm print-agent -- --install-startup
```

配置会保存到 `print-agent/config.json`。这个文件只放在客户本地电脑，不要提交到 Git。

## 二、它能做什么

- 监听扫码点餐和 POS 前台点单产生的新订单
- 自动打印厨房小票
- 支持 Windows 默认打印机或指定打印机
- 支持 58mm / 80mm 小票纸
- 打印成功后标记订单已打印，避免重复出纸
- 打印失败不会标记订单，下一轮会继续重试
- 可设置 Windows 开机自动启动

## 三、适用设备

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

## 四、配置优先级

打印助手会优先读取：

```text
print-agent/config.json
```

如果没有 `config.json`，再读取：

```text
print-agent/.env
```

因此客户部署建议使用 `--setup` 生成 `config.json`。开发或维护时仍然可以使用 `.env`。

`.env` 示例：

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

## 五、常用操作

交互式初始化：

```powershell
pnpm print-agent -- --setup
```

启动自动打印：

```powershell
pnpm print-agent
```

列出打印机：

```powershell
pnpm print-agent -- --list-printers
```

测试打印：

```powershell
pnpm print-agent -- --test-print
```

安装开机自启：

```powershell
pnpm print-agent -- --install-startup
```

也可以继续使用这些双击脚本：

```text
print-agent\start-print-agent.cmd
print-agent\list-printers.cmd
print-agent\test-print.cmd
print-agent\install-startup.cmd
print-agent\uninstall-startup.cmd
```

## 六、运行说明

启动后请保持窗口打开。窗口关闭、电脑关机或程序退出后，就不会继续自动打印。

正式交付给客户时，推荐安装开机自启。这样前台电脑开机后，打印助手会自动运行。

日志文件：

```text
print-agent\logs\print-agent.log
```

本地配置和日志不会提交到 Git。

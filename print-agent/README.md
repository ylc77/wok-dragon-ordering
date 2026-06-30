# Wok Dragon 本地自动打印助手

这是 Wok Dragon 餐馆系统的 Windows 本地打印助手。它安装在前台电脑或 Windows 平板上，用来监听新订单并自动打印厨房小票。

## 一、客户推荐安装流程

打印助手现在支持三种运行方式：

- 开发模式：`pnpm print-agent`
- 便携版：`YANLCPrintAgent.zip`
- 正式安装包版：`YANLCPrintAgentSetup.exe`

如果是正式交付客户，推荐优先构建安装包：

```powershell
npm run build:print-agent-installer
```

生成：

```text
dist-print-agent\YANLCPrintAgentSetup.exe
```

如果只是现场快速测试，也可以构建便携版：

```powershell
npm run build:print-agent-package
```

然后把生成的文件夹复制到客户电脑：

```text
dist-print-agent\YANLCPrintAgent\
```

便携版说明见：

```text
docs\print-agent-portable-package-zh.md
```

1. 在 Windows 中安装好打印机驱动。
2. 确认打印机可以打印 Windows 测试页。
3. 双击运行客户安装向导：

```text
print-agent\client-setup.cmd
```

安装向导会依次列出打印机、填写配置、测试打印、设置开机自启，并可选择立即启动打印助手。

如果需要手动执行，也可以在项目目录打开终端，打开本地设置页面：

```powershell
pnpm print-agent -- --setup-ui
```

4. 按提示填写 Supabase、后台账号、打印机名称、纸宽和是否自动打印。
5. 测试打印：

```powershell
pnpm print-agent -- --test-print
```

7. 启动自动打印：

```powershell
pnpm print-agent
```

8. 如果需要开机自动启动：

```powershell
pnpm print-agent -- --install-startup
```

## 二、配置文件

打印助手优先读取：

```text
print-agent/config.json
```

如果没有 `config.json`，才会读取：

```text
print-agent/.env
```

客户部署建议使用安装包或便携包里的设置入口生成 `config.json`。开发模式可使用 `--setup-ui` 打开本地设置页面，`--setup` 作为命令行备用方式。

`.env` 只是开发、维护或临时排查时的备用方式。

不要提交这些本地文件：

```text
print-agent/config.json
print-agent/logs/
```

## 三、setup 会询问什么

运行：

```powershell
pnpm print-agent -- --setup
```

会逐项询问：

- Supabase URL
- Supabase publishable key
- Admin email
- Admin password
- Printer name，留空使用 Windows 默认打印机
- Paper width，默认 80
- Auto print，默认 true

保存后会生成：

```text
print-agent/config.json
```

## 四、常用命令

启动自动打印：

```powershell
pnpm print-agent
```

只检查一次订单：

```powershell
pnpm print-agent -- --once
```

测试打印：

```powershell
pnpm print-agent -- --test-print
```

列出 Windows 打印机：

```powershell
pnpm print-agent -- --list-printers
```

打开本地设置页面：
```powershell
pnpm print-agent -- --setup-ui
```

命令行备用初始化：

```powershell
pnpm print-agent -- --setup
```

安装 Windows 开机自启：

```powershell
pnpm print-agent -- --install-startup
```

查看帮助：

```powershell
pnpm print-agent -- --help
```

## 五、双击脚本

也可以使用这些脚本：

```text
print-agent\client-setup.cmd
print-agent\start-print-agent.cmd
print-agent\list-printers.cmd
print-agent\test-print.cmd
print-agent\install-startup.cmd
print-agent\uninstall-startup.cmd
```

说明：

- `client-setup.cmd`：客户安装向导，适合首次部署
- `start-print-agent.cmd`：启动自动打印
- `list-printers.cmd`：查看打印机列表
- `test-print.cmd`：打印测试小票
- `install-startup.cmd`：安装开机自启
- `uninstall-startup.cmd`：取消开机自启

## 六、适用打印机

第一版使用 Windows 系统打印机模式。

只要打印机已经在 Windows 里安装好驱动，并且可以打印 Windows 测试页，就可以尝试使用。

适合：

- Windows USB 热敏打印机
- Windows 网口打印机
- 58mm / 80mm 小票打印机
- 普通打印机测试

第一版不承诺：

- iPad 全自动打印
- 安卓收银机自动打印
- 蓝牙打印机深度兼容
- 所有 ESC/POS 型号直连
- 希腊税务正式发票

## 七、运行注意事项

- 自动打印窗口需要保持打开。
- 关闭窗口后不会继续自动打印。
- 电脑关机后不会继续自动打印。
- 电脑睡眠可能影响自动打印。
- 打印失败时不会标记订单为已打印，下一轮会继续重试。
- 打印成功后会调用 `mark_order_kitchen_printed` 标记已打印，避免重复出纸。

## 八、日志

日志文件位置：

```text
print-agent/logs/print-agent.log
```

排查问题时可以查看：

- 是否成功启动
- 是否登录后台账号成功
- 是否发现待打印订单
- 是否打印成功
- 是否标记订单已打印
- 打印失败的错误原因

## 九、安全说明

- 打印助手使用 Supabase publishable key。
- 打印助手使用 staff/admin 后台账号登录读取订单。
- 不要在客户电脑放 `SUPABASE_SERVICE_ROLE_KEY`。
- 不要把 `config.json`、`.env`、日志或真实账号密码提交到 Git。

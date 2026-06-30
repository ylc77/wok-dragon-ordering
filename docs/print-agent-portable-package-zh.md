# YANLCPrintAgent Windows exe 便携版交付说明

本文档说明如何把本地打印助手打包成客户可交付的 Windows exe 便携包。客户电脑不需要整个 `wok-dragon-ordering` 项目，也不需要安装 Node.js / pnpm，只需要一个 `YANLCPrintAgent` 文件夹。

## 一、适合场景

适合餐馆前台 Windows 电脑或 Windows 平板：

- 自动监听新订单
- 自动打印厨房小票
- 支持扫码点餐订单和 POS 前台点单订单
- 打印成功后标记订单已打印，避免重复出纸
- 打印失败不标记，下一轮继续重试

注意：

- 厨房小票不是希腊税务正式发票。
- 正式税务收据仍由餐馆原来的收银机、税控 POS 或合法税务系统开具。

## 二、构建 exe 便携版

在开发电脑的项目根目录运行：

```powershell
npm run build:print-agent-package
```

生成：

```text
dist-print-agent/YANLCPrintAgent/
dist-print-agent/YANLCPrintAgent.zip
dist-print-agent/YANLCPrintAgent.zip.sha256.txt
```

正式发给客户时，优先发送：

```text
YANLCPrintAgent.zip
```

客户解压后使用里面的 `YANLCPrintAgent` 文件夹。

## 三、打包后自检

构建完成后运行：

```powershell
npm run verify:print-agent-package
```

自检会确认：

- 便携目录存在
- zip 存在
- SHA256 校验文件匹配
- `YANLCPrintAgent.exe` 存在
- 必要 `.cmd` 脚本齐全
- 没有误带 `config.json`、`.env` 或日志文件
- zip 内包含顶层 `YANLCPrintAgent/` 文件夹
- `YANLCPrintAgent.exe --help` 可以运行

## 四、便携包目录结构

```text
YANLCPrintAgent/
├── YANLCPrintAgent.exe
├── setup.cmd
├── start.cmd
├── test-print.cmd
├── list-printers.cmd
├── install-startup.cmd
├── uninstall-startup.cmd
├── config.example.json
├── README.txt
└── logs/
```

客户首次运行 `setup.cmd` 后，会在同一目录生成：

```text
config.json
```

不要把真实 `config.json` 发到公开仓库或发给无关人员。

## 五、客户电脑需要什么

当前 exe 便携版需要：

- Windows 10 / Windows 11
- 已安装 Windows 驱动的打印机
- 打印机能正常打印 Windows 测试页
- 稳定网络

客户不再需要：

- 完整 React 项目文件夹
- `src/`
- `supabase/`
- `node_modules/`
- Node.js
- pnpm
- Git
- Vercel 开发环境

## 六、复制到客户电脑

1. 构建便携包。
2. 把压缩包发给客户：

```text
dist-print-agent/YANLCPrintAgent.zip
```

3. 客户解压后会得到：

```text
YANLCPrintAgent/
```

4. 建议放到客户电脑固定位置，例如：

```text
C:\YANLCPrintAgent\
```

不要放在临时下载目录，也不要经常移动文件夹。安装开机自启后，如果移动文件夹，需要重新运行 `install-startup.cmd`。

如果远程传输文件时担心压缩包损坏，可以同时发送：

```text
YANLCPrintAgent.zip.sha256.txt
```

维护人员可以用校验值确认压缩包是否完整。

## 七、客户首次配置

进入 `YANLCPrintAgent` 文件夹，双击：

```text
setup.cmd
```

会打开本地浏览器设置页面，按页面填写：

- Supabase URL
- Supabase publishable key
- 后台管理员邮箱
- 后台管理员密码
- 打印机名称，可留空使用 Windows 默认打印机
- 纸宽，默认 80
- 是否自动打印，默认 true

配置会保存到：

```text
config.json
```

## 八、测试打印

双击：

```text
test-print.cmd
```

确认：

- 打印机出纸
- 小票宽度正常
- 内容清晰
- 没有明显乱码

如果不出纸，先检查：

- Windows 测试页是否能打印
- 打印机是否有纸
- 打印机名称是否正确
- `config.json` 是否填写完整

## 九、启动自动打印

双击：

```text
start.cmd
```

注意：

- 这个窗口必须保持打开。
- 关闭窗口后不会继续自动打印。
- 电脑关机后不会继续自动打印。
- 打印失败会记录日志，并在下一轮继续重试。

## 十、设置开机自启

双击：

```text
install-startup.cmd
```

它会把启动快捷方式放到 Windows 开机启动目录。

取消开机自启：

```text
uninstall-startup.cmd
```

## 十一、查看日志

日志目录：

```text
logs/
```

主要日志文件：

```text
logs/print-agent.log
```

排查问题时可以查看是否：

- 成功启动
- 后台账号登录成功
- 发现待打印订单
- 打印成功
- 标记订单已打印
- 打印失败并等待重试

## 十二、安全说明

- 便携包不包含 service role key。
- 只使用 Supabase publishable key。
- 使用后台 staff/admin 账号登录读取订单。
- 不要提交或公开 `config.json`。
- 不要提交或公开日志中的敏感信息。
- `config.example.json` 只能放示例值。

## 十三、正式安装包版

当前项目也支持正式安装包版。构建命令：

```powershell
npm run build:print-agent-installer
```

输出：

```text
dist-print-agent/YANLCPrintAgentSetup.exe
```

安装包版支持：

- 安装到 `C:\Program Files\YANLCPrintAgent\`
- 自动创建桌面快捷方式
- 自动创建开机自启
- 提供卸载入口

安装包详细说明见：

```text
docs/print-agent-windows-installer-zh.md
```

后续仍可继续增强：

- 图形化配置界面
- 打印状态面板
- 手动重打功能
- 多打印机分流

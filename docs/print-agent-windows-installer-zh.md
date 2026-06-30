# YANLCPrintAgent Windows 安装包版说明

本文档用于正式安装包版 `YANLCPrintAgentSetup.exe` 的构建、安装和客户交付。

## 一、安装包适合什么场景

安装包版适合正式交付餐馆客户：

- 客户电脑不需要完整项目文件夹
- 客户电脑不需要 Node.js
- 客户电脑不需要 pnpm
- 客户不需要打开终端
- 双击安装包即可安装
- 安装后有桌面快捷方式和开始菜单入口
- 设置入口会打开本地浏览器配置界面
- 配置和日志保存到 ProgramData，避免 Program Files 无写入权限问题

厨房小票用于厨房制作和前台核对，不是希腊税务正式发票。正式税务收据仍由餐馆原收银机、税控 POS 或合法税务系统开具。

## 二、构建安装包

在开发电脑项目根目录运行：

```powershell
npm run build:print-agent-installer
```

生成：

```text
dist-print-agent/YANLCPrintAgentSetup.exe
```

构建过程会先生成便携版：

```text
dist-print-agent/YANLCPrintAgent/YANLCPrintAgent.exe
dist-print-agent/YANLCPrintAgent.zip
```

然后使用 Inno Setup 生成正式安装包。

## 三、构建后自检

运行：

```powershell
npm run verify:print-agent-installer
```

自检会确认：

- 安装包 exe 存在
- 便携版 exe 仍然存在
- 便携 zip 仍然存在
- Inno Setup 安装器配置存在
- 安装器文档存在
- 安装器配置包含必要快捷方式和卸载逻辑
- 没有在配置或文档中写入真实密钥

## 四、客户安装前准备

客户现场先确认：

1. Windows 10 或 Windows 11。
2. 打印机驱动已安装。
3. Windows 测试页可以正常打印。
4. 前台电脑网络稳定。
5. 已准备好后台管理员邮箱和密码。
6. 已准备好 Supabase URL 和 Supabase publishable key。

客户电脑不需要安装 Node.js / pnpm。

## 五、安装步骤

1. 双击：

```text
YANLCPrintAgentSetup.exe
```

2. 按安装向导完成安装。
3. 默认安装到：

```text
C:\Program Files\YANLCPrintAgent\
```

4. 安装完成页默认提供“运行配置向导”。
5. 浏览器会打开本地配置界面。

配置页面地址类似：

```text
http://127.0.0.1:xxxxx
```

这个页面只在当前电脑本机使用，不是公开网站。

## 六、配置和日志位置

安装包版不把配置写到 Program Files。

配置文件保存到：

```text
C:\ProgramData\YANLCPrintAgent\config.json
```

日志保存到：

```text
C:\ProgramData\YANLCPrintAgent\logs\print-agent.log
```

如果目录不存在，程序会自动创建。

卸载程序默认不会删除 ProgramData 中的配置和日志，避免误删客户配置。若客户要彻底删除，可手动删除：

```text
C:\ProgramData\YANLCPrintAgent\
```

## 七、快捷方式

安装包会创建桌面快捷方式：

- `YANLC 打印助手`：启动自动打印

开始菜单会创建：

- `YANLC 打印助手`：启动自动打印
- `YANLC 打印助手设置`：打开本地浏览器配置界面
- `YANLC 测试打印`：打印测试小票
- `YANLC 查看打印机`：列出 Windows 打印机
- `取消开机自启`：取消自动开机启动

## 八、第一次配置

从开始菜单打开：

```text
YANLC 打印助手设置
```

或在安装完成页勾选“运行配置向导”。

本地配置页面可以填写：

- Supabase URL
- Supabase publishable key
- 后台管理员邮箱
- 后台管理员密码
- 打印机名称，可选择 Windows 默认打印机
- 纸宽，默认 80
- 自动打印开关
- 轮询间隔
- 每轮最多处理订单数

页面中也提供：

- 保存配置
- 测试打印
- 设置开机自启
- 取消开机自启

如果浏览器配置界面无法打开，仍可使用命令行备用方式：

```powershell
YANLCPrintAgent.exe --setup
```

## 九、测试打印

从开始菜单打开：

```text
YANLC 测试打印
```

或在本地配置页面点击“测试打印”。

确认：

- 打印机出纸
- 小票宽度正常
- 内容清晰
- 没有明显乱码

如果测试打印失败，先检查 Windows 测试页是否能打印。

## 十、启动自动打印

双击桌面快捷方式：

```text
YANLC 打印助手
```

注意：

- 自动打印窗口需要保持打开。
- 关闭窗口后不会继续自动打印。
- 电脑关机后不会继续自动打印。
- 打印失败会记录日志，并在下一轮继续重试。

## 十一、开机自启

第一版安装包不默认开启开机自启。

可以在本地配置页面点击“设置开机自启”。

也可以运行：

```powershell
YANLCPrintAgent.exe --install-startup
```

取消开机自启：

```powershell
YANLCPrintAgent.exe --uninstall-startup
```

也可以从本地配置页面或开始菜单点击“取消开机自启”。

## 十二、卸载

在 Windows 设置里卸载：

```text
YANLC Print Agent
```

卸载会：

- 删除 Program Files 中的程序文件
- 删除桌面和开始菜单快捷方式
- 尝试取消开机自启
- 保留 ProgramData 中的 `config.json` 和日志

如需彻底清理，手动删除：

```text
C:\ProgramData\YANLCPrintAgent\
```

## 十三、常见问题

### 1. 配置页面打不开

可以重新从开始菜单打开 `YANLC 打印助手设置`。

如果仍无法打开，可以使用备用命令：

```powershell
YANLCPrintAgent.exe --setup
```

### 2. 安装后配置保存失败

确认程序是否使用安装包版。安装包版会写入：

```text
C:\ProgramData\YANLCPrintAgent\config.json
```

不要手动把配置写到 Program Files。

### 3. 打印助手没有自动打印

检查：

- 打印助手窗口是否打开
- 网络是否正常
- 后台账号密码是否正确
- 自动打印是否开启
- 后台是否有新订单
- 日志里是否有错误

### 4. 打印机不出纸

检查：

- 打印机是否开机
- 打印机是否有纸
- Windows 测试页是否可打印
- 打印机名称是否和 Windows 打印机列表一致

### 5. 卸载后配置还在

这是正常设计。为了避免误删客户配置，卸载默认保留：

```text
C:\ProgramData\YANLCPrintAgent\
```

如需彻底删除，可手动删除该目录。

## 十四、安全说明

- 安装包不包含 service role key。
- 安装包不包含真实 Supabase URL / key。
- 安装包不包含真实后台账号密码。
- 安装包不包含 `config.json`。
- 安装包不包含 `.env`、`.env.local`。
- 安装包不包含源码项目和 `node_modules`。
- `config.example.json` 只能放示例值。

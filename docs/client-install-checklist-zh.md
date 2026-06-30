# 客户现场安装检查清单

本文档用于现场给餐馆客户安装系统时逐项检查。建议安装人员按顺序执行，并在交付前逐项确认。

## 一、现场设备要求

前台设备建议：

- Windows 10 / Windows 11 电脑
- Windows 平板或 Windows 小主机
- 稳定网络
- 能长期开机
- 已安装 Node.js / pnpm，或由安装人员提前打包好运行环境

打印机建议：

- 58mm 或 80mm 热敏打印机
- USB 或网口打印机都可以
- 必须先在 Windows 里安装好驱动
- 必须能打印 Windows 测试页

暂不建议第一版使用：

- iPad 自动打印
- 安卓平板自动打印
- 蓝牙小票机
- 未安装 Windows 驱动的打印机

## 二、打印机检查

1. 连接打印机电源和数据线。
2. 打开 Windows 设置里的“打印机和扫描仪”。
3. 确认能看到目标打印机。
4. 右键或进入打印机设置，打印 Windows 测试页。
5. 如果测试页不能打印，先处理驱动、纸张、连接或默认打印机问题。

记录：

- 打印机名称：
- 纸宽：58mm / 80mm
- 是否设为默认打印机：是 / 否

## 三、Supabase / Vercel 确认

上线前确认：

- [ ] 已创建客户独立 Supabase 项目
- [ ] 新客户只执行过 `supabase/client-init.sql`
- [ ] 没有执行 `supabase/schema.sql`
- [ ] Storage bucket 已创建，菜单图片可公开读取
- [ ] Vercel 项目已部署
- [ ] Vercel 环境变量已配置

Vercel 环境变量：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
DEEPSEEK_API_KEY（可选）
```

不要配置：

```text
SUPABASE_SERVICE_ROLE_KEY
```

## 四、后台账号确认

1. 在 Supabase Authentication 里创建后台账号。
2. 在 `profiles` 表里设置角色为 `admin` 或 `staff`。
3. 使用浏览器打开 `/admin`。
4. 确认后台账号可以登录。
5. 确认至少能看到：
   - 订单管理
   - 菜品管理
   - 菜单分类
   - 桌台 / 二维码
   - 餐馆设置
   - 前台点单 POS

## 五、打印助手 setup

在项目目录打开终端，运行：

```powershell
pnpm print-agent -- --setup
```

按提示填写：

- Supabase URL
- Supabase publishable key
- 后台管理员邮箱
- 后台管理员密码
- 打印机名称，留空表示使用 Windows 默认打印机
- 纸宽，默认 80
- 是否自动打印，默认 true

完成后会生成：

```text
print-agent/config.json
```

这个文件只留在客户本地电脑，不要提交到 Git。

## 六、测试打印

运行：

```powershell
pnpm print-agent -- --test-print
```

确认：

- [ ] 打印机出纸
- [ ] 小票宽度正常
- [ ] 中文或英文内容可读
- [ ] 没有明显乱码
- [ ] 打印位置没有严重偏移

如果不出纸：

- 检查 Windows 测试页是否能打印
- 检查打印机是否在线
- 检查 `config.json` 里的打印机名称是否正确
- 打印机名称不确定时，先留空使用默认打印机

## 七、启动自动打印

运行：

```powershell
pnpm print-agent
```

注意：

- 这个窗口需要保持打开。
- 窗口关闭后，不会继续自动打印。
- 电脑关机后，也不会继续自动打印。

## 八、设置开机自启

如果客户希望前台电脑开机后自动启动打印助手，运行：

```powershell
pnpm print-agent -- --install-startup
```

然后重启电脑测试：

- [ ] 开机后打印助手自动启动
- [ ] 登录后台或新订单产生后能正常打印

## 九、点餐流程现场测试

建议使用真实手机测试：

- [ ] 首页能打开
- [ ] `/menu` 公开菜单能打开
- [ ] 扫桌台二维码能进入点餐页
- [ ] 可以点击“开始点餐”
- [ ] 可以选择菜品和口味
- [ ] 可以提交订单
- [ ] 后台订单列表出现新订单
- [ ] 厨房小票自动打印
- [ ] 后台确认收款正常
- [ ] 清桌后旧手机不能继续向旧 session 下单
- [ ] 新顾客重新扫码能进入新点餐流程

## 十、常见问题排查

### 1. 打印助手启动后没有打印

- 确认终端窗口没有关闭
- 确认 `AUTO_PRINT` 或 setup 里的 Auto print 为 true
- 确认订单状态是待处理
- 确认订单还没有被标记为已打印
- 查看日志：`print-agent/logs/print-agent.log`

### 2. 登录失败

- 检查后台邮箱和密码是否正确
- 检查该账号是否在 `profiles` 中设置为 admin 或 staff
- 检查 Supabase URL 和 publishable key 是否属于同一个项目

### 3. 打印乱码或格式不对

- 先确认 Windows 测试页正常
- 尝试换 80mm 纸宽
- 尝试使用英文菜名作为厨房小票主显示
- 若打印机对中文兼容差，需要后续做 ESC/POS 或图片打印适配

### 4. 顾客扫码打不开

- 检查二维码链接是否是当前线上域名
- 检查桌台是否启用
- 检查二维码是否已被重生成
- 检查手机网络

### 5. 后台看不到订单

- 刷新后台订单列表
- 检查 Supabase 连接
- 检查是否登录了正确项目的后台账号
- 检查订单是否被归档或筛选条件隐藏

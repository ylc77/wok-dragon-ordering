# 客户法律页面信息确认清单

本项目包含基础法律页面模板。它不能替代律师、会计师或当地合规专业人士的正式意见。

每个客户上线前，请确认并填写以下信息。

## 一、商家身份信息

- [ ] 商家展示名称 `businessName`
- [ ] 法律主体名称 `legalName`
- [ ] 营业地址 `businessAddress`
- [ ] VAT / AFM 税号 `vatNumber`
- [ ] GEMI 注册号 `gemiNumber`
- [ ] 所在国家 `country`
- [ ] 联系电话 `phone`
- [ ] 联系邮箱 `contactEmail`

## 二、数据控制者信息

- [ ] 数据控制者名称 `dataControllerName`
- [ ] 数据控制者地址 `dataControllerAddress`
- [ ] 确认由谁处理客户隐私相关请求
- [ ] 确认客户如何申请更正或删除个人信息，如当地法律允许

## 三、第三方服务商

只填写该客户实际启用的服务。没有启用的服务不要写进法律页面。

- [ ] 数据处理服务商 `dataProcessors`，例如实际使用 Supabase、Vercel 时再填写
- [ ] 支付服务商 `paymentProviders`，例如现金、刷卡机、Viva、Stripe 或其他实际启用的支付服务
- [ ] 分析或错误监控服务 `analyticsProviders`，例如实际使用 PostHog、Sentry 时再填写
- [ ] AI 服务商 `aiProviders`，例如实际使用 DeepSeek、OpenAI 时再填写
- [ ] 确认非必要 Cookie 在用户同意前不会加载

## 四、数据保留和日常运营

- [ ] 数据保留说明 `dataRetention`
- [ ] 最后更新时间 `lastUpdated`
- [ ] 确认订单记录需要保留多久
- [ ] 确认图片上传和存储的使用方式
- [ ] 确认员工 / 管理员账号权限和责任

## 五、餐馆项目需要确认的内容

- [ ] 订单条款 `Order Terms`
- [ ] 取消订单规则 `Cancellation Policy`
- [ ] 付款规则 `Payment Terms`
- [ ] 过敏原 / 菜品供应变动免责声明
- [ ] 确认厨房小票不是正式税务发票
- [ ] 确认正式收据仍由餐馆原收银机、税控 POS 或会计流程开具

## 六、服装 / 零售项目预留内容

- [ ] 配送政策 `Shipping Policy`
- [ ] 退货政策 `Return Policy`
- [ ] 退款政策 `Refund Policy`
- [ ] 14 天撤回权说明
- [ ] 退货地址和退货运费责任
- [ ] 不支持退换的商品，例如卫生用品、定制商品、特价商品等

## 七、页脚链接和表单提示

- [ ] 公开页面底部能看到法律页面链接
- [ ] Privacy Policy 链接可打开
- [ ] Terms of Service 链接可打开
- [ ] Cookie Policy 链接可打开
- [ ] Contact 链接可打开
- [ ] Refund Policy 或 Cancellation Policy 链接可打开
- [ ] 客户提交信息的表单旁边有同意条款提示

## 八、客户最终确认

- [ ] 客户已确认商家身份信息
- [ ] 客户已确认付款相关文案
- [ ] 客户已确认配送 / 取消 / 退款相关文案
- [ ] 客户已确认实际启用的第三方服务
- [ ] 客户已知晓这些页面是基础法律页面模板，不是完整定制法律审查


# 电商主图 MVP：最小安全积分系统

## 已检查与复用
2026-10-09 检查 zhuco/SkuUtils main。原项目 React 19 + TypeScript + Vite + Ant Design；`src/app/App.tsx` 的中文配置、绿色主题可复用，原有错误边界可用于进一步整合。`src/db/appDb.ts` 使用 Dexie/IndexedDB，适合本地商品草稿，不参与账户、积分、充值。原 Rust 是桌面计算器，不是账户服务。当前工作区起初为空，可访问仓库列表未发现明确主图项目；无法判断用户电脑上尚未推送的代码。

新增模块独立在 image-mvp/，避免改变 SKU 计算器。后端 Express + Node 24 内置 SQLite，前端继续 React/TypeScript/Ant Design。一个 Node 进程、一个本地持久化数据库，无 Redis、支付网关或外部身份服务。适合小规模邀请体验。

## 启动
```bash
cd image-mvp
npm ci
cp .env.example .env
npm run admin -- invite 朋友姓名
npm run dev
# 另一个终端
npm start
```
浏览器访问 http://localhost:5173；注册需要邀请码，密码至少12位。每个邀请绑定一次账户创建与50点奖励，邮箱统一小写唯一。管理员不要为同一朋友重复发邀请码。邀请码仅输出一次明文，数据库保存 SHA256；不要在公共渠道发布。

## 模型配置
在服务端 .env 配置 IMAGE_ENDPOINT（完整 HTTPS /images/generations URL）、IMAGE_MODEL、IMAGE_API_KEY。无需 VITE_ 变量。当前适配器仅支持 OpenAI-compatible JSON 请求、n=1、1024x1024、b64_json PNG；具体中转站须先核对该协议。没有模型凭据时任务明确失败、返还1点。尚未配置真实模型密钥或执行收费生成。

此版本提供文本提示词出图与账户积分演示；商品参考图上传/图生图、商用主图质量、对象存储和更完整的设计工作台不在本模块范围。接入图生图时扩展服务端参数与适配器，仍须统一调用 reserve/finish，禁止直接从浏览器调用模型。

## 安全与一致性
- users、sessions、invites、jobs、ledger 均在服务端；前端 me.balance 仅展示。Cookie 随机32字节，数据库仅存哈希，HttpOnly/SameSite=Strict，生产 Secure，7天过期。密码 scrypt 加随机盐。无用户删除与奖励领取接口，因此注销登录、清空 IndexedDB、修改浏览器余额均不能重新领积分。
- 注册、邀请消费、welcome 唯一账本记录在同一 BEGIN IMMEDIATE 事务中；积分余额 CHECK >= 0。账户不代表自然人，系统不声称识别不同邮箱背后的同一个人；邀请制由管理员控制额度发放。公开注册需另加已验证身份和防刷机制。
- 生成 POST 带 Idempotency-Key UUID，唯一约束(user_id,key)。请求参数标准化后持久化；同键同参数返回原任务，不再扣费，同键不同参数409。UI在 sessionStorage 仅保存重试键和提示词，恢复页面后可重试同一请求。该缓存被篡改不改变服务端余额。
- 创建任务、扣1点、写charge账本原子提交；不足402且全部回滚。一人最多一个 queued/processing/unknown 任务。客户端不能提交余额、金额、模型、数量、上游地址或API密钥；严格校验未知字段。
- 数据库即持久化队列，worker先claim再调用上游；成功图片与 succeeded 原子提交。明确本地失败时 failed 与 refund 原子提交，refund:job_id 唯一，重复结算不重复退款。
- 上游HTTP错误、超时、断线、异常响应均保守进入unknown；不自动退款或重试。重启后processing转unknown，queued继续。管理员核查上游确认未生成后退款，或拿回原PNG结算成功；这避免“上游已出图但本地超时”的重复生成。若未来供应商明确提供幂等与查询协议，可以增加自动对账。
- 每次图片读取和任务查询验证所有者；无公共图片链接。API不返回上游原始错误、提示词、凭据或其他用户数据。所有修改请求必须匹配APP_ORIGIN，使用JSON、同源部署，无跨域凭据开放。
- Helmet、请求体大小限制、IP限流；生产API仅监听loopback，反代不得直接暴露Node端口。默认不信任X-Forwarded-For，所有用户共享反代IP限流，朋友测试可接受；扩容时明确可信代理层数后调整，切勿随意 trust proxy=true。

## 管理员线下充值
管理仅经服务器终端/SSH，依赖操作系统账户授权，没有可公开调用的充值路由，也没有前端管理员密钥。ADMIN_ACTOR 用于审计，不是权限凭据。
```bash
npm run admin -- users
npm run admin -- recharge USER_ID 唯一收款编号 已收到9.9元
npm run admin -- unknown
# 仅确认上游没有生成后操作，必须记录核查理由
npm run admin -- refund JOB_ID 已核对上游记录未生成
# 上游实际成功则取回原图，禁止重新生成
npm run admin -- resolve-image JOB_ID /absolute/path/original.png
```
充值固定990分人民币、50点。收款编号全局唯一，相同账户重复执行不会增加点数；同编号用于另一账户409。注意编号必须对应实际收款，同一收款不能换编号重录。账本保存用户、变动、种类、编号、操作人、备注和时间；SQL触发器防止应用更新/删除账本。数据库拥有者仍具有最高权限，须限制文件访问。

## API
|接口|用途|
|---|---|
|POST /api/register|邮箱、密码、一次性邀请码；原子赠送50点|
|POST /api/login、/logout|建立/撤销服务端会话|
|GET /api/me、/ledger|真实余额和最近100笔积分记录|
|POST /api/generations|prompt + 幂等请求头，固定1张/1点，返回202任务|
|GET /api/generations、/:id|本人任务与状态|
|GET /api/generations/:id/image|本人成功PNG|

## 上线与运维
```bash
npm test
npm run build
```
生产 .env：NODE_ENV=production；APP_ORIGIN=https://实际域名；DB_PATH=/var/lib/image-mvp/credits.sqlite；配置真实模型。以普通服务账户运行单个Node进程，systemd自动重启；HTTPS反向代理整个站点到127.0.0.1:3000，静态dist由服务端托管。不使用vite preview提供生产服务。一个SQLite数据库只允许一个worker服务；不支持多副本/共享网络盘。此版本每个服务串行出图，小规模邀请测试优先。

数据库和.env权限600，目录700；备份使用SQLite在线backup或停服后复制（不可单独复制活跃主文件忽略WAL）。图片直接存BLOB，MVP减少存储一致性复杂度，定期监控磁盘并备份；量大时迁移对象存储与PostgreSQL。会话过期记录可定期清理，奖励、充值、任务及账本不能删除后重新领。缺少密码找回：朋友测试通过管理员协助，后续应加入经验证邮箱的恢复流程，不应重新注册送点。

## 验证范围
自动测试包含邀请码与邮箱重复注册、注册回滚、重复扣费/退款、余额耗尽、unknown与重启恢复、充值编号重复与跨账户冲突、不可变账本、HTTP会话/登出、来源校验、前端字段篡改、任务越权及不存在的公共充值路由。未实测实际供应商生成，上线前须用自己的测试账户完成一轮真实成功/失败/unknown对账，并确认响应协议。

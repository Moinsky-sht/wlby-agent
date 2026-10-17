# wlby-agent · 未来白杨智能体技能

连接未来白杨后，智能体可按你的账号权限、购买权益和积分使用业务功能。支持远程 MCP 时直接连接；否则由智能体自动安装本技能及随附 CLI，无需你下载文件。

## 复制给智能体

> 请帮我连接未来白杨。先提示我提供访问令牌，优先使用你的私密输入或密钥设置，不要回显；已有可用授权时直接复用。支持远程 MCP 就直接连接 https://wlbycuc.cn/api/agent/mcp（Streamable HTTP，Bearer Token），无需下载或先读 GitHub。不能直接使用 MCP 时，才按 https://github.com/Moinsky-sht/wlby-agent 的说明自动安装固定版本的技能和客户端。收到令牌后完成配置，执行一次免费连接检测，告诉我实际连接的账号；保留其他设置，需要刷新或新开任务时说明。不要预先读取全部业务能力。

在[未来白杨个人设置](https://wlbycuc.cn/profile?tab=basic)创建访问令牌，等智能体提示后提供。令牌通常有效 30 天，可命名、重命名、撤销或删除；删除后立即失效，历史日志保留。若在普通聊天中提供了令牌，智能体不应复述；优先使用宿主的私密输入。

## 智能体执行顺序

1. **取得授权**：复用本服务已有授权，或提示用户提供令牌。使用宿主私有密钥/认证位置；令牌不能进入命令参数、公开文件、产物或日志。
2. **选最短连接路径**：已连接则复用；能配置远程 MCP 就使用上面的唯一地址，不安装 CLI。不能直接使用 MCP、但能执行脚本和联网时，才执行下方自动安装。只接受 OAuth 且不能执行脚本的宿主目前无法接入。
3. **检测一次**：调用 `connection.status`，收到当前账号后才报告成功。保存配置、下载文件或安装 npm 包均不代表连接成功；如宿主必须刷新或新开任务才能加载，明确告诉用户。已有可用业务工具时直接使用，不为每次操作重新登录或检测。

功能由服务器动态提供：已知工具与参数直接调用；不确定时按需搜索、读取具体用法，不预读完整仓库或全部工具。业务权限、购买权益、积分、真实用户确认和日志由服务器统一执行。

<details>
<summary>自动安装技能与 CLI（仅不能直接使用 MCP 时）</summary>

以下步骤由智能体在实际执行任务的电脑或云电脑完成，手机只负责遥控。不要让用户下载、上传或搬运文件。

1. 检查脚本执行、网络和 Node.js 22+。已有环境直接使用；缺少时按下方说明装到用户目录。
2. 下载 [v0.1.1 Release](https://github.com/Moinsky-sht/wlby-agent/releases/tag/v0.1.1) 的 `wlby-agent-0.1.1.zip` 与 `SHA256SUMS`，校验 SHA256 后解压。GitHub 无法访问时，从[官网制品索引](https://wlbycuc.cn/integrations/wlby-agent/release.json)获取同一固定版本的 ZIP 与摘要。不要执行未固定版本的远程安装脚本。
3. 按宿主支持的技能导入/创建机制注册，保留 `SKILL.md` 和 `scripts/wlby-agent.mjs`。没有自动注册能力时，可在当前任务读取本技能并使用 CLI，但必须说明尚未持久注册。只改本技能配置；更新前保留已有本地修改，不覆盖其他技能或凭据。
4. 优先使用私有密钥环境变量 `WLBY_AGENT_TOKEN`，再运行一次 `node scripts/wlby-agent.mjs doctor`。也可用 `node scripts/wlby-agent.mjs auth login` 隐藏输入；该命令已检测连接，成功后不必再运行 `doctor`。无交互环境支持 `auth login --stdin`，秘密须通过受保护的标准输入传入，不能拼进 `echo` 或其他命令参数。

CLI 私有授权文件默认位于用户目录 `.config/wlby-agent/credentials.json`（目录 700、文件 600；Windows 保持用户私有 ACL）。宿主有私有持久目录时可设置 `WLBY_AGENT_HOME`，不能指向共享项目或产物目录。环境变量优先于本地文件。

新任务只需确认原连接/技能和授权仍可用，不重复安装。临时云环境销毁后可能需要重新安装和授权；没有脚本执行或网络能力的纯聊天环境不能仅靠提示词完成接入。

### 缺少 Node.js

从 [Node.js 官方下载](https://nodejs.org/en/download)选择当前系统/架构的受支持 LTS 压缩包及该版本 `SHASUMS256.txt`，校验后解压到用户私有工具目录。Linux/macOS 使用其中 `bin/node`、Windows 使用 `node.exe` 的绝对路径；不使用 sudo、不改系统 PATH。宿主不允许下载或执行时说明限制，不绕过策略。

</details>

<details>
<summary>高级 MCP 配置（手动配置时展开）</summary>

优先将下面配置填入宿主的**私有 MCP 设置**，把占位符替换成访问令牌，不把含真实令牌的配置发到聊天、仓库或共享文件。字段以宿主支持的格式为准；只需填写 URL 的界面使用同一地址和 Bearer Token 即可。

```json
{
  "mcpServers": {
    "wlby-agent": {
      "url": "https://wlbycuc.cn/api/agent/mcp",
      "headers": { "Authorization": "Bearer <你的访问令牌>" }
    }
  }
}
```

只新增本服务配置，保留其他服务器；已有同名但地址不同的配置时先报告冲突。保存后由宿主加载，再运行免费连接检测。

**只支持 command/args 时**，可使用固定版本桥接。将环境变量中的占位符填在宿主私有设置，真实凭据不会写入命令参数：

```json
{
  "mcpServers": {
    "wlby-agent": {
      "command": "npx",
      "args": ["-y", "mcp-remote@0.15.1", "https://wlbycuc.cn/api/agent/mcp", "--transport", "http-only", "--header", "Authorization:${WLBY_MCP_AUTHORIZATION}"],
      "env": { "WLBY_MCP_AUTHORIZATION": "Bearer <你的访问令牌>" }
    }
  }
}
```

此路径需要 Node.js/npm 和联网下载桥接依赖。已经安装含依赖的 `wlby-agent` npm 包时也可使用 `wlby-agent mcp`；GitHub Skill ZIP 本身不含桥接依赖，直接使用 CLI 无需安装依赖或启动 MCP 进程。普通 HTTP/MCP 接入不需要飞书或 WebSocket。

</details>

<details>
<summary>CLI 调用、更新与维护</summary>

以下命令在技能目录运行，其他目录使用脚本绝对路径。名称、参数已知时直接调用；仅在不熟悉业务时搜索和查看用法：

```sh
node scripts/wlby-agent.mjs search "用户需求关键词"
node scripts/wlby-agent.mjs describe <返回的能力名称>
node scripts/wlby-agent.mjs call <能力名称> --input params.json
```

`--input -` 支持从标准输入读取 JSON。服务器要求确认时展示确认链接及影响，等待真实用户处理；不代用户访问站内确认接口。写入失败不盲目重试，同一操作按服务器用法复用返回的 `requestId`（`--request-id`），不改变参数或扩大名单。

上传先读取获授权任务的服务器指南，再使用 `upload <文件路径> --grant <任务编号>`；文件直接上传，不进入模型上下文。提交、审核、发布仍分别遵守原权限。无权限、无购买权益或积分不足时说明原因，不换入口绕过。

- 更新：安装已校验的固定版本，不静默追随 main，不覆盖本地修改或授权。
- 退出：`auth logout` 只移除本设备保存的授权；使所有设备失效须在网站撤销令牌。重命名不更换令牌。
- 卸载：通过宿主移除本技能，按原方式卸载可选 npm 包；不清理其他配置。
- 发布：Node.js 22+，运行 `npm ci --ignore-scripts`、`npm test`。`npm run release:bundle` 生成白名单 ZIP、摘要与版本索引（打包需 Python 3，使用技能不需 Python）。GitHub Release 可独立分发；npm 是可选渠道，未确认发布的版本不提供 npx 安装命令。

MIT License。客户端开源不包含服务端业务源码、用户资料或内容授权。

</details>

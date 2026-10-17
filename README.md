# wlby-agent · 未来白杨智能体技能

安装的是一个包含轻量 CLI 的技能包：`SKILL.md` 告诉智能体如何使用，`scripts/wlby-agent.mjs` 执行请求。CLI 和 MCP 均复用未来白杨服务器的权限、购买权益、积分、真实用户确认与操作日志。

## 发给智能体的安装提示词

> 请阅读 https://github.com/Moinsky-sht/wlby-agent 的通用接入说明，帮我连接未来白杨。优先复用已有连接；若当前环境支持配置远程 MCP，优先使用 https://wlbycuc.cn/api/agent/mcp。否则在实际执行任务的电脑或云电脑上自动下载、校验并安装 wlby-agent 技能及随附客户端，不要让我手动下载或搬运文件。保留其他配置，引导我通过私有方式配置访问令牌，最后执行免费连接检测。不要回显令牌；需要刷新或新开任务时明确提示，不把下载或保存配置当作连接成功。

## 通用接入顺序（供智能体执行）

先选择当前环境能实际使用的最短路径，不先下载所有东西：

1. 已有可用未来白杨连接时，通过 `connection.status` 免费验证后复用，不重复安装或覆盖配置。
2. 支持远程 MCP 且可配置时，优先使用唯一地址 `https://wlbycuc.cn/api/agent/mcp`，采用 Streamable HTTP 和 Bearer Token。只新增或更新名为 wlby-agent 的配置，保留其他服务器与用户设置；已有同名但不同地址的配置先报告冲突，不静默替换。使用宿主的私有认证机制，不能把真实 Token 放入公开配置或任务产物。宿主需要刷新或新开任务时明确提示；保存配置不能冒充当前会话已能调用。
3. 只支持 command/args 时，可采用本文 npm/stdio 配置，按下面流程准备运行环境与私有授权。只有 npm 中确实存在指定版本时才使用 npx；不能将任意命令写进 MCP 配置。
4. 没有 MCP 配置能力、但允许脚本执行与联网时，按下面流程自动安装 Skill 与随附 CLI，直接调用现有 HTTP 能力。不要求用户下载、上传或搬运文件。
5. 既无法使用 MCP 又不能执行脚本的宿主，说明不支持的条件，不声称仅靠提示词已接入。只接受 OAuth、不支持本服务 Bearer 授权且无脚本能力的宿主也不能保证接入；本包不提供 OAuth。

不把各产品的内部目录写死在本包，不为不同品牌复制教程。MCP 配置 JSON 的字段由宿主决定，下面是常见格式模板；支持直接填写 URL 的界面只需地址和私有 Token。

## 自动安装流程（仅在需要客户端时执行）

1. **检查环境**：需要执行命令、写入自己的用户目录、访问 `https://wlbycuc.cn`，以及 Node.js 22 或更高版本。先运行 `node --version`。没有执行能力或外网被禁用时明确报告缺少能力，不声称已连接。手机遥控时安装到真正执行任务的云电脑，而不是手机。
2. **下载固定版本**：从 [v0.1.0 Release](https://github.com/Moinsky-sht/wlby-agent/releases/tag/v0.1.0) 下载 `wlby-agent-0.1.0.zip` 与 `SHA256SUMS` 并核验 SHA256；GitHub 不可访问时由智能体从 [官方备用制品目录](https://wlbycuc.cn/integrations/wlby-agent/release.json) 取得同版 ZIP 地址和摘要。不要读取仓库外的凭据、下载未固定的远程脚本后直接执行，或用 sudo 修改全局环境。
3. **安装技能**：通过当前宿主支持的“导入技能包／创建技能”机制安装该 ZIP，确认 `SKILL.md` 与 `scripts/wlby-agent.mjs` 一同保留。也可使用宿主支持的持久化技能目录；不猜测或重写所有智能体配置。由智能体完成下载、校验、解压与宿主注册，不要求用户下载或搬运文件。若宿主无法自动注册，可在本任务中读取 SKILL.md 并使用随附客户端，明确尚未持久注册；宿主禁止执行或联网时停止并说明限制。重复安装只更新同名技能包，不改用户凭据或其他技能；有本地修改时先保留副本。
4. **授权**：在未来白杨个人设置创建并命名访问令牌。优先配置宿主私有密钥 `WLBY_AGENT_TOKEN`；无密钥入口时可使用客户端私有授权文件。不要回显 Token，不把它写进安装提示词、命令参数、仓库、共享文件或产物。
5. **验证**：在技能目录运行 `node scripts/wlby-agent.mjs doctor`。只有服务器成功返回当前账号，才能报告连接成功；另行确认宿主是否已注册技能。新任务或重启后再验证一次，区分持久安装与仅本任务有效。

### 缺少 Node.js 时

优先使用宿主已有 Node.js 22+；无须重复安装。只能安装到自己的私有工具目录，不修改系统 PATH、其他工具或全局配置。

- Linux/macOS：从 [Node.js 官方下载](https://nodejs.org/en/download) 选择当前系统、架构的受支持 LTS 压缩包，同时获取该版本 `SHASUMS256.txt`，验证摘要后解压至用户工具目录，使用其中 `bin/node` 的绝对路径。
- Windows：从同一官方来源选择 Windows ZIP，核验摘要后解压至用户工具目录，使用其中 `node.exe` 的绝对路径。

宿主禁止下载或执行时停止并说明原因。不要绕过组织策略或静默申请管理员权限。后续使用安装后的 Node 绝对路径，不依赖某个终端临时 PATH 能传到下一任务。

## 授权与调用

本地隐藏输入（不显示输入内容）：

```sh
node scripts/wlby-agent.mjs auth login
node scripts/wlby-agent.mjs doctor
```

云端优先通过密钥环境变量 `WLBY_AGENT_TOKEN` 授权，配置后直接运行 `doctor`。也可将秘密通过标准输入传入 `auth login --stdin`，不要使用包含真实 Token 的 `echo ...` 命令或命令行参数。私有文件默认在用户目录 `.config/wlby-agent/credentials.json`，目录权限 700、文件权限 600；Windows 还须保持当前用户目录的私有 ACL。可用 `WLBY_AGENT_HOME` 指定宿主认可的私有持久目录，不能设成共享项目或产物目录。

环境变量优先于本地授权文件。Token 通常有效 30 天，权限与购买权益由服务器实时检查。`auth logout` 只移除此设备保存的授权；需要所有设备立即失效时到网站撤销。重命名不更换 Token。没有用户指令时不轮换、创建或撤销授权。

先查服务器用法，再办理不熟悉的业务：

```sh
node scripts/wlby-agent.mjs search "最近答题"
node scripts/wlby-agent.mjs describe learning.recentAnswers
node scripts/wlby-agent.mjs call learning.recentAnswers --input params.json
```

名称和参数已知时直接 `call`，不强制先搜索。返回 JSON；需要用户确认时展示服务器返回的链接，不执行站内确认接口。网络错误包含 `requestId`；重试同一请求使用 `--request-id`，不要盲目重试或改变参数。余额不足和无权限不是网络错误，不能换入口绕过。

上传使用限定任务会话，文件不经过模型上下文：

```sh
node scripts/wlby-agent.mjs upload ./制作成果.mp3 --grant 授权任务编号
```

以服务器当前制作指南为准。教师提交进入待审核流程，不能因此直接发布。全部调用沿用网站积分规则，并进入智能体日志。

## npm 与 MCP（可选）

**以 npm 实际存在的发布版本为准。** GitHub 技能 ZIP 独立可用，不依赖 npm 发布。版本发布后可运行 `npx -y wlby-agent@0.1.0 doctor` 等同名命令；npm 安装不等于宿主已注册 Skill，仍需上述技能安装步骤。

支持远程 MCP 时无需安装 CLI，常见配置如下（在宿主私有设置替换令牌占位符）：

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

唯一地址为 `https://wlbycuc.cn/api/agent/mcp`，使用 Bearer Token。只接受 command/args 的客户端可在完成私有授权后使用：

```json
{
  "mcpServers": {
    "wlby-agent": {
      "command": "npx",
      "args": ["-y", "wlby-agent@0.1.0", "mcp"]
    }
  }
}
```

stdio 仅在 npm 包及其依赖安装后可用，复用固定版本 `mcp-remote@0.15.1`；不自行实现另一套 MCP。凭据通过私有环境传入桥接子进程，不进入参数。技能直接调用 HTTP 不需启动 MCP 进程，也不需保持 WebSocket 长连接。

## 更新、卸载与持久性

- 按原方式安装已校验的新版本，不静默追随 main 或自动覆盖本地修改。更新技能不变更授权文件。
- 卸载通过宿主技能管理移除本技能；需要时执行 `auth logout`，再按原方式卸载 npm 包。不要清理其他技能、配置或共享缓存。
- 云环境销毁后，本地文件与授权可能消失。优先采用宿主持久化技能与密钥机制；没有时只能承诺当前任务可用，下次重新安装和授权。
- 没有执行和联网能力的纯聊天产品，不能仅靠导入文字技能获得后台调用能力。

## 开发与发布

Node.js 22+；运行 `npm ci --ignore-scripts`、`npm test`。Linux/macOS 上执行 `npm run release:bundle`（打 ZIP 需 Python 3，用户运行技能不需 Python）。发布包只含公共客户端、技能和说明；不包含业务源码、资料、账号或密钥。npm 发布需要维护者登录，未发布版本不能宣传成已可安装。

MIT License。服务端能力、账号权益及内容授权不随客户端开源。

#!/usr/bin/env node
// The same dependency-free HTTP client ships inside the Skill ZIP and the npm package.
// Only the optional stdio bridge loads the pinned mcp-remote dependency.
import * as fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const VERSION = '0.1.0'
export const MCP_URL = 'https://wlbycuc.cn/api/agent/mcp'
const tokenPattern = /^wlby_a_[a-f0-9]{16}_[A-Za-z0-9_-]{43}$/
const maxResponseBytes = 32 * 1024 * 1024
export class ClientError extends Error {
  constructor(code, message, status = 0, requestId) {
    super(message)
    Object.assign(this, { code, status, requestId })
  }
}
const fail = (code, message) => { throw new ClientError(code, message) }
export function safeText(value) {
  return String(value).replace(/wlby_a_[a-f0-9]{16}_[A-Za-z0-9_-]{43}/g, '[已隐藏令牌]')
    .replace(/Bearer\s+[^\s"<>]+/gi, 'Bearer [已隐藏]').slice(0, 1000)
}
export function serverUrl(value = MCP_URL) {
  let u
  try { u = new URL(value) } catch { fail('INVALID_SERVER', '服务器地址无效') }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)
  if (u.username || u.password || u.search || u.hash ||
    !['/', '/api/agent/mcp'].includes(u.pathname) ||
    (!local && (u.origin !== 'https://wlbycuc.cn')) ||
    (local && !['http:', 'https:'].includes(u.protocol)))
    fail('INVALID_SERVER', '只允许未来白杨 HTTPS 地址或本机隔离验收地址')
  u.pathname = '/api/agent/mcp'
  return u
}
export function options(argv) {
  const flags = {}, positional = []
  const booleans = new Set(['stdin', 'homepage', 'help', 'version'])
  const values = new Set(['server', 'input', 'json', 'request-id', 'grant', 'mime', 'limit', 'timeout'])
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) { positional.push(arg); continue }
    const key = arg.slice(2)
    if (booleans.has(key)) flags[key] = true
    else if (values.has(key) && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) flags[key] = argv[++i]
    else fail('INVALID_ARGUMENTS', `未知或缺值的选项：${key === 'token' ? '请通过隐藏输入、标准输入或密钥环境变量授权' : safeText(key)}`)
  }
  return { flags, positional }
}
function home(env) {
  return path.resolve(env.WLBY_AGENT_HOME || path.join(os.homedir(), '.config', 'wlby-agent'))
}
async function readCredentials(env) {
  try {
    const file = path.join(home(env), 'credentials.json')
    const info = await fs.lstat(file)
    if (!info.isFile() || info.isSymbolicLink()) fail('UNSAFE_CREDENTIALS', '授权文件必须是普通私有文件')
    if (process.platform !== 'win32' && (info.mode & 0o077)) fail('UNSAFE_CREDENTIALS', '授权文件权限过宽，请将权限设为 600')
    if (info.size > 8192) fail('INVALID_CREDENTIALS', '授权文件无效')
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (e) {
    if (e.code === 'ENOENT') return null
    if (e instanceof ClientError) throw e
    fail('INVALID_CREDENTIALS', '无法读取授权，请重新登录')
  }
}
export async function context(flags = {}, env = process.env) {
  const stored = env.WLBY_AGENT_TOKEN ? null : await readCredentials(env)
  const url = serverUrl(flags.server || env.WLBY_AGENT_SERVER || stored?.server || MCP_URL)
  if (stored?.server && serverUrl(stored.server).origin !== url.origin)
    fail('SERVER_MISMATCH', '该授权属于另一个服务器，请为当前环境重新登录')
  const token = (env.WLBY_AGENT_TOKEN || stored?.token || '').trim()
  if (!token) fail('AUTH_REQUIRED', '请配置 WLBY_AGENT_TOKEN 密钥，或运行 auth login')
  if (!tokenPattern.test(token)) fail('INVALID_TOKEN', '访问令牌格式无效')
  const timeout = Number(flags.timeout || 30_000)
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 300_000) fail('INVALID_ARGUMENTS', '超时须为 100—300000 毫秒')
  return { url, token, timeout }
}
async function jsonResponse(response) {
  const chunks = []; let size = 0
  for await (const chunk of response.body || []) {
    size += chunk.length
    if (size > maxResponseBytes) { fail('RESPONSE_TOO_LARGE', '返回内容过大，请缩小查询范围并分页读取') }
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { fail('INVALID_RESPONSE', '服务器未返回有效 JSON，请稍后重试') }
}
export async function request(ctx, endpoint, { method = 'POST', body, raw = false, requestId = randomUUID() } = {}) {
  const target = new URL(endpoint, ctx.url)
  if (target.origin !== ctx.url.origin || target.username || target.password)
    fail('UNSAFE_UPLOAD_URL', '服务器返回了不同来源的地址，已停止')
  try {
    const response = await fetch(target, {
      method, redirect: 'error', signal: AbortSignal.timeout(ctx.timeout),
      headers: { Authorization: `Bearer ${ctx.token}`, 'Content-Type': raw ? 'application/octet-stream' : 'application/json',
        'Idempotency-Key': requestId, 'User-Agent': `wlby-agent/${VERSION}` },
      ...(body === undefined ? {} : { body: raw ? body : JSON.stringify(body) }),
      ...(raw && body && typeof body.pipe === 'function' ? { duplex: 'half' } : {}),
    })
    const result = await jsonResponse(response)
    if (!response.ok || result.success === false)
      throw new ClientError(result.code || 'REQUEST_FAILED', safeText(result.error || '操作未完成'), response.status, requestId)
    return { requestId, data: result.data ?? result }
  } catch (e) {
    if (e instanceof ClientError) { e.requestId ||= requestId; throw e }
    throw new ClientError('NETWORK_ERROR', '网络请求未完成；不要盲目重试写入，重试时复用 requestId', 0, requestId)
  }
}
export function call(ctx, name, input = {}, requestId) {
  if (!/^[A-Za-z][\w.:-]{0,159}$/.test(name)) fail('INVALID_ARGUMENTS', '能力名称无效，请使用服务器返回的名称')
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_ARGUMENTS', '参数必须是 JSON 对象')
  if (requestId && !/^[A-Za-z0-9_.:-]{1,160}$/.test(requestId)) fail('INVALID_ARGUMENTS', 'request-id 格式无效')
  return request(ctx, `/api/agent/call/${encodeURIComponent(name)}`, { body: input, requestId })
}
async function readStdin(maxBytes) {
  const chunks = []; let bytes = 0
  for await (const chunk of process.stdin) {
    bytes += chunk.length
    if (bytes > maxBytes) fail('INPUT_TOO_LARGE', '输入超出允许大小')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}
async function hiddenToken() {
  if (!process.stdin.isTTY || !process.stdin.setRawMode)
    fail('NON_INTERACTIVE', '无交互环境请使用密钥环境变量，或 auth login --stdin；不要把令牌放入命令参数')
  process.stderr.write('输入访问令牌（内容隐藏）：')
  return new Promise((resolve, reject) => {
    let value = ''
    const cleanup = () => { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', receive); process.stderr.write('\n') }
    const receive = chunk => {
      for (const c of chunk.toString()) {
        if (c === '\u0003') { cleanup(); reject(new ClientError('CANCELLED', '已取消授权')); return }
        if (c === '\r' || c === '\n') { cleanup(); resolve(value); return }
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1)
        else if (c >= ' ' && value.length < 4096) value += c
      }
    }
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on('data', receive)
  })
}
export async function saveCredentials(ctx, env = process.env) {
  const dir = home(env)
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  const info = await fs.lstat(dir)
  if (!info.isDirectory() || info.isSymbolicLink()) fail('UNSAFE_CREDENTIALS', '授权目录不能是符号链接')
  await fs.chmod(dir, 0o700)
  const file = path.join(dir, 'credentials.json'), temporary = file + '.' + randomUUID()
  try {
    await fs.writeFile(temporary, JSON.stringify({ server: ctx.url.href, token: ctx.token }) + '\n', { mode: 0o600, flag: 'wx' })
    await fs.rename(temporary, file)
  } finally { await fs.unlink(temporary).catch(() => {}) }
}
async function inputObject(flags, positional) {
  const choices = [flags.input !== undefined, flags.json !== undefined, positional !== undefined].filter(Boolean).length
  if (choices > 1) fail('INVALID_ARGUMENTS', '请选择一种参数输入方式')
  let value = flags.json ?? positional
  if (flags.input) value = flags.input === '-' ? await readStdin(16 * 1024 * 1024) : await fs.readFile(flags.input, 'utf8')
  if (value === undefined) return {}
  try { const result = JSON.parse(value); if (result && typeof result === 'object' && !Array.isArray(result)) return result } catch { /* generic error below */ }
  fail('INVALID_ARGUMENTS', '输入必须为 JSON 对象')
}
export async function upload(ctx, filename, flags = {}) {
  if (!filename || (!!flags.homepage === !!flags.grant)) fail('INVALID_ARGUMENTS', '上传需指定文件及 --grant 任务编号，或 --homepage')
  const before = await fs.stat(filename)
  if (!before.isFile()) fail('INVALID_ARGUMENTS', '请选择普通文件')
  const mime = flags.mime || ({ '.mp3': 'audio/mpeg', '.json': 'application/json', '.md': 'text/markdown', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' })[path.extname(filename).toLowerCase()]
  if (!mime) fail('INVALID_ARGUMENTS', '请按服务器制作指南提供支持的文件类型')
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(filename)) digest.update(chunk)
  const sha256 = digest.digest('hex')
  const { data: session } = await call(ctx, flags.homepage ? 'admin.homepage.upload.create' : 'production.upload.create', {
    ...(flags.homepage ? { idempotencyKey: flags['request-id'] || randomUUID() } : { grantId: flags.grant }),
    filename: path.basename(filename), mimeType: mime, sizeBytes: before.size, sha256,
  }, flags['request-id'])
  const target = new URL(session.uploadPath, ctx.url)
  const expectedPath = flags.homepage ? '/api/agent/homepage/uploads/' : '/api/agent/uploads/'
  if (target.origin !== ctx.url.origin || target.search || target.hash || !target.pathname.startsWith(expectedPath) || !target.pathname.endsWith('/content'))
    fail('UNSAFE_UPLOAD_URL', '上传会话地址无效，未发送文件')
  const after = await fs.stat(filename)
  if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) fail('FILE_CHANGED', '文件已发生变化，请重新创建上传会话')
  await request(ctx, target.href, { method: 'PUT', raw: true, body: createReadStream(filename) })
  return { data: { uploadId: session.id, filename: path.basename(filename), sha256 } }
}
async function mcp(ctx) {
  let bin
  try {
    const pkg = createRequire(import.meta.url).resolve('mcp-remote/package.json')
    bin = path.join(path.dirname(pkg), 'dist/proxy.js')
  } catch { fail('BRIDGE_NOT_INSTALLED', '技能脚本无需 MCP 桥接；需要 stdio 时请安装 npm 包 wlby-agent，再运行 wlby-agent mcp') }
  // The credential is injected privately into the child environment, never argv/stdout.
  const child = spawn(process.execPath, [bin, ctx.url.href, '--transport', 'http-only', '--header', 'Authorization:${WLBY_MCP_AUTHORIZATION}'], {
    stdio: 'inherit', env: { ...process.env, WLBY_MCP_AUTHORIZATION: `Bearer ${ctx.token}` },
  })
  const forward = signal => child.kill(signal)
  const int = () => forward('SIGINT'), term = () => forward('SIGTERM')
  process.on('SIGINT', int); process.on('SIGTERM', term)
  try {
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (value) => resolve(value ?? 1)) })
    process.exitCode = code
  } finally { process.off('SIGINT', int); process.off('SIGTERM', term) }
}
const help = `未来白杨智能体技能 wlby-agent ${VERSION}
用法：node scripts/wlby-agent.mjs <命令>
  auth login [--stdin]       隐藏输入授权；云端可用密钥 WLBY_AGENT_TOKEN
  auth status | doctor      免费连接检查
  auth logout               删除当前设备保存的授权；服务端撤销请到网站
  search <关键词> [--limit 5] 免费查找当前可用功能
  describe <能力名称>        免费读取参数、权限、积分及用法
  call <能力名称> [--input 文件或 -] [--request-id 标识]
  upload <文件> --grant <任务编号> | --homepage
  mcp                       stdio MCP 桥接（npm 包安装后可用）
业务调用沿用账号权限、购买权益、积分与真实用户确认。` 
export async function main(argv = process.argv.slice(2), env = process.env) {
  if (Number(process.versions.node.split('.')[0]) < 22) fail('RUNTIME_REQUIRED', '请安装 Node.js 22 或更高版本')
  const { flags, positional: p } = options(argv)
  if (flags.version || p[0] === '--version') return { version: VERSION }
  if (flags.help || !p.length || p[0] === 'help') { process.stdout.write(help + '\n'); return }
  if (p[0] === 'auth' && p[1] === 'logout') {
    await fs.unlink(path.join(home(env), 'credentials.json')).catch(e => { if (e.code !== 'ENOENT') throw e })
    return { loggedOut: true, notice: '本设备授权已移除；需要使该令牌在所有设备失效时，请在网站撤销' }
  }
  if (p[0] === 'auth' && p[1] === 'login') {
    const token = (flags.stdin ? await readStdin(4096) : env.WLBY_AGENT_TOKEN || await hiddenToken()).trim()
    if (!tokenPattern.test(token)) fail('INVALID_TOKEN', '访问令牌格式无效')
    const ctx = await context(flags, { ...env, WLBY_AGENT_TOKEN: token })
    const result = await call(ctx, 'connection.status')
    await saveCredentials(ctx, env)
    return { ...result, saved: true, notice: '已保存本设备授权；技能是否跨任务可用取决于宿主的持久化设置' }
  }
  const commands = ['doctor', 'search', 'describe', 'call', 'upload', 'mcp']
  if (!commands.includes(p[0]) && !(p[0] === 'auth' && p[1] === 'status')) fail('INVALID_ARGUMENTS', '未知命令，请运行 --help')
  const ctx = await context(flags, env)
  if (p[0] === 'mcp') return mcp(ctx)
  if (p[0] === 'doctor' || p[0] === 'auth') return call(ctx, 'connection.status')
  if (p[0] === 'search') {
    const limit = Number(flags.limit || 5)
    if (!p[1] || !Number.isInteger(limit) || limit < 1 || limit > 10) fail('INVALID_ARGUMENTS', '请提供关键词；limit 为 1—10')
    return call(ctx, 'capabilities.search', { query: p.slice(1).join(' '), limit })
  }
  if (p[0] === 'describe') return call(ctx, 'capabilities.describe', { name: p[1] })
  if (p[0] === 'upload') return upload(ctx, p[1], flags)
  return call(ctx, p[1], await inputObject(flags, p[2]), flags['request-id'])
}
if (process.argv[1] && import.meta.url === pathToFileURL(await fs.realpath(process.argv[1])).href) {
  try {
    const result = await main()
    if (result !== undefined) process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  } catch (e) {
    const code = e instanceof ClientError ? e.code : 'CLIENT_ERROR'
    process.stderr.write(JSON.stringify({ ok: false, code, error: safeText(e instanceof ClientError ? e.message : '操作未完成，请检查运行环境与文件权限'), ...(e.requestId ? { requestId: e.requestId } : {}) }) + '\n')
    process.exitCode = code === 'AUTH_REQUIRED' || code === 'INVALID_AGENT_TOKEN' ? 3 : 1
  }
}

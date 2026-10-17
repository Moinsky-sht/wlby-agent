import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { VERSION, context, call, serverUrl, saveCredentials, upload, safeText } from '../scripts/wlby-agent.mjs'

// Deliberately synthetic credentials: no real account or authentication material is used.
const fixtureToken = 'wlby_a_' + '0'.repeat(16) + '_' + 'x'.repeat(43)
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cli = path.join(root, 'scripts/wlby-agent.mjs')
function run(args, env, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { env: { PATH: process.env.PATH, ...env }, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', c => { stdout += c })
    child.stderr.on('data', c => { stderr += c })
    child.once('error', reject)
    child.once('close', code => resolve({ code, stdout, stderr }))
    child.stdin.end(input)
  })
}
test('client transport, private login, dynamic contracts and retries', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'wlby-agent-test-'))
  t.after(() => fs.rm(home, { recursive: true, force: true }))
  const requests = [], results = new Map()
  let active = true, searches = 0, effectCount = 0, uploadMode = 'same'
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c)
    const bytes = Buffer.concat(chunks), raw = bytes.toString(), body = req.method === 'PUT' ? null : JSON.parse(raw || '{}')
    requests.push({ url: req.url, headers: req.headers, body, bytes })
    const reply = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)) }
    if (!active || req.headers.authorization !== `Bearer ${fixtureToken}`) return reply(401, { code: 'INVALID_AGENT_TOKEN', error: '授权已失效' })
    if (req.url.endsWith('connection.status')) return reply(200, { data: { user: { id: 1, name: '隔离测试账号' } } })
    if (req.url.endsWith('capabilities.search')) return reply(200, { data: { items: [{ name: `fixture.capability${++searches}` }] } })
    if (req.url.endsWith('capabilities.describe')) return reply(200, { data: { capability: { name: body.name, inputSchema: { type: 'object' } } } })
    if (req.url.endsWith('fixture.confirm')) return reply(200, { data: { status: 'PREPARED', confirmationUrl: '/profile/confirm/fixture' } })
    if (req.url.endsWith('fixture.insufficient')) return reply(402, { code: 'INSUFFICIENT_CREDITS', error: '积分不足' })
    if (req.url.endsWith('fixture.redirect')) { res.writeHead(307, { Location: '/must-not-follow' }); return res.end() }
    if (req.url.endsWith('fixture.error')) return reply(400, { code: 'ERROR', error: `Bearer ${fixtureToken}` })
    if (req.url.endsWith('fixture.write')) {
      const key = req.headers['idempotency-key']
      if (!results.has(key)) results.set(key, { number: ++effectCount })
      return reply(200, { data: results.get(key) })
    }
    if (req.url.endsWith('production.upload.create')) return reply(200, { data: { id: 'fixture-upload', uploadPath: uploadMode === 'cross' ? 'https://invalid.example/content' : '/api/agent/uploads/fixture-upload/content' } })
    if (req.method === 'PUT') return reply(200, { data: { ready: true } })
    return reply(404, { error: 'not found' })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}`
  const env = { WLBY_AGENT_HOME: home, WLBY_AGENT_SERVER: base }
  const ctx = await context({}, { ...env, WLBY_AGENT_TOKEN: fixtureToken })
  await t.test('stdin login works without a TTY; stdout and stderr contain no credential', async () => {
    const r = await run(['auth', 'login', '--stdin'], env, fixtureToken + '\n')
    assert.equal(r.code, 0, r.stderr)
    assert.equal(JSON.parse(r.stdout).saved, true)
    assert.ok(!(r.stdout + r.stderr).includes(fixtureToken))
    const stat = await fs.stat(path.join(home, 'credentials.json'))
    if (process.platform !== 'win32') assert.equal(stat.mode & 0o777, 0o600)
    assert.deepEqual(requests.map(r => r.url), ['/api/agent/call/connection.status'])
  })
  await t.test('new processes reuse private credentials; environment tokens take precedence', async () => {
    assert.equal((await run(['doctor'], env)).code, 0)
    const r = await run(['doctor'], { ...env, WLBY_AGENT_TOKEN: fixtureToken.replace(/x$/, 'y') })
    assert.equal(r.code, 3)
    assert.equal(JSON.parse(r.stderr).code, 'INVALID_AGENT_TOKEN')
  })
  await t.test('connection checks and known calls do not prefetch capability lists or add redundant requests', async () => {
    const start = requests.length
    assert.equal((await run(['doctor'], env)).code, 0)
    assert.equal((await run(['call', 'fixture.confirm'], env)).code, 0)
    assert.deepEqual(requests.slice(start).map(r => r.url), [
      '/api/agent/call/connection.status', '/api/agent/call/fixture.confirm',
    ])
  })
  await t.test('live capability changes are returned without a client update', async () => {
    const a = await run(['search', '测试功能'], env), b = await run(['search', '测试功能'], env)
    assert.equal(a.code, 0); assert.equal(b.code, 0)
    assert.notEqual(JSON.parse(a.stdout).data.items[0].name, JSON.parse(b.stdout).data.items[0].name)
    const d = await run(['describe', 'fixture.write'], env)
    assert.equal(JSON.parse(d.stdout).data.capability.name, 'fixture.write')
  })
  await t.test('explicit request ID is preserved and a business request is sent only once', async () => {
    const args = ['call', 'fixture.write', '--input', '-', '--request-id', 'same-test-request']
    const a = await run(args, env, '{"example":true}'), b = await run(args, env, '{"example":true}')
    assert.equal(a.code, 0); assert.equal(b.code, 0)
    assert.equal(JSON.parse(a.stdout).requestId, 'same-test-request')
    assert.equal(JSON.parse(b.stdout).data.number, 1)
    assert.equal(effectCount, 1)
  })
  await t.test('server confirmation is returned without auto-confirming; denial returns no data', async () => {
    const c = await run(['call', 'fixture.confirm'], env)
    assert.equal(JSON.parse(c.stdout).data.status, 'PREPARED')
    assert.ok(!requests.some(r => r.url.includes('/confirm/')))
    const denied = await run(['call', 'fixture.insufficient'], env)
    assert.notEqual(denied.code, 0); assert.equal(denied.stdout, '')
    assert.equal(JSON.parse(denied.stderr).code, 'INSUFFICIENT_CREDITS')
  })
  await t.test('redirects and credential-bearing errors are not forwarded or printed', async () => {
    const redirect = await run(['call', 'fixture.redirect'], env)
    assert.equal(JSON.parse(redirect.stderr).code, 'NETWORK_ERROR')
    assert.ok(!requests.some(r => r.url === '/must-not-follow'))
    const r = await run(['call', 'fixture.error'], env)
    assert.ok(!r.stderr.includes(fixtureToken)); assert.ok(r.stderr.includes('已隐藏'))
  })
  await t.test('real file bytes use a scoped upload session and SHA256; cross-origin sessions are refused', async () => {
    const file = path.join(home, '制作稿.md'), contents = Buffer.from('明确标注的测试文件，非制作或人工审核结果。')
    await fs.writeFile(file, contents)
    const r = await upload(ctx, file, { grant: 'fixture-grant' })
    assert.equal(r.data.sha256, createHash('sha256').update(contents).digest('hex'))
    assert.ok(requests.findLast(r => r.headers['content-type'] === 'application/octet-stream').bytes.equals(contents))
    uploadMode = 'cross'
    const count = requests.filter(r => r.url.endsWith('/content')).length
    await assert.rejects(upload(ctx, file, { grant: 'fixture-grant' }), e => e.code === 'UNSAFE_UPLOAD_URL')
    assert.equal(requests.filter(r => r.url.endsWith('/content')).length, count)
  })
  await t.test('revocation takes effect in the next process; logout does not call a revoke API', async () => {
    active = false
    assert.equal((await run(['doctor'], env)).code, 3)
    const count = requests.length
    assert.equal((await run(['auth', 'logout'], env)).code, 0)
    assert.equal(requests.length, count)
    assert.equal(JSON.parse((await run(['doctor'], env)).stderr).code, 'AUTH_REQUIRED')
  })
  await t.test('noninteractive login without credentials fails promptly without waiting for input', async () => {
    const r = await run(['auth', 'login'], env)
    assert.equal(JSON.parse(r.stderr).code, 'NON_INTERACTIVE')
  })
})
test('server addresses, credentials file safety and npm-style executable symlinks', async t => {
  for (const u of ['https://evil.example', 'http://wlbycuc.cn', 'https://a:b@wlbycuc.cn', 'https://wlbycuc.cn/api/agent/call/x', 'https://wlbycuc.cn?token=x'])
    assert.throws(() => serverUrl(u), e => e.code === 'INVALID_SERVER')
  assert.equal(serverUrl().href, 'https://wlbycuc.cn/api/agent/mcp')
  assert.equal(safeText(fixtureToken), '[已隐藏令牌]')
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wlby-agent-safety-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  if (process.platform !== 'win32') {
    await fs.symlink(cli, path.join(dir, 'client.mjs'))
    const child = spawn(process.execPath, [path.join(dir, 'client.mjs'), '--version'])
    let out = ''; child.stdout.on('data', c => { out += c })
    await new Promise((r, j) => { child.once('error', j); child.once('close', r) })
    assert.equal(JSON.parse(out).version, VERSION)
    const file = path.join(dir, 'credentials.json')
    await fs.writeFile(file, JSON.stringify({ token: fixtureToken }), { mode: 0o644 })
    await assert.rejects(context({}, { WLBY_AGENT_HOME: dir }), e => e.code === 'UNSAFE_CREDENTIALS')
  }
})

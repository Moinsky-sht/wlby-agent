import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
const dir = path.join(root, 'dist')
await fs.mkdir(dir, { recursive: true })
const archive = `wlby-agent-${pkg.version}.zip`
const files = ['SKILL.md', 'README.md', 'LICENSE', 'package.json', 'scripts/wlby-agent.mjs']
execFileSync('python3', ['-c', `import json, pathlib, sys, zipfile
root, output, files = pathlib.Path(sys.argv[1]), sys.argv[2], json.loads(sys.argv[3])
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as z:
 for name in files:
  item = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
  item.compress_type = zipfile.ZIP_DEFLATED
  item.external_attr = (0o100755 if name.endswith('.mjs') else 0o100644) << 16
  z.writestr(item, (root / name).read_bytes())
`, root, path.join(dir, archive), JSON.stringify(files)], { stdio: 'inherit' })
const sha256 = createHash('sha256').update(await fs.readFile(path.join(dir, archive))).digest('hex')
await fs.writeFile(path.join(dir, 'SHA256SUMS'), `${sha256}  ${archive}\n`)
await fs.writeFile(path.join(dir, 'release.json'), JSON.stringify({ version: pkg.version, archive, sha256, repository: 'https://github.com/Moinsky-sht/wlby-agent', npmPublished: false }, null, 2) + '\n')
console.log(JSON.stringify({ archive, sha256 }))

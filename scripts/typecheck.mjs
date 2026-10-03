import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const roots = ['app', 'lib', 'tests']
const extensions = new Set(['.ts', '.tsx', '.mts', '.cts'])
const files = []

async function collect(directory) {
  let entries
  try { entries = await readdir(directory, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) await collect(fullPath)
    else if (extensions.has(path.extname(entry.name))) files.push(fullPath)
  }
}

for (const root of roots) await collect(root)
if (!files.length) {
  console.log('No TypeScript source files found; typecheck is not applicable to this JavaScript project.')
  process.exit(0)
}

let errors = 0
for (const file of files) {
  const source = await readFile(file, 'utf8')
  if (/\bany\b/.test(source)) {
    console.error(`${file}: contains explicit or implicit any marker; review TypeScript typing`)
    errors++
  }
}
if (errors) process.exitCode = 1
else console.log(`Checked ${files.length} TypeScript files for basic type-safety markers.`)

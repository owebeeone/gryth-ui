#!/usr/bin/env node
// Fails if any banned React hook appears anywhere under src/.
// gryth-ui forbids React local state — all state lives in grips (see
// dev-docs/CodingRules.md). Comments and strings are stripped before scanning
// so documentation that mentions these names does not trip the check.
//
// Escape hatch: a use site may be approved by placing
//   /* Approved: <hook>: Approval ID <id> */
// on the SAME LINE as the use (import lines included), where <id> is an entry
// in the APPROVALS registry below matching both the hook and the file.
// Forged markers (no matching registry entry) and stale registry entries (no
// matching marker left in the file) both fail the test.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// app src + every workspace package's src
const pkgSrcDirs = (dir) => {
  try { return readdirSync(dir).map((p) => join(dir, p, 'src')); } catch { return []; }
};
const srcDirs = [
  join(root, 'src'),
  ...pkgSrcDirs(join(root, 'packages')),
  ...pkgSrcDirs(join(root, 'packages', 'plugins')),
].filter((d) => { try { return statSync(d).isDirectory(); } catch { return false; } });

const BANNED = [
  'useState',
  'useEffect',
  'useRef',
  'useReducer',
  'useMemo',
  'useCallback',
  'useLayoutEffect',
];

// Approval registry.
// DO NOT add entries without explicit project-owner approval; record the
// approval in the commit message that adds the entry. Remove the entry when
// the approved use is removed (a stale entry fails this test).
// Shape: { id: <number>, hook: '<hook>', file: 'src/<path>', reason: '<why>' }
const APPROVALS = [
  // example: { id: 333, hook: 'useMemo', file: 'src/HeavyTable.tsx', reason: 'memoize 10k-row sort' },
];

const exts = new Set(['.ts', '.tsx', '.js', '.jsx']);
const MARKER = /\/\*\s*Approved:\s*(\w+)\s*:\s*Approval ID\s+(\d+)\s*\*\//g;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (exts.has(p.slice(p.lastIndexOf('.')))) out.push(p);
  }
  return out;
}

function stripCommentsAndStrings(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')) // block comments (keep line count)
    .replace(/\/\/[^\n]*/g, ' ')             // line comments
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, (m) => m.replace(/[^\n]/g, ' ')) // template strings
    .replace(/'(?:\\.|[^\\'])*'/g, ' ')      // single-quoted strings
    .replace(/"(?:\\.|[^\\"])*"/g, ' ');     // double-quoted strings
}

const violations = [];
const usedApprovalIds = new Set();

for (const file of srcDirs.flatMap(walk)) {
  const relFile = relative(root, file).split('\\').join('/');
  const raw = readFileSync(file, 'utf8');
  const rawLines = raw.split('\n');
  const cleanedLines = stripCommentsAndStrings(raw).split('\n');

  cleanedLines.forEach((line, i) => {
    // Markers are comments, so they are parsed from the RAW line.
    const approvedHooksOnLine = new Set();
    for (const m of rawLines[i].matchAll(MARKER)) {
      const [, hook, idText] = m;
      const id = Number(idText);
      const entry = APPROVALS.find((a) => a.id === id);
      if (!entry) {
        violations.push(`${relFile}:${i + 1}  marker references unknown Approval ID ${id}`);
        continue;
      }
      if (entry.hook !== hook) {
        violations.push(`${relFile}:${i + 1}  Approval ID ${id} is for ${entry.hook}, marker says ${hook}`);
        continue;
      }
      if (entry.file !== relFile) {
        violations.push(`${relFile}:${i + 1}  Approval ID ${id} is for ${entry.file}, not this file`);
        continue;
      }
      approvedHooksOnLine.add(hook);
      usedApprovalIds.add(id);
    }
    for (const name of BANNED) {
      if (new RegExp(`\\b${name}\\b`).test(line) && !approvedHooksOnLine.has(name)) {
        violations.push(`${relFile}:${i + 1}  uses ${name}`);
      }
    }
  });
}

// Stale approvals: every registry entry must still be exercised by a marker.
for (const entry of APPROVALS) {
  if (!usedApprovalIds.has(entry.id)) {
    violations.push(`APPROVALS: stale entry ${entry.id} (${entry.hook} in ${entry.file}) — remove it with the code it approved`);
  }
}

if (violations.length) {
  console.error('FAIL: React local state hooks are banned in gryth-ui (use grips). Found:');
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log(`OK: no unapproved React hooks found in src/ (${BANNED.length} banned, ${APPROVALS.length} approvals).`);

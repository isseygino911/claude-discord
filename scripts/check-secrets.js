#!/usr/bin/env node
// Scans staged (or all) files for hardcoded secrets and validates .gitignore coverage.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GITIGNORE = path.join(ROOT, '.gitignore');

// Patterns that suggest hardcoded secrets
const SECRET_PATTERNS = [
  { re: /(['"`])MT[A-Za-z0-9]{24,}\.\S+\1/, label: 'Discord bot token' },
  { re: /(['"`])[A-Za-z0-9_\-]{40,}\1/, label: 'Long API key / token (40+ chars)' },
  { re: /DISCORD_TOKEN\s*=\s*['"`]MT/,     label: 'Hardcoded DISCORD_TOKEN value' },
  { re: /OAUTH_TOKEN\s*=\s*['"`][^'"` ]{20,}/, label: 'Hardcoded OAuth token' },
  { re: /password\s*[:=]\s*['"`][^'"` ]{6,}/i, label: 'Hardcoded password' },
  { re: /secret\s*[:=]\s*['"`][^'"` ]{8,}/i,   label: 'Hardcoded secret' },
  { re: /api[_-]?key\s*[:=]\s*['"`][^'"` ]{8,}/i, label: 'Hardcoded API key' },
];

// Sensitive filenames that must be in .gitignore
const SENSITIVE_NAMES = ['.env', '.env.*', '*.pem', '*.key', '*.p12', '*.pfx', 'secrets.json', 'credentials.json'];

// Files to skip (binary / lock / generated)
const SKIP_EXT = new Set(['.png','.jpg','.gif','.ico','.lock','.map','.min.js']);
const SKIP_DIR = new Set(['node_modules', '.git']);

// ── helpers ──────────────────────────────────────────────────────────────────

function getStagedFiles() {
  try {
    return execSync('git diff --cached --name-only --diff-filter=ACM', { cwd: ROOT })
      .toString().trim().split('\n').filter(Boolean);
  } catch { return []; }
}

function getAllTrackedFiles() {
  try {
    return execSync('git ls-files', { cwd: ROOT })
      .toString().trim().split('\n').filter(Boolean);
  } catch { return []; }
}

function readGitignore() {
  if (!fs.existsSync(GITIGNORE)) return [];
  return fs.readFileSync(GITIGNORE, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
}

function checkGitignoreCoverage(lines) {
  const missing = [];
  for (const name of SENSITIVE_NAMES) {
    if (!lines.includes(name)) missing.push(name);
  }
  return missing;
}

function scanFile(relPath) {
  const ext = path.extname(relPath).toLowerCase();
  if (SKIP_EXT.has(ext)) return [];
  const parts = relPath.split(path.sep);
  if (parts.some(p => SKIP_DIR.has(p))) return [];

  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return [];

  const lines = fs.readFileSync(abs, 'utf8').split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    // Skip lines that just read from process.env
    if (/process\.env\./.test(line)) return;
    for (const { re, label } of SECRET_PATTERNS) {
      if (re.test(line)) {
        hits.push({ file: relPath, line: i + 1, label, snippet: line.trim().slice(0, 80) });
      }
    }
  });
  return hits;
}

// ── main ─────────────────────────────────────────────────────────────────────

const mode = process.argv[2] === '--all' ? 'all' : 'staged';
const files = mode === 'all' ? getAllTrackedFiles() : getStagedFiles();

let failed = false;

// 1. Secret scan
const allHits = files.flatMap(scanFile);
if (allHits.length) {
  console.error('\n❌  Potential hardcoded secrets detected:\n');
  for (const h of allHits) {
    console.error(`  ${h.file}:${h.line}  [${h.label}]`);
    console.error(`     ${h.snippet}\n`);
  }
  failed = true;
}

// 2. .gitignore coverage
const ignoreLines = readGitignore();
const missing = checkGitignoreCoverage(ignoreLines);
if (missing.length) {
  console.error('\n❌  These sensitive patterns are NOT in .gitignore:\n');
  missing.forEach(m => console.error(`  ${m}`));
  console.error('\n  Add them to .gitignore to prevent accidental commits.\n');
  failed = true;
}

if (!failed) {
  console.log('✅  No hardcoded secrets detected. .gitignore coverage looks good.');
}

process.exit(failed ? 1 : 0);

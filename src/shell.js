import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

export function ensureLocalBinInPath() {
  const localBin = path.join(os.homedir(), '.local', 'bin');
  const parts = (process.env.PATH || '').split(':').filter(Boolean);
  if (!parts.includes(localBin)) {
    process.env.PATH = [localBin, ...parts].join(':');
  }
}

export function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: options.stdio || 'pipe',
    encoding: 'utf8',
    env: process.env,
    cwd: options.cwd || process.cwd(),
  });

  if (options.check !== false && result.status !== 0) {
    const msg = [
      `Command failed: ${cmd} ${args.join(' ')}`,
      result.stderr ? result.stderr.trim() : '',
    ]
      .filter(Boolean)
      .join('\n');
    throw new Error(msg);
  }

  return result;
}

export function commandExists(cmd) {
  const which = run('sh', ['-lc', `command -v ${cmd}`], { check: false });
  return which.status === 0;
}

export function normalizeEndpoint(raw) {
  const value0 = String(raw || '').trim();
  if (!value0) return value0;

  let value = value0;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) {
    value = `https://${value}`;
  }

  const afterScheme = value.split('://')[1] || '';
  if (afterScheme.includes('/')) {
    throw new Error('Endpoint must be scheme://host[:port] with no path.');
  }

  return value;
}

export function timestamp() {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
}

export function safeBucketName(name) {
  return name.replace(/[/:]/g, '_');
}

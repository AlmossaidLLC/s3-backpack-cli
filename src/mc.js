import os from 'os';
import path from 'path';
import fs from 'fs';
import { run, timestamp, safeBucketName } from './shell.js';

function mcDownloadUrl() {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === 'darwin') {
    if (arch === 'arm64') return 'https://dl.min.io/client/mc/release/darwin-arm64/mc';
    return 'https://dl.min.io/client/mc/release/darwin-amd64/mc';
  }

  if (platform === 'linux') {
    if (arch === 'x64') return 'https://dl.min.io/client/mc/release/linux-amd64/mc';
    if (arch === 'arm64') return 'https://dl.min.io/client/mc/release/linux-arm64/mc';
  }

  throw new Error(`Unsupported OS/arch for auto install: ${platform}/${arch}`);
}

export function installMc() {
  const targetDir = path.join(os.homedir(), '.local', 'bin');
  const target = path.join(targetDir, 'mc');
  fs.mkdirSync(targetDir, { recursive: true });

  const url = mcDownloadUrl();
  run('curl', ['-fsSL', url, '-o', target]);
  fs.chmodSync(target, 0o755);
}

function parseBucketsFromMcLs(output) {
  const lines = output.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const buckets = [];

  for (const line of lines) {
    const parts = line.split(/\s+/);
    const last = parts[parts.length - 1] || '';
    if (last.endsWith('/')) {
      buckets.push(last.slice(0, -1));
    }
  }

  return Array.from(new Set(buckets)).sort();
}

export function configureAlias(alias, cfg) {
  const args = ['alias', 'set', alias, cfg.endpoint, cfg.accessKey, cfg.secretKey];
  if (cfg.pathMode) args.push('--path', cfg.pathMode);
  if (cfg.apiSignature) args.push('--api', cfg.apiSignature);
  if (cfg.region) args.push('--region', cfg.region);
  if (cfg.insecure) args.push('--insecure');
  run('mc', args);
}

export function listBuckets(alias, insecure) {
  const args = ['ls', alias];
  if (insecure) args.push('--insecure');
  const result = run('mc', args);
  return parseBucketsFromMcLs(result.stdout || '');
}

export function removeAlias(alias) {
  run('mc', ['alias', 'rm', alias], { check: false });
}

export function backupBucket(alias, bucket, cfg) {
  const bucketSafe = safeBucketName(bucket);
  const targetDir = path.join(cfg.downloadDir, bucketSafe);

  fs.rmSync(targetDir, { recursive: true, force: true });

  const mirrorArgs = ['mirror', `${alias}/${bucket}`, targetDir];
  if (cfg.insecure) mirrorArgs.push('--insecure');
  run('mc', mirrorArgs, { stdio: 'inherit' });

  let zipPath = null;
  if (cfg.createZip) {
    const zipName = `${bucketSafe}_${timestamp()}.zip`;
    zipPath = path.join(cfg.zipDir, zipName);
    run('zip', ['-r', zipPath, bucketSafe], { cwd: cfg.downloadDir });
  }

  return { targetDir, zipPath };
}

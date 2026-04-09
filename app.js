#!/usr/bin/env node

const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const inquirerModule = require('inquirer');
const inquirer = inquirerModule.default || inquirerModule;
const chalk = require('chalk');
const ora = require('ora');

// ─── Visual helpers ──────────────────────────────────────────────────────────

function printBanner() {
  const inner = 47;
  const top    = chalk.cyan('  ╔' + '═'.repeat(inner) + '╗');
  const blank  = chalk.cyan('  ║') + ' '.repeat(inner) + chalk.cyan('║');
  const bottom = chalk.cyan('  ╚' + '═'.repeat(inner) + '╝');

  // title line: "  ║  " (5) + content (42) + "║" (1) = inner+2 total
  const titleContent = chalk.bold.white('S3 BACKPACK') + chalk.dim(' · Backup S3-compatible storage   ');
  const titleLine = chalk.cyan('  ║  ') + titleContent + chalk.cyan('║');

  // sub line: "  ║  " (5) + 40 chars + 5 spaces + "║"
  const subLine = chalk.cyan('  ║  ') + chalk.dim('MinIO · RustFS · AWS S3 · any compatible     ') + chalk.cyan('║');

  console.log('');
  console.log(top);
  console.log(blank);
  console.log(titleLine);
  console.log(subLine);
  console.log(blank);
  console.log(bottom);
  console.log('');
}

const log = {
  info:  (msg) => console.log(chalk.cyan('  ℹ  ') + msg),
  ok:    (msg) => console.log(chalk.green('  ✓  ') + chalk.green(msg)),
  error: (msg) => console.error(chalk.red('  ✗  ') + chalk.red(msg)),
  warn:  (msg) => console.log(chalk.yellow('  ⚠  ') + chalk.yellow(msg)),
  step:  (msg) => console.log('\n' + chalk.bold.white('  ▶  ') + chalk.bold.white(msg)),
};

// ─────────────────────────────────────────────────────────────────────────────

function ensureLocalBinInPath() {
  const localBin = path.join(os.homedir(), '.local', 'bin');
  const parts = (process.env.PATH || '').split(':').filter(Boolean);
  if (!parts.includes(localBin)) {
    process.env.PATH = [localBin, ...parts].join(':');
  }
}

function run(cmd, args, options = {}) {
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

function commandExists(cmd) {
  const which = run('sh', ['-lc', `command -v ${cmd}`], { check: false });
  return which.status === 0;
}

function normalizeEndpoint(raw) {
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

function installMc() {
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

function configureAlias(alias, cfg) {
  const args = ['alias', 'set', alias, cfg.endpoint, cfg.accessKey, cfg.secretKey];
  if (cfg.pathMode) args.push('--path', cfg.pathMode);
  if (cfg.apiSignature) args.push('--api', cfg.apiSignature);
  if (cfg.region) args.push('--region', cfg.region);
  if (cfg.insecure) args.push('--insecure');
  run('mc', args);
}

function listBuckets(alias, insecure) {
  const args = ['ls', alias];
  if (insecure) args.push('--insecure');
  const result = run('mc', args);
  return parseBucketsFromMcLs(result.stdout || '');
}

function safeBucketName(name) {
  return name.replace(/[/:]/g, '_');
}

function timestamp() {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
}

function backupBucket(alias, bucket, cfg) {
  const bucketSafe = safeBucketName(bucket);
  const targetDir = path.join(cfg.downloadDir, bucketSafe);

  fs.rmSync(targetDir, { recursive: true, force: true });

  const mirrorArgs = ['mirror', `${alias}/${bucket}`, targetDir];
  if (cfg.insecure) mirrorArgs.push('--insecure');
  run('mc', mirrorArgs, { stdio: 'inherit' });

  const zipName = `${bucketSafe}_${timestamp()}.zip`;
  const zipPath = path.join(cfg.zipDir, zipName);
  run('zip', ['-r', zipPath, bucketSafe], { cwd: cfg.downloadDir });

  return { targetDir, zipPath };
}

async function askConfig() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'endpointRaw',
      message: 'S3-compatible endpoint URL (example: https://minio.example.com or https://s3.amazonaws.com):',
      validate: (v) => (String(v || '').trim() ? true : 'Endpoint is required'),
    },
    {
      type: 'input',
      name: 'accessKey',
      message: 'Access key:',
      validate: (v) => (String(v || '').trim() ? true : 'Access key is required'),
    },
    {
      type: 'password',
      name: 'secretKey',
      message: 'Secret key:',
      mask: '*',
      validate: (v) => (String(v || '').trim() ? true : 'Secret key is required'),
    },
    {
      type: 'confirm',
      name: 'insecure',
      message: 'Use insecure TLS (self-signed certificates)?',
      default: false,
    },
    {
      type: 'list',
      name: 'pathMode',
      message: 'S3 path style mode:',
      choices: [
        { name: 'auto (recommended)', value: 'auto' },
        { name: 'on (force path-style)', value: 'on' },
        { name: 'off (virtual-host style)', value: 'off' },
      ],
      default: 'auto',
    },
    {
      type: 'list',
      name: 'apiSignature',
      message: 'S3 API signature:',
      choices: [
        { name: 'S3v4 (recommended)', value: 'S3v4' },
        { name: 'S3v2 (legacy)', value: 'S3v2' },
      ],
      default: 'S3v4',
    },
    {
      type: 'input',
      name: 'region',
      message: 'Region (optional, useful for some providers):',
      default: '',
      filter: (v) => String(v || '').trim(),
    },
    {
      type: 'input',
      name: 'downloadDir',
      message: 'Download directory:',
      default: path.join(process.cwd(), 'backups'),
      filter: (v) => path.resolve(String(v || '').trim()),
    },
    {
      type: 'input',
      name: 'zipDir',
      message: 'Zip output directory:',
      default: (answers0) => answers0.downloadDir,
      filter: (v) => path.resolve(String(v || '').trim()),
    },
  ]);

  return {
    endpoint: normalizeEndpoint(answers.endpointRaw),
    accessKey: String(answers.accessKey).trim(),
    secretKey: String(answers.secretKey).trim(),
    insecure: Boolean(answers.insecure),
    pathMode: answers.pathMode,
    apiSignature: answers.apiSignature,
    region: answers.region,
    downloadDir: answers.downloadDir,
    zipDir: answers.zipDir,
  };
}

async function main() {
  printBanner();
  ensureLocalBinInPath();

  if (!commandExists('mc')) {
    log.warn('MinIO client (mc) is not installed.');
    const { install } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'install',
        message: 'Install mc automatically to ~/.local/bin/mc?',
        default: true,
      },
    ]);

    if (!install) {
      log.error('mc is required. Exiting.');
      process.exit(1);
    }

    const mcSpinner = ora({ text: chalk.cyan('Installing mc to ~/.local/bin/mc …'), color: 'cyan' }).start();
    try {
      installMc();
      mcSpinner.succeed(chalk.green('mc installed successfully.'));
    } catch (err) {
      mcSpinner.fail(chalk.red(`Failed to install mc: ${err.message}`));
      process.exit(1);
    }

    if (!commandExists('mc')) {
      log.error('mc is still not available in PATH. Exiting.');
      process.exit(1);
    }
  }

  if (!commandExists('zip')) {
    log.error('zip is required but not installed. Please install zip and retry.');
    process.exit(1);
  }

  let cfg;
  try {
    cfg = await askConfig();
  } catch (err) {
    log.error(`Invalid input: ${err.message}`);
    process.exit(1);
  }

  fs.mkdirSync(cfg.downloadDir, { recursive: true });
  fs.mkdirSync(cfg.zipDir, { recursive: true });

  const alias = `s3backpack_${process.pid}`;

  try {
    const connSpinner = ora({ text: chalk.cyan('Verifying connection and credentials …'), color: 'cyan' }).start();
    configureAlias(alias, cfg);

    const buckets = listBuckets(alias, cfg.insecure);
    if (!buckets.length) {
      connSpinner.fail(chalk.red('Connection succeeded but no buckets found, or access denied.'));
      process.exit(1);
    }

    connSpinner.succeed(chalk.green(`Connected — ${buckets.length} bucket${buckets.length !== 1 ? 's' : ''} found.`));

    const { selectedBuckets } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedBuckets',
        message: 'Select buckets to back up:',
        choices: buckets,
        pageSize: 15,
        validate: (arr) => (arr && arr.length ? true : 'Select at least one bucket'),
      },
    ]);

    log.step('Starting backup …');
    const archives = [];

    for (const bucket of selectedBuckets) {
      console.log('\n' + chalk.bold.cyan(`  ┌─ Bucket: ${bucket}`));
      const out = backupBucket(alias, bucket, cfg);
      archives.push(out);
      log.ok(`Downloaded  →  ${out.targetDir}`);
      log.ok(`Archive     →  ${out.zipPath}`);
    }

    console.log('');
    console.log(chalk.bold.green('  ✓  All backups completed!'));
    console.log(chalk.dim('  ' + '─'.repeat(45)));
    console.log(chalk.bold('  Archives:'));
    for (const a of archives) {
      console.log(chalk.cyan('    ›  ') + chalk.white(a.zipPath));
    }
    console.log('');
  } catch (err) {
    log.error(err.message);
    process.exitCode = 1;
  } finally {
    try {
      run('mc', ['alias', 'rm', alias], { check: false });
    } catch (_) {
      // ignore
    }
  }
}

main();

#!/usr/bin/env node

import fs from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import {
  printBanner,
  printStep,
  printConnectionRecap,
  printBucketHeader,
  printBackupRecap,
  printErrorBox,
  spinnerStyle,
  formatConnectionError,
  log,
} from './ui.js';
import { ensureLocalBinInPath, commandExists } from './shell.js';
import { installMc, configureAlias, listBuckets, removeAlias, backupBucket } from './mc.js';
import {
  askInstallMc,
  askConnection,
  askConnectionOptions,
  askOutput,
  askBuckets,
} from './prompts.js';
import { parseCli, printHelp } from './args.js';

async function ensureMcAvailable(interactive) {
  if (commandExists('mc')) return;

  log.warn('MinIO client (mc) is not installed.');

  if (interactive) {
    const install = await askInstallMc();
    if (!install) {
      log.error('mc is required. Exiting.');
      process.exit(1);
    }
  }

  const mcSpinner = ora(spinnerStyle('Installing mc to ~/.local/bin/mc …')).start();
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

function resolveSelectedBuckets(available, { allBuckets, requestedBuckets }) {
  if (allBuckets) return available;

  const missing = requestedBuckets.filter((name) => !available.includes(name));
  if (missing.length) {
    throw new Error(
      `Unknown bucket${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}\n  Available: ${available.join(', ') || '(none)'}`,
    );
  }
  return requestedBuckets;
}

async function verifyConnection(cfg, alias, cleanupAlias) {
  const connSpinner = ora(spinnerStyle('Verifying connection and credentials …')).start();
  try {
    configureAlias(alias, cfg);
    const buckets = listBuckets(alias, cfg.insecure);
    if (!buckets.length) {
      connSpinner.stop();
      printErrorBox('Connection succeeded but no buckets found, or access denied.');
      cleanupAlias();
      process.exit(1);
    }
    connSpinner.stop();
    printConnectionRecap(cfg, buckets.length);
    return buckets;
  } catch (err) {
    connSpinner.stop();
    printErrorBox(formatConnectionError(err));
    cleanupAlias();
    process.exit(1);
  }
}

function prepareOutputDirs(cfg, cleanupAlias) {
  if (cfg.createZip && !commandExists('zip')) {
    log.error('zip is required to create archives but is not installed. Install zip, or skip creating zip files.');
    cleanupAlias();
    process.exit(1);
  }
  fs.mkdirSync(cfg.downloadDir, { recursive: true });
  if (cfg.createZip) fs.mkdirSync(cfg.zipDir, { recursive: true });
}

function runBackup(alias, cfg, selectedBuckets) {
  printStep('Backup');
  const results = [];

  for (const bucket of selectedBuckets) {
    printBucketHeader(bucket);
    const out = backupBucket(alias, bucket, cfg);
    results.push(out);
    log.ok(`Downloaded  →  ${out.targetDir}`);
    if (out.zipPath) log.ok(`Archive     →  ${out.zipPath}`);
  }

  printBackupRecap(results, cfg.createZip);
}

async function runInteractive() {
  printBanner();
  ensureLocalBinInPath();
  await ensureMcAvailable(true);

  let cfg;
  try {
    printStep('Connect');
    const connection = await askConnection();
    const connOptions = await askConnectionOptions();
    cfg = { ...connection, ...connOptions };
  } catch (err) {
    log.error(`Invalid input: ${err.message}`);
    process.exit(1);
  }

  const alias = `s3backpack_${process.pid}`;
  const cleanupAlias = () => {
    try {
      removeAlias(alias);
    } catch (_) {
      // ignore
    }
  };

  const buckets = await verifyConnection(cfg, alias, cleanupAlias);

  try {
    printStep('Output');
    const output = await askOutput();
    cfg = { ...cfg, ...output };
    prepareOutputDirs(cfg, cleanupAlias);

    printStep('Select buckets');
    const selectedBuckets = await askBuckets(buckets);
    runBackup(alias, cfg, selectedBuckets);
  } catch (err) {
    log.error(err.message);
    cleanupAlias();
    process.exit(1);
  } finally {
    cleanupAlias();
  }
}

async function runHeadless(cli) {
  printBanner();
  ensureLocalBinInPath();
  await ensureMcAvailable(false);

  const { cfg } = cli;
  const alias = `s3backpack_${process.pid}`;
  const cleanupAlias = () => {
    try {
      removeAlias(alias);
    } catch (_) {
      // ignore
    }
  };

  const buckets = await verifyConnection(cfg, alias, cleanupAlias);

  try {
    const selectedBuckets = resolveSelectedBuckets(buckets, cli);
    prepareOutputDirs(cfg, cleanupAlias);
    runBackup(alias, cfg, selectedBuckets);
  } catch (err) {
    printErrorBox(err.message);
    cleanupAlias();
    process.exit(1);
  } finally {
    cleanupAlias();
  }
}

export async function main() {
  const cli = parseCli();

  if (cli.help) {
    printHelp();
    return;
  }

  if (cli.error) {
    printErrorBox(cli.error);
    process.exit(1);
  }

  if (cli.headless) {
    await runHeadless(cli);
    return;
  }

  await runInteractive();
}

main();

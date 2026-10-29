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

export async function main() {
  printBanner();
  ensureLocalBinInPath();

  if (!commandExists('mc')) {
    log.warn('MinIO client (mc) is not installed.');
    const install = await askInstallMc();

    if (!install) {
      log.error('mc is required. Exiting.');
      process.exit(1);
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

  let buckets;
  const connSpinner = ora(spinnerStyle('Verifying connection and credentials …')).start();
  try {
    configureAlias(alias, cfg);
    buckets = listBuckets(alias, cfg.insecure);
    if (!buckets.length) {
      connSpinner.stop();
      printErrorBox('Connection succeeded but no buckets found, or access denied.');
      cleanupAlias();
      process.exit(1);
    }
    connSpinner.stop();
    printConnectionRecap(cfg, buckets.length);
  } catch (err) {
    connSpinner.stop();
    printErrorBox(formatConnectionError(err));
    cleanupAlias();
    process.exit(1);
  }

  try {
    printStep('Output');
    const output = await askOutput();
    cfg = { ...cfg, ...output };

    if (cfg.createZip && !commandExists('zip')) {
      log.error('zip is required to create archives but is not installed. Install zip, or skip creating zip files.');
      cleanupAlias();
      process.exit(1);
    }

    fs.mkdirSync(cfg.downloadDir, { recursive: true });
    if (cfg.createZip) fs.mkdirSync(cfg.zipDir, { recursive: true });

    printStep('Select buckets');
    const selectedBuckets = await askBuckets(buckets);

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
  } catch (err) {
    log.error(err.message);
    cleanupAlias();
    process.exit(1);
  } finally {
    cleanupAlias();
  }
}

main();

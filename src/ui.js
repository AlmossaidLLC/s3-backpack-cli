import chalk from 'chalk';

export const brand = {
  purple: chalk.hex('#3d348b'),
  peri: chalk.hex('#7678ed'),
  gold: chalk.hex('#f7b801'),
  orange: chalk.hex('#f18701'),
  flame: chalk.hex('#f35b04'),
};

export const promptPrefix = chalk.dim('  │');

const border = (s) => chalk.dim(s);

function visibleLength(text) {
  return String(text).replace(/\u001B\[[0-9;]*m/g, '').length;
}

function boxWidth() {
  const cols = process.stdout.columns || 72;
  return Math.max(48, Math.min(72, cols - 2));
}

function wrapText(text, width) {
  const str = String(text);
  if (!str) return [''];
  if (visibleLength(str) <= width) return [str];

  const words = str.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (visibleLength(next) <= width) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function padInner(content, innerWidth) {
  const vis = visibleLength(content);
  const pad = Math.max(0, innerWidth - vis);
  return content + ' '.repeat(pad);
}

function printBoxLine(content, width) {
  const inner = width - 4;
  console.log('  ' + border('│ ') + padInner(content, inner) + border(' │'));
}

export function printBox({ title, lines = [], footer } = {}) {
  const width = boxWidth();
  const inner = width - 4;
  const label = title || '';
  const dashes = Math.max(1, width - visibleLength(label) - 5);

  console.log('');
  console.log('  ' + border('╭─ ') + brand.gold(label) + border(' ' + '─'.repeat(dashes) + '╮'));

  for (const line of lines) {
    const chunks = wrapText(line, inner);
    for (const chunk of chunks) printBoxLine(chunk, width);
  }

  if (footer) {
    printBoxLine('', width);
    for (const chunk of wrapText(footer, inner)) {
      printBoxLine(chalk.dim(chunk), width);
    }
  }

  console.log('  ' + border('╰' + '─'.repeat(width - 2) + '╯'));
  console.log('');
}

export function printBanner() {
  printBox({
    title: 'S3 Backpack',
    lines: ['Backup S3-compatible storage', 'MinIO · RustFS · AWS S3'],
  });
}

export const log = {
  info: (msg) => console.log(promptPrefix + '  ' + msg),
  ok: (msg) => console.log(promptPrefix + '  ' + chalk.green('✓  ') + chalk.green(msg)),
  error: (msg) => console.error(promptPrefix + '  ' + chalk.red('✗  ') + chalk.red(msg)),
  warn: (msg) => console.log(promptPrefix + '  ' + brand.orange('⚠  ') + brand.orange(msg)),
};

export function printStep(label) {
  console.log('');
  console.log('  ' + brand.gold('●') + '  ' + chalk.white.bold(label));
  console.log(promptPrefix);
}

function recapRow(label, value) {
  const padded = String(label).padEnd(12);
  return chalk.dim(padded) + chalk.white(value);
}

export function printConnectionRecap(cfg, bucketCount) {
  const tls = cfg.insecure ? 'insecure (self-signed)' : 'secure';
  const countLabel = `${bucketCount} bucket${bucketCount !== 1 ? 's' : ''}`;
  const lines = [
    recapRow('endpoint', cfg.endpoint),
    recapRow('buckets', countLabel),
    recapRow('path style', cfg.pathMode),
    recapRow('signature', cfg.apiSignature),
    recapRow('tls', tls),
  ];
  if (cfg.region) lines.push(recapRow('region', cfg.region));

  printBox({
    title: 'Connected',
    lines,
    footer: `${countLabel} · credentials verified`,
  });
}

export function printBucketHeader(bucket) {
  console.log('');
  console.log('  ' + brand.gold('●') + '  ' + chalk.white.bold(bucket));
  console.log(promptPrefix);
}

export function printBackupRecap(results, createZip) {
  const lines = results.map((item) => {
    const shown = createZip ? item.zipPath : item.targetDir;
    return brand.gold('›  ') + chalk.white(shown);
  });
  const count = `${results.length} bucket${results.length !== 1 ? 's' : ''}`;
  const footer = createZip ? `${count} · zip archives ready` : `${count} · mirrored locally`;

  printBox({
    title: 'Done',
    lines,
    footer,
  });
}

export function printErrorBox(message) {
  const lines = String(message)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  printBox({
    title: 'Error',
    lines,
  });
}

export function spinnerStyle(text) {
  return {
    text: brand.peri(text),
    color: 'yellow',
    prefixText: promptPrefix,
  };
}

export function formatConnectionError(err) {
  const raw = String(err && err.message ? err.message : err);
  const lower = raw.toLowerCase();
  const mcDetail = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^mc:\s*<ERROR>\s*/i, '').trim())
    .find((line) => line && !line.startsWith('Command failed:'));

  if (
    /access key|invalidaccesskeyid|signaturedoesnotmatch|signature we calculated|does not exist in our records|invalid credentials|access denied|secret key/i.test(
      raw,
    )
  ) {
    return 'Credentials were rejected.\nCheck the access key, secret key, and endpoint, then try again.';
  }

  if (
    /enotfound|econnrefused|econnreset|etimedout|timed out|timeout|no such host|could not resolve/i.test(
      lower,
    )
  ) {
    return 'Could not reach the endpoint.\nCheck the URL and network, then try again.';
  }

  if (/certificate|x509|ssl|tls/i.test(lower)) {
    return 'TLS/certificate error.\nIf the endpoint uses a self-signed cert, enable insecure TLS.';
  }

  return mcDetail || raw;
}

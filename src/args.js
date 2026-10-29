import path from 'path';
import { parseArgs } from 'node:util';
import { normalizeEndpoint } from './shell.js';

const EXAMPLE =
  's3-backpack-cli --endpoint https://minio.example.com --access-key KEY --secret-key SECRET --buckets invoices --yes';

function env(name) {
  const value = process.env[name];
  if (value == null || String(value).trim() === '') return undefined;
  return String(value).trim();
}

function envBool(name) {
  const value = env(name);
  if (value == null) return undefined;
  return /^(1|true|yes|on)$/i.test(value);
}

function first(...values) {
  for (const value of values) {
    if (value != null && value !== '') return value;
  }
  return undefined;
}

function parseBucketList(raw) {
  if (raw == null || raw === '') return [];
  return String(raw)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function printHelp() {
  console.log(`S3 Backpack CLI

Usage:
  s3-backpack-cli
  s3-backpack-cli [options]

Interactive TUI is the default. Pass flags or S3_* environment variables
to run non-interactively (cron, Supervisor, CI).

Options:
  --endpoint <url>         S3-compatible endpoint
  --access-key <key>       Access key
  --secret-key <secret>    Secret key
  --buckets <a,b,c>        Buckets to back up (comma-separated)
  --all-buckets            Back up every bucket
  --insecure               Allow self-signed TLS certificates
  --path-mode <mode>       auto | on | off (default: auto)
  --api <signature>        S3v4 | S3v2 (default: S3v4)
  --region <region>        Optional region
  --download-dir <path>    Download directory (default: ./backups)
  --zip                    Create a zip archive per bucket
  --zip-dir <path>         Zip output directory (implies --zip)
  --yes, -y                Skip confirms (auto-install mc)
  --help, -h               Show this help

Environment (recommended for secrets under Supervisor):
  S3_ENDPOINT  S3_ACCESS_KEY  S3_SECRET_KEY  S3_BUCKETS
  S3_INSECURE  S3_PATH_MODE   S3_API         S3_REGION
  S3_DOWNLOAD_DIR  S3_ZIP  S3_ZIP_DIR

Examples:
  ${EXAMPLE}

  S3_ENDPOINT=https://minio.example.com S3_ACCESS_KEY=KEY S3_SECRET_KEY=SECRET \\
    S3_BUCKETS=invoices,assets s3-backpack-cli --yes --insecure
`);
}

export function parseCli(argv = process.argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv.slice(2),
      options: {
        endpoint: { type: 'string' },
        'access-key': { type: 'string' },
        'secret-key': { type: 'string' },
        buckets: { type: 'string' },
        'all-buckets': { type: 'boolean', default: false },
        insecure: { type: 'boolean', default: false },
        'path-mode': { type: 'string' },
        api: { type: 'string' },
        region: { type: 'string' },
        'download-dir': { type: 'string' },
        zip: { type: 'boolean', default: false },
        'zip-dir': { type: 'string' },
        yes: { type: 'boolean', short: 'y', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err) {
    return {
      help: false,
      headless: true,
      error: `${err.message}\n  ${EXAMPLE}`,
    };
  }

  if (values.help) {
    return { help: true, headless: false };
  }

  const fromEnv = {
    endpoint: env('S3_ENDPOINT'),
    accessKey: env('S3_ACCESS_KEY'),
    secretKey: env('S3_SECRET_KEY'),
    buckets: env('S3_BUCKETS'),
    insecure: envBool('S3_INSECURE'),
    pathMode: env('S3_PATH_MODE'),
    api: env('S3_API'),
    region: env('S3_REGION'),
    downloadDir: env('S3_DOWNLOAD_DIR'),
    zip: envBool('S3_ZIP'),
    zipDir: env('S3_ZIP_DIR'),
    allBuckets: envBool('S3_ALL_BUCKETS'),
  };

  const usedArgv = argv.slice(2).length > 0;
  const usedEnv = Boolean(
    fromEnv.endpoint || fromEnv.accessKey || fromEnv.secretKey || fromEnv.buckets,
  );
  const noTty = !process.stdin.isTTY;
  const headless = usedArgv || usedEnv || noTty;

  if (!headless) {
    return { help: false, headless: false };
  }

  const createZip = Boolean(values.zip || values['zip-dir'] || fromEnv.zip || fromEnv.zipDir);
  const downloadDir = path.resolve(
    first(values['download-dir'], fromEnv.downloadDir, path.join(process.cwd(), 'backups')),
  );
  const zipDir = createZip
    ? path.resolve(first(values['zip-dir'], fromEnv.zipDir, downloadDir))
    : null;

  const pathMode = first(values['path-mode'], fromEnv.pathMode, 'auto');
  const apiSignature = first(values.api, fromEnv.api, 'S3v4');
  const bucketsRaw = first(values.buckets, fromEnv.buckets);
  const allBuckets = Boolean(values['all-buckets'] || fromEnv.allBuckets || bucketsRaw === '*');

  if (!['auto', 'on', 'off'].includes(pathMode)) {
    return { help: false, headless: true, error: `Invalid --path-mode "${pathMode}". Use auto, on, or off.` };
  }
  if (!['S3v4', 'S3v2'].includes(apiSignature)) {
    return { help: false, headless: true, error: `Invalid --api "${apiSignature}". Use S3v4 or S3v2.` };
  }

  const endpointRaw = first(values.endpoint, fromEnv.endpoint);
  const accessKey = first(values['access-key'], fromEnv.accessKey);
  const secretKey = first(values['secret-key'], fromEnv.secretKey);

  const missing = [];
  if (!endpointRaw) missing.push('--endpoint (or S3_ENDPOINT)');
  if (!accessKey) missing.push('--access-key (or S3_ACCESS_KEY)');
  if (!secretKey) missing.push('--secret-key (or S3_SECRET_KEY)');
  if (!allBuckets && parseBucketList(bucketsRaw).length === 0) {
    missing.push('--buckets (or --all-buckets, or S3_BUCKETS)');
  }

  if (missing.length) {
    return {
      help: false,
      headless: true,
      error: `Missing required values: ${missing.join(', ')}\n  ${EXAMPLE}`,
    };
  }

  let endpoint;
  try {
    endpoint = normalizeEndpoint(endpointRaw);
  } catch (err) {
    return { help: false, headless: true, error: err.message };
  }

  return {
    help: false,
    headless: true,
    yes: Boolean(values.yes) || noTty || usedEnv,
    allBuckets,
    requestedBuckets: allBuckets ? [] : parseBucketList(bucketsRaw),
    cfg: {
      endpoint,
      accessKey,
      secretKey,
      insecure: Boolean(values.insecure || fromEnv.insecure),
      pathMode,
      apiSignature,
      region: first(values.region, fromEnv.region, ''),
      downloadDir,
      createZip,
      zipDir,
    },
  };
}

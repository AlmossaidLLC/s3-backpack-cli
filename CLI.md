# CLI arguments

Interactive TUI is the default. Pass flags (or `S3_*` environment variables) to run without prompts — useful for Supervisor, cron, and CI.

## Show help

```bash
npm start -- --help
```

```bash
npx github:AlmossaidLLC/s3-backpack-cli --help
```

`-h` is the same as `--help`.

When you use `npm start`, put `--` before the flags so npm forwards them to the CLI.

## Required flags

These are required in non-interactive mode:

| Flag | Environment | Description |
|---|---|---|
| `--endpoint <url>` | `S3_ENDPOINT` | S3-compatible endpoint (`https://host[:port]`, no path) |
| `--access-key <key>` | `S3_ACCESS_KEY` | Access key |
| `--secret-key <secret>` | `S3_SECRET_KEY` | Secret key |
| `--buckets <a,b,c>` | `S3_BUCKETS` | Buckets to back up, comma-separated |

`--all-buckets` (or `S3_BUCKETS=*` / `S3_ALL_BUCKETS=1`) can replace `--buckets`.

## Optional flags

| Flag | Environment | Default | Description |
|---|---|---|---|
| `--insecure` | `S3_INSECURE=1` | off | Allow self-signed TLS certificates |
| `--path-mode <mode>` | `S3_PATH_MODE` | `auto` | `auto`, `on` (path-style), or `off` (virtual-host) |
| `--api <signature>` | `S3_API` | `S3v4` | `S3v4` or `S3v2` |
| `--region <region>` | `S3_REGION` | empty | Optional region |
| `--download-dir <path>` | `S3_DOWNLOAD_DIR` | `./backups` | Local download directory |
| `--zip` | `S3_ZIP=1` | off | Create a zip archive per bucket |
| `--zip-dir <path>` | `S3_ZIP_DIR` | same as download dir | Zip output directory (implies `--zip`) |
| `--yes`, `-y` | — | off | Skip confirms (auto-install `mc`) |
| `--help`, `-h` | — | — | Print this help and exit |

Boolean environment values accept `1`, `true`, `yes`, or `on`.

## Local example

```bash
npm start -- \
  --yes \
  --insecure \
  --endpoint https://minio.example.com \
  --access-key KEY \
  --secret-key SECRET \
  --buckets invoices,assets \
  --download-dir ./backups
```

Prefer environment variables for secrets so they do not show up in `ps`:

```bash
S3_ENDPOINT=https://minio.example.com \
S3_ACCESS_KEY=KEY \
S3_SECRET_KEY=SECRET \
S3_BUCKETS=invoices \
npm start -- --yes --insecure --download-dir ./backups
```

## One-liner (npx)

```bash
npx github:AlmossaidLLC/s3-backpack-cli --yes --insecure \
  --endpoint https://minio.example.com \
  --access-key KEY \
  --secret-key SECRET \
  --buckets invoices \
  --download-dir /var/backups/s3
```

## Supervisor

Keep credentials in `environment`, not in `command`.

```ini
[program:s3-backpack]
command=npx --yes github:AlmossaidLLC/s3-backpack-cli --yes --insecure --download-dir /var/backups/s3 --buckets invoices,assets
autostart=false
autorestart=false
environment=S3_ENDPOINT="https://minio.example.com",S3_ACCESS_KEY="admin",S3_SECRET_KEY="secret"
```

## Notes

- Missing required values fail immediately with an example. The process will not hang on prompts.
- Unknown flags (for example `--insecur` instead of `--insecure`) also fail immediately.
- `--zip-dir` turns zip creation on even if `--zip` is omitted.
- If stdin is not a TTY (Supervisor, CI), interactive mode is disabled. Pass flags or `S3_*` variables.

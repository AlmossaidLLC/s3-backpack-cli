# S3 Backpack CLI

> Interactive terminal UI for backing up any S3-compatible storage - right from your terminal.

```bash
npx @almossaidllc/s3-backpack-cli
```

Works with **MinIO**, **RustFS**, **AWS S3**, and any other S3-compatible provider. Auto-installs the MinIO client (`mc`) if it is not already present.

---

## Features

- Colorful, interactive terminal UI with spinners and real-time status
- Auto-installs the MinIO client (`mc`) if missing - no manual setup
- Verifies connection and credentials before any download starts
- Lists all available buckets and lets you pick one or many
- Downloads each selected bucket and creates a `.zip` archive with a timestamp
- Supports self-signed TLS, path-style, virtual-host style, and both S3 API signatures
- Works on macOS and Linux

---

## Requirements

| Requirement | Notes |
|---|---|
| Node.js ≥ 18 | [nodejs.org](https://nodejs.org) |
| `zip` | Pre-installed on most systems (`brew install zip` / `apt install zip`) |
| Network access | To your S3-compatible endpoint |

> **`mc` (MinIO client)** is installed automatically to `~/.local/bin/mc` if not found.

---

## Usage

### Run without installing

```bash
npx @almossaidllc/s3-backpack-cli
```

### Install globally

```bash
npm install -g @almossaidllc/s3-backpack-cli
s3-backpack-cli
```

### Run from source

```bash
git clone git@github.com:AlmossaidLLC/s3-backpack-cli.git
cd s3-backpack-cli
npm install
npm start
```

---

## How It Works

1. **Endpoint & credentials** - enter your S3 endpoint URL, access key, and secret key
2. **Options** - choose path style, API signature, and optional region
3. **Connection check** - the tool verifies credentials before proceeding
4. **Bucket selection** - a checkbox list of all available buckets appears
5. **Backup** - each selected bucket is mirrored locally and compressed into a `.zip`

---

## Output Structure

| Path | Description |
|---|---|
| `<download_dir>/<bucket>/` | Raw files mirrored from the bucket |
| `<zip_dir>/<bucket>_<timestamp>.zip` | Compressed archive ready for storage |

Both paths are configurable during the interactive setup (defaults to `./backups/`).

---

## TUI Controls

| Key | Action |
|---|---|
| `Space` | Select / deselect a bucket |
| `↑ / ↓` | Navigate the bucket list |
| `Enter` | Confirm selection and start backup |
| `Ctrl+C` | Abort at any prompt |

---

## Compatibility

| Provider | Path Style | API Signature |
|---|---|---|
| MinIO | `auto` | `S3v4` |
| RustFS | `auto` | `S3v4` |
| AWS S3 | `auto` | `S3v4` |
| Legacy / older S3 | `on` | `S3v2` |

> If your endpoint uses a **self-signed certificate**, answer **yes** to the insecure TLS prompt.

---

## License

MIT


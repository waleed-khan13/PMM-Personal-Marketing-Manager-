# Installing Socium

Socium runs entirely on your computer. The normal installation needs Node.js 20.9 or newer; it does not need Docker, Python, uv, pnpm, or a source checkout.

## Install and start

Run the same command in PowerShell, Terminal, or a Linux shell:

```bash
npx socium@latest onboard
```

The CLI detects the operating system and CPU, downloads the matching GitHub Release archive over HTTPS, verifies its published SHA-256 checksum, installs it, starts FastAPI and Next.js on loopback, and opens `http://127.0.0.1:3000`. The first start creates SQLite, applies migrations, and generates the local encryption key.

Supported release targets are Windows x64/ARM64, macOS Intel/Apple silicon, and Linux x64/ARM64. A release is published only after its native runner completes the installed-bundle health smoke test.

## Lifecycle commands

Start or run an existing installation. Keep the terminal open and press `Ctrl+C` to stop both local services:

```bash
npx socium start
npx socium run
```

Check the installation or print the CLI version:

```bash
npx socium doctor
npx socium version
```

Update to the latest verified runtime, or force a fresh runtime download to repair an incomplete installation:

```bash
npx socium@latest update
npx socium@latest update --force
```

`start` and `run` open the same installed runtime. `doctor` checks Node, installation metadata, native API and web files, the data directory, and default ports. `update` verifies and activates the latest runtime without replacing local data.

Stop Socium with `Ctrl+C` before uninstalling. Normal uninstall removes downloaded runtimes but deliberately preserves business data:

```bash
npx socium uninstall --yes
```

Permanent deletion is explicit:

```bash
npx socium uninstall --yes --purge-data
```

That command removes installed runtimes, downloads, the SQLite database, `master.key`, media, and exports. Back up the whole `data` directory first; the database and its matching encryption key must stay together.

## Local files

| Platform | Application root |
| --- | --- |
| Windows | `%LOCALAPPDATA%\Socium` |
| macOS | `~/Library/Application Support/Socium` |
| Linux | `$XDG_DATA_HOME/socium` or `~/.local/share/socium` |

The root contains `runtimes/<version>/<target>` for replaceable program files and `data` for durable local state. Set `SOCIUM_HOME` before every CLI command only when an advanced or portable location is required.

## Ports and Labs

The console and internal API default to `127.0.0.1:3000` and `127.0.0.1:8000`. Both remain loopback-only. If either port is occupied:

```bash
npx socium start --port 3100 --api-port 8100
```

Lead intelligence and Local SEO remain preview workspaces in v1. Start them explicitly with `npx socium start --labs`.

## Release verification

Every GitHub Release includes the platform archive, a matching `.sha256` file, and `socium-manifest.json`. The CLI verifies the manifest checksum before extraction and validates the version/target metadata inside the archive. It refuses plain HTTP release downloads by default.

Docker Compose remains available as an optional advanced deployment path. It is not used by the one-command installer.

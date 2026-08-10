# LocalGrowth OS CLI

The `localgrowth-os` npm package installs and runs the localhost application without Docker, Python, uv, pnpm, or a source checkout. Node.js 20.9 or newer is the only prerequisite.

```bash
npx localgrowth-os onboard
```

The onboarding command selects the release bundle for the current operating system and CPU, verifies its published SHA-256 checksum, installs the immutable runtime under the operating system's application-data directory, initializes a separate durable data directory, starts the FastAPI and Next.js processes on loopback, and opens the console.

## Commands

```bash
npx localgrowth-os onboard
npx localgrowth-os start
npx localgrowth-os doctor
npx localgrowth-os update
npx localgrowth-os uninstall --yes
```

Uninstall preserves the SQLite database, encryption key, media, and exports by default. Add `--purge-data` only when that local business data should be permanently removed.

Docker Compose remains an optional deployment path and is not required by this CLI.

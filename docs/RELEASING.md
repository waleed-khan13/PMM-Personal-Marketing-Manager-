# Releasing LocalGrowth OS

Only a maintainer should run this procedure. A tag push publishes public GitHub Release assets and the public `localgrowth-os` npm package; the manual dry-run does neither.

## One-time npm setup

The first release needs an npm account with two-factor authentication and a short-lived granular access token that has package read/write permission and bypasses 2FA for this non-interactive publication. Because `localgrowth-os` does not exist before its first publication, the initial token may need access to all packages owned by the maintainer.

Save that token as the repository Actions secret `NPM_TOKEN` under **Settings → Secrets and variables → Actions**. Never add it to a local `.env`, git, workflow YAML, issue, or log. After the first package exists, configure npm trusted publishing for:

- GitHub owner: `waleed-khan13`
- Repository: `PMM-Personal-Marketing-Manager-`
- Workflow filename: `release.yml`
- Allowed action: `npm publish`

The workflow grants `id-token: write`, runs on a GitHub-hosted runner, and publishes with provenance. Once trusted publishing succeeds, remove the long-lived repository token and restrict token-based publishing in the npm package settings.

## 1. Prepare the candidate

The worktree must be clean and every version source must agree:

```bash
pnpm install --frozen-lockfile
pnpm runtime:sync
npm audit --omit=dev --audit-level=high --prefix packaging/web-runtime
pnpm release:verify
pnpm check
```

The changelog and installation documentation must describe the same version. Do not tag a commit that has not passed CI on `main`.

## 2. Run the cross-platform dry-run

Open **Actions → Native release → Run workflow** and use:

- `ref`: `main` (or the exact candidate commit)
- `publish`: disabled

This builds Windows x64/ARM64, macOS Intel/Apple silicon, and Linux x64/ARM64 on native GitHub runners. Each job builds and health-checks the bundled FastAPI service, constructs the checksummed archive, installs it into an empty application-data root, runs `doctor`, and boots the installed UI/API. The dry-run uploads workflow artifacts but skips GitHub Release and npm publication.

Do not continue until all six matrix jobs are green.

## 3. Tag and publish

Create one annotated tag after the candidate commit and version are final:

```bash
git tag -a v1.0.0 -m "LocalGrowth OS 1.0.0"
git push origin v1.0.0
```

The tag-triggered workflow repeats all native builds rather than trusting dry-run artifacts. It then creates the GitHub Release, uploads every archive and `.sha256` file plus `localgrowth-manifest.json`, and publishes the CLI to npm. Never move or reuse a published version tag. If publication fails after npm accepts the version, fix the issue and release a new patch version.

## 4. Verify the public release

Check that the workflow is green and that the GitHub Release contains six archives, six checksum files, and one manifest. Then use a clean temporary application home on a supported machine:

```bash
npx localgrowth-os@1.0.0 onboard
npx localgrowth-os@1.0.0 doctor
```

Confirm that the browser opens on loopback, `/api/health` reports version `1.0.0` and edition `social-v1`, and normal uninstall preserves the data directory. Announce the release only after this public-download verification passes.

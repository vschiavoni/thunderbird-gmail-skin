# Thunder-G documentation website

Docusaurus 3.9.2 website. Requirements: Bun 1.3+ and Python 3. Bun runs the CLI directly, without using the system Node.js installation.
The extension's own development requirements remain documented separately.

## Run locally

```sh
cd documentation
bun install
bun start
```

Open http://localhost:3000. To check a production build:

```sh
bun run build
bun run serve
```

Edit Markdown directly in `content/`; Docusaurus reloads it on save. `bun start`
and `bun run dev` also watch the repository README, changelog and manifest. Changes
to README/changelog regenerate only their two site pages. Manifest changes refresh
the displayed version and restart Docusaurus to reload configuration metadata.
No manual synchronization command is needed. Ctrl+C stops the watcher and server.

The homepage is a custom landing page at `/`. The documentation index is at
`/documentation`; individual guide URLs stay unchanged. The homepage contains a browser simulation with fictional mail at `/#demo`.
It supports search, conversations, labels, stars, archive/trash, a timed snooze,
and simulated compose/reply. It never connects to an account or sends email.
Changes stay in component memory and reset on reload.

## Where to edit

- Overview and release history: edit the repository README and changelog.
- Reference manuals: edit `content/docs/`.
- DKIM/BIMI integration notes: edit `content/integrations/README.md`.
- New guides and documentation index: edit `content/`.
- Interactive demo: `src/components/MailDemo/`, embedded in the landing page.
- Landing page: `src/pages/index.jsx` and `src/pages/index.module.css`.
- Navigation: `sidebars.js`.
- Appearance: `src/css/custom.css`.
- Generated pages: `content/README.md` and `content/CHANGELOG.md` (ignored; edit their repository-root sources).

All authored guides and reference manuals live in `documentation/content/`.
The two generated pages normalize repository-relative links. Authored guides and
their public illustrations are read directly from `content/`. `archive/` contains historical notes, and `local-assets/`
contains private local files; neither is published by the site or source packager. The repository README's HTML is supported through Markdown format
detection. Markdown links are checked during production builds.

## Before publishing

Set `SITE_URL` and `BASE_URL` for the chosen host. For project GitHub Pages, for example:

```sh
SITE_URL=https://vschiavoni.github.io BASE_URL=/thunderbird-gmail-skin/ bun run build
```

Deploy the resulting `build/` using your chosen hosting workflow. The included workflow deploys to GitHub Pages after repository setup. Check walkthroughs against the target release and the recorded compatibility limits
before publishing. See the coverage page in the site.

Docusaurus reference: https://docusaurus.io/docs/3.9.2/installation

## Preview and live editing

The site is English-only. `bun start` (or `bun run dev`) starts the development
server with hot reload. Use `bun run build` followed by `bun run serve` for a
production preview. Publish the full build directory with the intended base path.

## Documentation search

The navbar search indexes docs locally at build time. Use Ctrl+K on Windows/Linux
or Command+K on macOS, type a term, then use arrows/Enter to open a result. No
external search service or API key is required. Rebuild after content changes to
refresh the index; validate search with `bun run build` and `bun run serve`.
The mail simulation's search remains independent from documentation search.

## Public examples

Use generic teams, services and project names in public examples. Use
`example.invalid` for fictional mail addresses; never copy real subjects, account
names, profile paths or message identifiers into sample data. Repository URLs
and extension IDs must remain exact when they are part of an installation or
integration procedure. Archives and local assets are excluded from publication.

## Release deployment

The reusable `.github/workflows/docs.yml` can be run manually with a ref or called
by `release.yml` after the latest stable release's assets are published. It checks
out the release commit, imports the matching changelog and builds for the Pages
destination. Set Pages to GitHub Actions once; see the
[hosting guide](content/guides/website-and-hosting.md#automatic-deployment).
The overview reports the version from `thunder-g/manifest.json`; the same manifest
version is used by site metadata. Both follow the selected release commit.

## Metadata validation

Authored pages use explicit front-matter descriptions. The README/changelog imports
receive site-specific metadata without modifying the repository files. Shared
metadata components add article/software/site JSON-LD using the build manifest.

Only fork deployments get site-wide `noindex` through `DOCS_NOINDEX=true`;
normal local and production builds are indexable by default. Search results and 404 pages always stay `noindex`.
Run `python3 scripts/check_seo.py build` with the same environment values as the
build; the deployment workflow does this before uploading the Pages artifact.

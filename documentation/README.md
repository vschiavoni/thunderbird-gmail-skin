# Thunder-G documentation website

Docusaurus 3.9.2 scaffold. Requirements: Bun 1.3+ and Python 3. Bun runs the CLI directly, without using the system Node.js installation.
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

`bun start`, `bun run dev` and `bun run build` first import the repository Markdown. After editing
an original source while the dev server is running, run `bun run sync-docs` again.

The homepage is a custom landing page at `/`. The documentation index is at
`/documentation`; individual guide URLs stay unchanged. The homepage contains a browser simulation with fictional mail at `/#demo`.
It supports search, conversations, labels, stars, archive/trash, a timed snooze,
and simulated compose/reply. It never connects to an account or sends email.
Changes stay in component memory and reset on reload.

## Where to edit

- Overview and release history: edit the repository README and changelog.
- Reference manuals: edit `pages/docs/`.
- DKIM/BIMI integration notes: edit `pages/integrations/README.md`.
- New guides and landing page: edit `pages/`.
- Interactive demo: `src/components/MailDemo/`, embedded in the landing page.
- Landing page: `src/pages/index.jsx` and `src/pages/index.module.css`.
- Navigation: `sidebars.js`.
- Appearance: `src/css/custom.css`.
- Generated copies: `content/` (ignored; do not edit).

All authored guides and reference manuals live in `documentation/pages/`.
The import normalizes repository-relative links and copies only the referenced logo
and SVG illustrations. `archive/` contains historical notes, and `local-assets/`
contains private local files; neither is published by the site or source packager. The repository README's HTML is supported through Markdown format
detection. Markdown links are checked during production builds.

## Before publishing

Set `SITE_URL` and `BASE_URL` for the chosen host. For project GitHub Pages, for example:

```sh
SITE_URL=https://vschiavoni.github.io BASE_URL=/thunderbird-gmail-skin/ bun run build
```

Deploy the resulting `build/` using your chosen hosting workflow. No deployment or
remote changes are configured. Check walkthroughs against the target release and the recorded compatibility limits
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
[hosting guide](pages/guides/website-and-hosting.md#automatic-deployment).
The sync script replaces `{{THUNDER_G_VERSION}}` in authored Markdown with the
version in `thunder-g/manifest.json`, so the coverage page follows the release.

## Metadata validation

Authored pages use explicit front-matter descriptions. The README/changelog imports
receive site-specific metadata without modifying the repository files. Shared
metadata components add article/software/site JSON-LD using the build manifest.

Only fork deployments get site-wide `noindex` through `DOCS_NOINDEX=true`;
normal local and production builds are indexable by default. Search results and 404 pages always stay `noindex`.
Run `python3 scripts/check_seo.py build` with the same environment values as the
build; the deployment workflow does this before uploading the Pages artifact.

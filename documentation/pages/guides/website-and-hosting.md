---
description: "Build the Thunder-G documentation site, configure GitHub Pages, deploy from a release or fork branch and maintain the local documentation search."
---

# Build and host this documentation

The landing, embedded mail simulation and documentation form one English-language
static Docusaurus site. GitHub Pages needs no mail server or account login to serve it.

## Local commands

```sh
cd documentation
bun install
bun start
```

Bun runs the CLI directly; Python imports repository Markdown before startup/build.
`bun start` and `bun run dev` provide hot reload. For a production preview:

```sh
bun run build
bun run serve
```

Internal links and anchors are checked during build. The existing `ws` cache warning
does not by itself mean failure: check the command exit status and final result.

## Source files

| Content | Source |
| --- | --- |
| Reference manuals | documentation/pages/docs/ |
| Integration notes | documentation/pages/integrations/README.md |
| Overview and history | Repository README and changelog |
| Walkthroughs and index | documentation/pages/ |
| Landing | documentation/src/pages/index.jsx |
| Documentation footer | documentation/src/theme/Footer/ |
| Shared navigation | documentation/sidebars.js and docusaurus.config.js |
| Portable mail simulation | documentation/src/components/MailDemo/ |

Do not edit generated `documentation/content/`; import recreates it from the sources.
Only allowlisted documentation images are copied, not private screenshots or archives.

## GitHub Pages build

For the upstream project path:

```sh
SITE_URL=https://vschiavoni.github.io BASE_URL=/thunderbird-gmail-skin/ bun run build
```

## Automatic deployment

`.github/workflows/docs.yml` builds and deploys the complete site, including the
landing, guides, changelog and local search index. It installs the locked Bun
dependencies, imports Markdown and uploads `documentation/build/` to Pages.
The URL and base path come from GitHub Pages, including custom-domain settings.

Once per repository, set **Settings → Pages → Build and deployment → Source**
to **GitHub Actions**. Keep the `github-pages` environment configured to allow
release tags as deployment sources (and the chosen branch for manual deploys).
Required environment approvals still apply. Merge both workflows into the default
branch before using them, and include them in future release tags.

After release assets succeed, `release.yml` calls this workflow for the exact
checked-out release commit, only when the release is the latest stable release.
This also works when the release workflow publishes a draft with `GITHUB_TOKEN`;
it does not rely on that publication starting another event-triggered run.
Prereleases, drafts that remain unpublished and failed asset builds do not deploy.
Re-running an older release does not replace the latest release's documentation.

For a documentation-only update or a failed Pages deployment, open **Actions →
Deploy documentation → Run workflow** and enter the desired branch, tag or commit
in **ref**. Leave it empty to use the default branch. This replaces the live site;
it does not publish an extension release.

For testing in a fork before merging, a push to `feat/docs` also builds and
deploys that exact commit. This push trigger is skipped in non-fork repositories;
production deployment remains tied to stable releases or an explicit manual run.
Enable Pages with GitHub Actions in the fork first. This path does not require
the workflow to be on the default branch.

Build imports `README.md` and `CHANGELOG.md` from the selected commit. The
manifest-version placeholder in authored Markdown is replaced with the selected
manifest version. Update the
actual guides alongside feature changes before tagging; this workflow publishes
those sources and does not generate feature descriptions from code or GitHub
release notes. Generated `content/` and `build/` are never committed back.

A Pages failure leaves the previous deployment in place and does not roll back
an already published extension release. Check both workflow jobs before announcing
an update. Local build/serve commands never deploy anything.

## Search the documentation

Use the navbar search or Ctrl+K (Command+K on macOS). Results include guide text
and section headings, with keyboard navigation. The static search index is built
with the site, requires no external account and must be rebuilt after content
changes. Use a production preview to test it. It is separate from the simulated
mail search embedded in the homepage.

## Search visibility and metadata

Guide descriptions are maintained in Markdown front matter. The generated
overview and release notes receive their own titles and descriptions during
source import; the repository README is not rewritten. Canonical URLs and social
images use the deployment origin and base path. Social cards use the existing
1280×640 visual at `static/img/thunder-g-social.png`; the square logo remains the
favicon. Update the image and its declared dimensions together; the metadata
check verifies the PNG dimensions and matching Open Graph/Twitter image URLs. The site includes `WebSite`,
`SoftwareApplication` and `TechArticle` structured data with the manifest version.
It does not invent reviews, ratings, authors or update timestamps.

Only fork deployments receive site-wide `noindex`: the workflow sets
`DOCS_NOINDEX=true` from the repository fork flag. Normal builds, including
production, are indexable by default.
Internal search results and the 404 page remain excluded, including on production.
The production sitemap lists the content pages, including the mail-search reference,
but omits internal site-search results. A sitemap is not emitted for fork previews.

The workflow runs `python3 scripts/check_seo.py build` after the site build.
This checks descriptions, canonical URLs, social images, structured data and the
indexing policy. To verify a production build locally, use the same `SITE_URL`
and `BASE_URL` values for both the build and the check. To reproduce a fork build,
set `DOCS_NOINDEX=true` for both commands.

Keep answers readable, describe experimental features as such and update guides
with their actual source behavior. A site build cannot guarantee indexing or a
citation by an AI answer system. Google's
[AI search guidance](https://developers.google.com/search/docs/appearance/ai-features)
uses the same core search requirements; a special AI text file is not required.
On project Pages, crawler rules at the account domain's root are managed separately;
a `robots.txt` inside a project subpath would not replace those root rules.

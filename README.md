# sncfoundation.github.io

The website of the **Sheet-Native Computing Foundation** (SNCF), served by GitHub Pages at
[sncfoundation.github.io](https://sncfoundation.github.io). Like everything the foundation
hosts, it reconciles eventually.

## What lives here

- **Pages:** plain hand-written HTML, no build step. `index.html` is the front page;
  `projects.html` and `landscape.html` list the projects and their tiers; each project has a
  `project-<name>.html` page; posts are `blog-<slug>.html`, indexed from `blog.html`.
- **Certification:** `certification.html` and `certify-<program>.html` are the exams.
  Submitting one opens an issue from `.github/ISSUE_TEMPLATE/certify.yml` (or `rank.yml`).
- **Credential registry:** `registry/` holds every issued credential as JSON, plus
  `index.json` / `index.md`. It is the source of truth behind `verify.html`.
- **Credential workflow:** `.github/workflows/certify.yml` runs on new `certification` and
  `rank` issues, executes `.github/scripts/issue-credential.mjs` or `issue-rank.mjs`, commits
  the new registry entry to `master` and closes the issue. A concurrency group keeps the
  serial numbers race-free.
- **Assets:** `logos/` (project logos, SVG), `img/` (blog and release images),
  `letters/` (the sponsorship letters, PDF).

## Working on the site

Open the HTML files in a browser, or serve the directory locally:

```bash
python3 -m http.server 8000
```

Every push to `master` is deployed by GitHub Pages. Changes go through pull requests.

## Project tiers

When a project changes tier, update its card in `landscape.html` (the `data-tier` attribute
and the pill), its entry in `projects.html` and the status line on its `project-<name>.html`
page, so the three agree with the project's README. The tiers themselves are defined in the
[maturity model](https://sncfoundation.github.io/foundation.html#maturity).

---

<sub>The SNCF does not recommend running production on a spreadsheet. If you do, please film it.</sub>

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this folder is

`characterworld/` is a **meta-folder** hosting multiple related character-only browser pieces. Each project lives in its own subdirectory at the root; the root itself is a small directory/landing page and the shared policy scaffolding.

Current children:

- `charactershop/` — the flagship. Photoshop-style character-only paint program. Single HTML file. See `charactershop/CLAUDE.md` for its architecture.

Future children will be added as sibling directories (e.g. `characterfield/`, `charactertype/`, etc.). Each child is a self-contained single-file project; they share policy but not code.

## Project Law (applies to every child and the root)

This project is **character-only**. Every visible subject, UI control, cursor, border, particle, texture, and effect must be built from typed glyphs (ASCII, Unicode, box/block elements, punctuation, combining marks). The full policy lives in `AGENTS.md` and `skills/character-only-art/SKILL.md` — they are authoritative and shared across every child project.

Forbidden as visible subject matter: `<img>`, `<svg>`, `<video>`, sprite sheets, icon fonts used pictorially, 3D models, canvas `arc`/`rect`/`path` geometry, and CSS decorative shapes (blobs, gradient-as-art, border-radius cards, shadows carrying the art). Allowed: canvas `fillText`/`strokeText`, DOM text, CSS for layout/color/font/transforms only, and plain background fills that exist solely as a stage for characters.

Exception: OpenGraph/social-card PNGs inside child projects (e.g. `charactershop/og.png`, `charactershop/hero.png`) are metadata for external platforms — their pixels happen to depict character art. Do not reach for bitmap assets inside any `index.html`.

## Layout

```
characterworld/
├─ index.html              root landing page — character-only directory of sibling projects
├─ CLAUDE.md               this file (meta-level)
├─ AGENTS.md               shared character-only policy (authoritative)
├─ skills/
│  └─ character-only-art/  shared policy skill
├─ charactershop/          flagship: Photoshop-style paint program
│  ├─ index.html
│  ├─ CLAUDE.md            project-specific guidance
│  ├─ README.md
│  ├─ LICENSE
│  ├─ og.png, og-small.png, hero.png
```

The root `index.html` is a live, character-only directory page — it must itself obey project law (no images/SVG/path geometry in its rendering).

## Commands

No build system, package manager, lint, or test suite. Everything is static HTML + vanilla JS.

- Run everything locally: `python3 -m http.server 8000` then:
  - `http://localhost:8000/` → root directory page
  - `http://localhost:8000/charactershop/` → atelier
- Syntax-check a child's JS (example for charactershop): `sed -n '27,2453p' charactershop/index.html > /tmp/cw.js && node --check /tmp/cw.js` (adjust line range if the file grows).
- Syntax-check the root landing page JS: `sed -n '/<script>/,/<\/script>/p' index.html | sed '1d;$d' > /tmp/cw-root.js && node --check /tmp/cw-root.js`.
- Deploy: merging to `main` auto-publishes the whole tree to GitHub Pages:
  - Root: `https://willbearfruits.github.io/characterworld/`
  - Atelier: `https://willbearfruits.github.io/characterworld/charactershop/`
  - Build status: `gh api repos/willbearfruits/characterworld/pages/builds/latest --jq '.status'`.

## Adding a new sibling project

1. Create a new top-level directory at the repo root, e.g. `charactermuseum/`.
2. Inside it, follow the single-file standalone pattern: one `index.html`, no framework, fullscreen canvas, `fillText` only, system cursor hidden.
3. If the project warrants it, add a project-specific `charactermuseum/CLAUDE.md` with its architecture (see `charactershop/CLAUDE.md` as the template). Keep the meta-level rules (this file + `AGENTS.md`) inherited by reference, not duplicated.
4. Add an entry to `ENTRIES` in the root `index.html` so the directory page lists it.
5. If the project wants a social card, generate `charactermuseum/og.png` (1200×630) and wire its OG meta tags to `https://willbearfruits.github.io/characterworld/charactermuseum/og.png`.

Do **not**:
- Pull child-project files up to the root.
- Add frameworks, bundlers, or npm dependencies.
- Introduce image/SVG/icon assets as visible subject matter in any `index.html`.
- Add a root-level `index.html` that delegates to a child via `<meta http-equiv="refresh">` — the root directory page is its own character-only piece and the primary entry point.

## Deployment

- Repo: `willbearfruits/characterworld` (public)
- Pages: `main` branch, root, auto-deploys on push
- The root `index.html` is what renders at `.../characterworld/`; each child renders at `.../characterworld/<child>/`.
- Social preview at the repo root reuses `charactershop/og.png` via absolute URL in the root's OG meta tags (the atelier is the flagship; a dedicated root image can replace it later).

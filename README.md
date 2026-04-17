# characterworld

**A meta-folder of character-only browser pieces.** Every visible form in every project here is built from typed glyphs — ASCII, Unicode, box drawing, block elements, punctuation, combining marks. No raster images, no SVG illustrations, no canvas path geometry, no CSS decorative shapes.

**Live:** [willbearfruits.github.io/characterworld](https://willbearfruits.github.io/characterworld/)

---

## Projects

| # | Project | Status | Live |
|---|---|---|---|
| 01 | [`charactershop`](charactershop/) — Photoshop-style character-only paint program | shipped | [open](https://willbearfruits.github.io/characterworld/charactershop/) |

More coming. Each project is a self-contained single HTML file with zero dependencies.

![charactershop atelier](charactershop/hero.png)

---

## Law

See [`AGENTS.md`](AGENTS.md) and [`skills/character-only-art/SKILL.md`](skills/character-only-art/SKILL.md). Every child project inherits these rules.

Sibling repo: [`characterglitch`](https://github.com/willbearfruits/characterglitch) established the base style — standalone browser pieces, glyph grids, ASCII/Unicode/Zalgo corruption, dark void palettes, direct canvas rendering.

---

## Run it

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

The root page is a character-only directory of sibling projects. Click an entry (or press its number key) to open the project.

---

## License

MIT — see [`charactershop/LICENSE`](charactershop/LICENSE). Future projects may ship their own LICENSE files inside their subdirectories.

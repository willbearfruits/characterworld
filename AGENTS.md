# Characterworld Project Law

This project is character-only.

Every visible subject, texture, figure, landscape, interface element, decoration, particle, icon, transition, and effect must be built from typed characters: ASCII, Unicode glyphs, box drawing, block elements, punctuation, letters, numbers, symbols, and combining marks.

Do not use image assets, SVG illustrations, canvas vector shapes, CSS decorative shapes, 3D models, bitmap sprites, stock media, generated raster art, icon fonts as pictorial substitutes, or UI chrome that depends on non-character geometry.

Allowed:

- Plain background fills used only as a stage for characters.
- Canvas or DOM rendering when the visible marks are text glyphs.
- CSS for layout, color, font, spacing, opacity, transforms, and responsive behavior.
- Unicode and combining marks for density, corruption, motion, shading, and form.
- Character grids, ASCII diagrams, glyph sculptures, terminal windows, text maps, glyph particles, and text-mode animation.

Required practice:

- Treat characters as the material, not a skin.
- Build forms from glyph density, rhythm, alignment, overprinting, and corruption.
- Use character clusters for silhouettes, UI controls, borders, shadows, highlights, and cursors.
- Prefer harsh, direct browser-native systems over polished generic UI.
- If a feature seems to require an image, model, icon, or vector drawing, redesign it as character art instead.

Reference language: `characterglitch` established the base style: standalone browser pieces, glyph grids, ASCII/Unicode/Zalgo corruption, dark void palettes, direct canvas/DOM rendering, and character-only visual logic.

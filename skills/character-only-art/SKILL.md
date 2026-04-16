---
name: character-only-art
description: Enforce and design character-only visual systems for Characterworld, characterglitch-like browser pieces, glyph-based games, ASCII/Unicode canvas art, Zalgo text experiments, terminal interfaces, and any request where the user says to use only characters or avoid images/assets. Use when building, reviewing, or revising visuals so every visible form is made from text characters rather than images, SVG, vector shapes, sprites, models, or decorative CSS geometry.
---

# Character-Only Art

Use this skill to keep a project visually made of characters.

## Non-Negotiable Rule

Every visible form must be constructed from typed glyphs: ASCII, Unicode symbols, box drawing, block elements, punctuation, letters, numbers, brackets, mathematical symbols, and combining marks.

If a visual element is not made from characters, remove it or redesign it as character art.

## Allowed Materials

- Canvas text via `fillText` / `strokeText`.
- DOM text, preformatted text, monospace grids, labels, and character clusters.
- Unicode combining marks for Zalgo stacking, damage, decay, shimmer, and corruption.
- CSS for layout, color, font, spacing, opacity, transforms, responsive behavior, and plain background fills.
- Minimal solid background fills that only support legibility.

## Forbidden Materials

- Raster images, generated bitmap art, photos, sprites, video, or stock media.
- SVG drawings, path geometry, icon sets, illustrative logos, and vector decoration.
- Canvas path/arc/rect drawing used as visible subject matter.
- CSS decorative blobs, gradients-as-art, border-radius cards as visual identity, shadows that carry the art, and shape-based icons.
- 3D models, WebGL meshes, particle sprites, texture maps, and model imports.

## Design Method

1. Start from a character vocabulary: density ramps, border glyphs, structural symbols, noise marks, letters, digits, and combining marks.
2. Define a grid or text layout before adding motion.
3. Build silhouettes from glyph density and spacing.
4. Build depth using character choice, overprinting, brightness, color, scale, opacity, and mark stacking.
5. Build interaction by changing glyphs, density, alignment, corruption, trails, or text state.
6. For UI controls, use textual affordances: bracketed labels, glyph cursors, terminal panels, command lines, tabs made of text, and symbolic character buttons.
7. When tempted to add an image or shape, translate the intent into characters:
   - icon -> single glyph or compact glyph cluster
   - illustration -> ASCII/Unicode composition
   - texture -> repeated glyph field
   - shadow -> lower-contrast glyph echo
   - particle -> punctuation or combining-mark debris
   - border -> box drawing / brackets / repeated marks
   - character body -> glyph silhouette, density-map figure, or animated text puppet

## Implementation Pattern

For browser work:

- Prefer standalone HTML files unless the project already has a framework.
- Use a fullscreen canvas or fixed monospace DOM grid.
- Keep `resize()` responsible for recalculating columns, rows, font, and buffers.
- Use typed arrays for large grids or simulations.
- Render primary visuals by iterating cells and drawing glyphs.
- Hide the system cursor only if replacing it with a character cursor.
- Keep image preloads, SVG assets, and icon libraries out of the project.

## Review Checklist

Before finishing, inspect the code and output for non-character leakage:

- No `<img>`, `<svg>`, `<video>`, bitmap imports, sprite sheets, model files, or icon libraries.
- No canvas visible geometry except text and plain background clearing.
- No CSS decoration carrying the visual identity without glyphs.
- Every button, cursor, panel, figure, environment, logo, and transition reads as character-built.
- Mobile and desktop layouts preserve the glyph system rather than replacing it with conventional UI.

## Project Philosophy

Characterworld should inherit the hard lesson from `characterglitch`: characters are not an effect layer. They are the medium. The work should feel like a living text machine, not a normal site decorated with ASCII.

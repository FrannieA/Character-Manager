# Character Map

A lightweight, offline canvas-based character map for worldbuilding. Drag nodes, draw relationships, add shapes (regions/notes/arrows), snap to a grid, pan/zoom, search your register, and keep a full beginner-style character sheet per character (including portraits). Everything autosaves to localStorage and can be exported/imported as a single JSON file.

(This was originally made for me to keep track of my characters in the game Cult fo the Lamb so please forgive the referances)

## Features

- **Infinite canvas** with pan, zoom (cursor-anchored), and a titlebar double-click to reset the view.
- **Characters**: add/edit/delete, colour picker + presets, live search in the register, centre-on-click from the sidebar, multi-select + marquee drag.
- **Relationships**: link any two characters with general labels (friend/ally/enemy/family/lovers/married/siblings/child/rival/acquaintance/mentor). Links are two-way and auto-deduplicate on edit.
- **Shapes**: rectangles, ellipses, triangles, straight lines (with optional arrowheads), and text notes. Click-drag to draw, click to select/edit/resize endpoints/handles.
- **Snap grid**: toggleable 50-unit grid with visual lines and coordinate snapping for placement/dragging.
- **Persistence**: autosaves to `localStorage` under `characterMap`. Export/import a single pretty-printed `.json` file.
- **Character sheet**: paper-style overlay with Identity (portrait, age, pronouns, role, region, note), Appearance, Personality (traits, strengths/weaknesses, dynamic likes/dislikes lists), Motivation & goals, Relationships, Backstory/Change. Portraits upload, are **downscaled to ≤256px JPEG (q0.8)** as a data URL and rendered as a cover-cropped circle on nodes; falls back to colour + first letter when absent.
- **Responsive UI**: hamburger toggles the register on all screen sizes (slide-in drawer ≤900px, inline collapse ≥901px). Backdrops close drawers/panels on mobile.
- **Offline-first, zero build step**: plain HTML/CSS/JS — just open `character.html` in any modern browser.

## Getting Started

1. Clone or download this repo.
2. Open `character.html` in your browser (double-click is fine).
3. Click `+ Add Character`, give it a name, place it on the map.
4. Right-click/toolbar: draw links (`+ Add Link`), shapes (`◇ Shape`), toggle `⊞ Snap`, pan/select, export/import.

## File Structure

```text
Character_Manger/
├── character.html   # App UI (toolbar, sidebar, panels, character sheet overlay)
├── style.css        # Styles (parchment sheet, responsive drawer/collapse, print)
└── script.js        # Canvas rendering, interactions, state, sheet + avatar logic
```

## Character Sheet & Portraits

- Portraits are stored as a **small JPEG data URL** (`char.avatar`) via `fileToAvatar()` (downscale to ≤256px, quality 0.8). This keeps JSON/export small and portable with no use of external image files.
- On the canvas, `drawCharacterNode()` uses the cached image (cover-cropped circular) if loaded; otherwise shows a colour disc + the first letter of the name.
- Uploading a portrait is **staged** (`sheetPendingAvatar`) until you press **Save** on the sheet (so Cancel never commits an accidental image). Clear sets it to be removed on save.
- Export/import and `localStorage` persist the `avatar` field automatically (the data model serialises the whole `characters` array).

## Data Model (JSON)

Exported maps look like:

```json
{
  "characters": [
    {
      "id": 1,
      "name": "Narinder",
      "role": "Bishop",
      "region": "The Gateway",
      "x": 400,
      "y": 300,
      "color": "#6D2932",
      "age": "1000",
      "pronouns": "he/him",
      "note": "",
      "physicalTraits": "",
      "distinctiveFeatures": "",
      "traits": ["Mysterious"],
      "strengths": "",
      "weaknesses": "",
      "likes": ["chess", "dark rituals"],
      "dislikes": [],
      "motivation": "",
      "obstacle": "",
      "fear": "",
      "relationships": [{ "type": "enemy", "name": "Lamb" }],
      "backstory": "A bishop stripped of power.",
      "growth": "",
      "avatar": "data:image/jpeg;base64,..."
    }
  ],
  "relationships": [],
  "nextId": 2,
  "shapes": [],
  "nextShapeId": 1
}
```

> Note: `avatar` is optional (only present when set).

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Delete` / `Backspace` | Delete selected items (characters/links/shapes or multi-selection) |
| `Escape` | Clear selections, exit modes, close open panels/sheet |
| `Enter` | Confirm Add Character panel fields |
| Double-click title (`Character Map`) | Reset view (pan/zoom to origin) |


## Browser Compatibility

Tested in modern Chromium/Firefox-based browsers. Uses Canvas 2D, `localStorage`, `FileReader`, `toDataURL`, and CSS transforms. No external dependencies.

## Development Notes

- No build tools required. Edit HTML/CSS/JS directly.
- `script.js` is self-contained; state lives entirely in plain arrays.
- `draw()` is a full repaint each frame/update (small maps are cheap). Avatar images redraw on `load` via cache.
- Persistence is one-key JSON — simple and robust (try/catch around parse/import).

## License

MIT License — see [LICENSE](LICENSE) .

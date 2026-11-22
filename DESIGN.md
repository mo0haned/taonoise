# TaoNoise design language

**Idea:** a night sky you can mix. The page is a deep indigo-violet scene that drifts toward the sounds you play (steel blue for rain, deep blue for water, ember red for fire, green for forest, nebula violet for space) and reacts to the live audio. The interface floats on it as soft glass.

- **Palette (one, committed):** ink-violet night (`#0c0820` to `#221652`), luminous periwinkle accent (`#a99cff`), peach-coral warm accent (`#ffb89c`). Light theme is the same world at dawn: lavender to peach, deep indigo ink, accent `#5a43e8`. Each sound family has one hue (noise 262, rain 214, water 192, fire 22, nature 140, places 286, tones 330) used for its tile, slider fill and glow.
- **Type:** rounded humanist system stack (Nunito / Avenir Next / SF Rounded), heavy 800 display with -0.03em tracking, 15-16 px body. No web fonts: nothing is downloaded.
- **Controls:** big tactile sliders (44 px hit area, 12 px track, 28 px white thumb with a coloured halo), a 112 px gradient play button with a breathing ring while playing, pill chips for presets and filters.
- **Surfaces:** one glass layer (translucent fill, blur, 1 px edge). Cards are the content, never nested. Active sounds glow in their family hue.
- **Motion:** one authored idea: the scenery. Rain streaks, water ripples, fire glow and embers, drifting fog, twinkling stars and thunder flashes are driven by the master AnalyserNode and the weight of each sound in the mix. `prefers-reduced-motion` turns all of it (and every transition) off; the gradient still shifts.
- **Accessibility:** AA contrast in both themes, real `button`/`input[type=range]` elements with labels and value text, visible focus rings, 44 px targets, dialogs via `<dialog>`, live regions for the mix summary and toasts.

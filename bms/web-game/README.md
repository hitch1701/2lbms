# 2LBMS Retro Web Game

This folder contains a 1990s-style educational web game that simulates a Battery Management System (BMS).
Players adjust BMS parameters (charge current, balance threshold, OV/UV cutoffs, temperature limit), start a charging cycle,
and must keep the pack safe across 5 levels of increasing difficulty.

Files:
- index.html — main page and tutorial overlay
- style.css — retro CRT styling and tutorial overlay styles
- script.js — simulation, tutorial steps, and WebAudio-based sound effects
- README.md — this file

How to run:
1. Serve the folder via a static server (or open index.html in the browser).
2. Use sliders to configure the BMS and press START (or press Space).
3. Press T to open tutorial, N for next level, M to toggle sound.

Notes:
- Sounds are synthesized using the WebAudio API (no external assets).
- The tutorial highlights UI elements and explains their purpose.
- I recommend hosting this under /bms/web-game on gh-pages or as a static site.

License:
- Use the repository license (or add one if none present).

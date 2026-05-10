# Tiger Smash

Tiger Smash is a browser-based 2D side-scrolling platformer built with **Vite + React** and rendered entirely with **HTML5 Canvas**.

## Run locally

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.

## Controls

- `ArrowLeft` / `ArrowRight`: move
- `Space`: jump
- `Shift`: roar attack

## Notes

- Main game logic lives in `src/TigerSmashGame.jsx`.
- `src/App.jsx` renders only `TigerSmashGame`.
- Levels are deterministic per level number and every 5th level is a boss level.

# FarSpace

A pixel-art space sim about scale — fly, trade, mine, fight, and walk the corridors
of your own ship across a living galaxy.

**Play it:** https://fsociety.work

![FarSpace](docs/screenshot.png)

## The idea

One continuous universe you can zoom through: galaxy map → star system → dogfight →
dock at a station → walk your own ship's deck and repair the systems that got shot up.
Flight is top-down WSAD with real momentum — Battlestar Galactica meets The Expanse.
Ships are more than health bars: they're places.

See [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) for the full design and
[docs/ROADMAP.md](docs/ROADMAP.md) for milestones.

## Controls

| Context | Keys |
|---|---|
| Flight | **W/S** thrust · **A/D** rotate · **Space** fire · **M** mining laser · **X** brake assist · **E** dock / jump · **Tab** system map · **G** galaxy map · **I** board ship |
| Ship interior | **WASD** walk · **E** interact / repair |
| Station | **↑/↓** navigate · **Enter** select · **Esc** undock |
| Global | **F5** save · **F9** load |

## Development

```bash
npm install
npm run dev      # local dev server
npm run build    # typecheck + production build to dist/
npm run deploy   # build + deploy to Cloudflare (fsociety.work)
```

Zero runtime dependencies. TypeScript + Canvas 2D, 480×270 internal resolution
integer-upscaled for crisp pixels. Every sprite — ships, planets, stations,
portraits — is procedurally generated from the world seed.

## Status

Milestone 1 (vertical slice) is live. See the [roadmap](docs/ROADMAP.md).

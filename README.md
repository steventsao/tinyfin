# Drift

An ocean with no edge. You are a small fish.

**Play: https://steventsao.github.io/drift-ocean/**

A procedurally generated, endless underwater world in Three.js, drawn in a painterly toon style.
Swim through coral reefs, kelp forests, sand flats and the deep, eat glowing plankton, and find
rare giants — blue whales, sperm whales, orcas, whale sharks, manta rays, a giant squid and more —
at their true size next to you.

## Controls

| Input | Action |
|---|---|
| Mouse, or drag with a finger | Steer |
| W, or hold a finger down | Swim faster |
| Shift | Dash |
| Space / C | Rise / sink |
| M, or the Map button | Map: biomes, your heading, `?` for giants you haven't seen |
| T | Time of day: midday, golden hour, night |
| B | Bubbles |
| X | Mute |

## How it works

- **World.** The seafloor is 56 m chunks built from noise around you and recycled as you swim.
  A low-frequency biome field decides reef, kelp, sand flats or the deep. Each visit has a new
  world seed, shown in the HUD.
- **Giants.** The ocean is split into 320 m cells. A hash of each cell decides whether an encounter
  lives there. The cell is surveyed for habitat and water depth, and a species is chosen that
  actually fits: sperm whales and giant squid in the deep, mantas on reefs, great whites along kelp
  coasts. Each individual draws its size, girth, colour and pace from ranges for its species.
- **Models.** Giants are built in Blender by `scripts/blender/species.py` from published body
  proportions (fractions of body length), exported as Draco-compressed glTF.
- **Look.** One cel-shaded material writes colour and normals; a post pass draws ink lines from
  depth and normals, applies a Kuwahara paint filter, bloom and a painterly grade. Water absorbs
  red light first, so depth and distance turn everything teal.
- **Sound.** Everything is synthesized with the Web Audio API: sea rumble, swim wash, bubbles,
  whale song, sperm whale clicks.

## URL options

| Option | Effect |
|---|---|
| `?seed=42` | A fixed world |
| `?time=night` | Start at `golden` or `night` |
| `?autoplay=1` | Swims by itself, no UI |
| `?encounter=orca` | Put that species near the start |
| `/debug/species` | Every giant in one labelled row at true scale |
| `/debug/species/<key>` | Start in front of one species (`blue`, `humpback`, `sperm`, `orca`, `whiteshark`, `whaleshark`, `mola`, `manta`, `squid`, `lionsmane`) |

## Develop

```
pnpm install
pnpm dev
pnpm build
```

Rebuild the creature models (needs Blender 4.2+):

```
blender -b -P scripts/blender/species.py -- public/models
blender -b -P scripts/blender/sheet.py -- public/models out/   # side/top review renders
```

Pushes to `main` deploy to GitHub Pages through `.github/workflows/pages.yml`.

## Credits

Inspired by [Summer Cycle](https://github.com/StarKnightt/summer-cycle) (MIT), whose toon/ink/paint
pipeline this adapts, and by ideas from [Clearwater](https://github.com/Aureliengmz/clearwater).
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

MIT License.

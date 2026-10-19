# Credits

## Launchpad chrome

v1.5.0 restyles the create page and game cards with original CSS in `public/style.css`. No new fonts, textures, models, or audio were added for that pass.

Template games are original Kaplay scripts. They follow the rules of the games below. They are not line copies, and example art from those projects was not copied. Pixel grids in `THEME` are original. Titles stay generic: Word Guess, Block Drop, Flap, Maze Chomper, Jump Up, and the rest. Trademarked names are not used as titles or trade dress.

## Terrain textures

Photoreal color, normal, and roughness maps for the block world are CC0. Ground, plank, and cobble tiles used in v1.5.2 are 512×512 JPEG. The older bark, dirt, sand, stone, and snow tiles stay 256×256 JPEG. They live in `public/textures/`.

| File prefix | Poly Haven asset | Page |
| --- | --- | --- |
| `grass_` | Aerial Grass Rock | https://polyhaven.com/a/aerial_grass_rock |
| `planks_` | Brown Planks 05 | https://polyhaven.com/a/brown_planks_05 |
| `cobble_` | Cobblestone Floor 01 | https://polyhaven.com/a/cobblestone_floor_01 |
| `dirt_` | Dirt | https://polyhaven.com/a/dirt |
| `stone_` | Rock Face | https://polyhaven.com/a/rock_face |
| `sand_` | Coast Sand 01 | https://polyhaven.com/a/coast_sand_01 |
| `wood_` | Bark Brown 02 | https://polyhaven.com/a/bark_brown_02 |
| `snow_` | Snow 01 | https://polyhaven.com/a/snow_01 |

Poly Haven publishes these under CC0. Credit is appreciated and not required. `grass_` was recolored slightly greener after the download. The leafy-grass photo (`leaves_diff.jpg` and its maps) is no longer sampled by the renderer. Leaf blocks, grass tufts, and flowers use original alpha cutouts: `leaves_cut.png`, `grass_tuft.png`, and `flower_tuft.png`. `door_diff.jpg` is drawn on the plank tile. `window_diff.png` is an original frame with a clear center. The water color, normal, and roughness maps (`water_diff.jpg`, `water_nor.jpg`, `water_rough.jpg`) are original. The current ambientCG catalog no longer serves the older Water surface packs, so the water surface is a physical shader with those generated maps rather than a photo tile.

## Engine and sound

- **three.js r170 (0.170.0)** by the three.js authors. The browser build is `vendor/three/three.min.js`, served as `/three.js`. License text is `vendor/three/LICENSE` (MIT). The build includes `GLTFLoader` and the bloom composer from the same release. It does not include Draco, meshopt, or KTX2.

- **Kenney Pixel Platformer** (CC0 1.0), character and tile sheets in `public/sprites/kenney-chars.png` and `public/sprites/kenney-tiles.png`. Source pack: [kenney.nl/assets/pixel-platformer](https://kenney.nl/assets/pixel-platformer), mirrored from OpenGameArt `kenney_pixel-platformer.zip`. Tiles are 24px characters and 18px blocks, drawn scaled in the Kaplay templates. Credit is appreciated and not required.
- **KayKit Adventurers 1.0** (CC0 1.0), subset in `vendor/arena-assets/knight.glb` and `rogue.glb`. Source pack: [KayKit Character Pack: Adventurers](https://kaylousberg.itch.io/kaykit-adventurers), GitHub mirror [KayKit-Character-Pack-Adventures-1.0](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0). License text is `vendor/arena-assets/licenses/kaykit-adventurers-cc0.txt`. Each file keeps the rigged body, head, limbs, and cape or helmet, plus the Idle, Running_A, 1H_Ranged_Shoot, and Death_A clips. Swords, shields, knives, and crossbows were left out. The client plays those clips with `AnimationMixer`. Credit is appreciated and not required.
- **Kenney CC0 asset packs**, used as compressed glTF under `vendor/arena-assets/`. License texts are in `vendor/arena-assets/licenses/`. Blaster Kit 2.1 supplies the viewmodel and foam projectile (`blaster-b.glb`, `bullet-foam.glb`, `crate-small.glb`) with the pack colormap embedded in those files. Space Kit supplies the corridor wall, barrel, rock, dish, and crystal. Racing Kit supplies the car, barrier, and road piece. Nature Kit supplies the tree, palm, bush, flower, pebble, and grass. No neighborhood scene and no real-weapon model is included. Day, dusk, night, and neon lighting, the HUD, and the start screen follow the v1.3.1 art-direction table in `src/arena/view.js` (`SKY_LOOK`) and `src/arena/render.js`.

- **Quaternius packs were not vendored.** Toon Shooter, Ultimate Animated Characters, Sci-Fi Guns, Cyberpunk Game Kit, and Ultimate Stylized Nature are published as Google Drive folders without a direct glTF URL that this build could verify. MegaKit packs were not used. No Quaternius file is shipped, and none is credited as if it were.

- **In-game fonts (SIL Open Font License 1.1).** Latin woff2 subsets live in `public/fonts/` and are served as `/fonts/*` before the iframe gate. Lilita One (`lilita-one-latin.woff2`, display), Rubik weight 700 (`rubik-latin-700.woff2`, HUD numerals), and Chakra Petch weight 600 (`chakra-petch-latin-600.woff2`, kill feed). License texts: `OFL-LilitaOne.txt`, `OFL-Rubik.txt`, `OFL-ChakraPetch.txt`. The same display and numeral faces are used by the Kaplay templates, the Blocks goal card, the Play button, and the import start gate. The launchpad chrome stays on Bricolage Grotesque, Source Sans 3, and IBM Plex Mono, also OFL, same folder. Imported games keep their original licenses; the wrapper only adds the start gate, credit line, and touch pad.

- **Kaplay 3001.0.19** by the KAPLAY team. Pinned at `vendor/kaplay/kaplay-3001.0.19.js`. The file served as `/kaplay.js` is that build. License text is `vendor/kaplay/LICENSE.md`: MIT, plus extra restrictions that forbid using the software to train machine-learning models. npm lists the package license as MIT. Those extra clauses are in the vendored license and apply to this copy.
- **ZzFXMicro 1.4.0** by Frank Force. `vendor/zzfx/zzfx.js` is the micro build, served as `/zzfx.js`. MIT, `vendor/zzfx/LICENSE`. The full ZzFX module is not shipped. It is an ES module and its header contains a URL the sandbox checker would reject.

## Word list

Word Guess uses `templates/words-5.txt`: 2,300 five-letter words. They are the most frequent five-letter alphabetic words in Peter Norvig’s `count_1w.txt` ([https://norvig.com/ngrams/count_1w.txt](https://norvig.com/ngrams/count_1w.txt)), which he publishes for unrestricted use. A short denylist of slurs and sexual words was removed. The name `mario` was also removed so the answer list does not carry that trademark, and `weave` was added from the same frequency list to keep the count at 2,300. The list is embedded in the Word Guess script as `ANSWERS`, outside `CONFIG`, so a theme edit cannot wipe it.

## Mechanics

Logic was reimplemented after reading these sources. Licenses were checked on the files named here before any porting. Sprites, palettes, and names are ours.

| Template | What was used | License checked |
| --- | --- | --- |
| Word Guess | Original. Answer list as above. | Norvig word counts, unrestricted use |
| Block Drop | Falling tetrominoes, rotation, line clears. Reference: Christopher Straker’s browser tetris gist `3c98304f8a6a9174efd8292800891ea1` (README states CC0 1.0). Piece colors are acid, white, green, and amber, not the commercial seven-color set. | CC0 1.0 |
| Snake | Grid snake. Reference: Straker gist `ff00b4b49669ad3dec890306d348adc4` (README states CC0 1.0). | CC0 1.0 |
| Merge Tiles | Slide-and-combine board. Reference: Gabriele Cirulli’s 2048, `LICENSE.txt` MIT. | MIT |
| Flap | Tap to fly through a gap. Original tuning. The Kaplay examples in the same 3001.0.19 repo are under `vendor/kaplay/LICENSE.md`. Their art was not copied. | Kaplay license, art not used |
| Breakout | Paddle and bricks. Reference: Straker gist `98a2aed6a7686d26c04810f08bfaf66b` (README states CC0 1.0). | CC0 1.0 |
| Platformer | Run, jump, coin, pit. Original layout. Kaplay platform examples were read for the engine API only. | Kaplay license, art not used |
| Endless Runner | Lane, jump, hurdle. Reference: Frank Force, LittleJS `LICENSE` MIT. Art was not copied. | MIT |
| Space Shooter | Ship, bullets, one descending craft. Original. | — |
| Maze Chomper | Dots and one chaser on a grid. The chaser walks toward the player by Manhattan distance. It does not use the named chase personalities of the commercial maze game. The sprite is a square, not a wedge. | — |
| Jump Up | Bounce up a stack of platforms. Reference: Straker gist `b96a4a68bd6d79cf75a833d98a2b654f` (README states CC0 1.0). | CC0 1.0 |
| Match-3 | Original swap-and-clear. | — |

## Curated imports

These six games are vendored, not reimplemented. Each `imports/<id>/` folder has the original license, a `PIN.json` with the commit or gist version, and a `game.html` that was inlined to one document. Network calls, analytics, and external fonts were removed. Titles that would use a trademark were renamed. 2048 stays 2048.

| Game | Original | Pinned revision | License |
| --- | --- | --- | --- |
| 2048 | Gabriele Cirulli, github.com/gabrielecirulli/2048 | `478b6ec346e3787f589e4af751378d06ded4cbbc` | MIT |
| Lane Racer | Jake Gordon, github.com/jakesgordon/javascript-racer. Code only. | `3e8a060b5900755db27f899612a74a77427c853e` | MIT (code) |
| Stack | Jake Gordon, github.com/jakesgordon/javascript-tetris | `e5c0c42f7dac0f3514a55eff656c6e22e95d68ed` | MIT |
| Grid Snake | Christopher Straker, gist ff00b4b49669ad3dec890306d348adc4 | `728aa4da4835c0d321a22ea4ccbe588a8c28c418` | CC0 1.0 |
| Brick Bounce | Christopher Straker, gist 98a2aed6a7686d26c04810f08bfaf66b | `9e2eb0baf8cc542ae08f21bb8f543a093da3fc3d` | CC0 1.0 |
| Tower Bounce | Christopher Straker, gist b96a4a68bd6d79cf75a833d98a2b654f | `8ceae530dc7e03987c38622e22c7de5251b619cc` | CC0 1.0 |

Lane Racer’s README at that revision says the MIT license covers the code, and then adds two notes. The music tracks are royalty-free files licensed only for that project, so they are not included. The sprite graphics are described as placeholder art borrowed from the Sega Genesis version of OutRun and used as teaching examples. `images/background.png` is a separate bitmap with no stated license of its own. Neither bitmap is shipped. `scripts/lane-art.js` draws the sky, hills, trees, car, traffic, rocks, and signs as original flat shapes at load time.

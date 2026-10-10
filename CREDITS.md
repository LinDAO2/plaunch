# Credits

Template games are original Kaplay scripts. They follow the rules of the games below. They are not line copies, and example art from those projects was not copied. Pixel grids in `THEME` are original. Titles stay generic: Word Guess, Block Drop, Flap, Maze Chomper, Jump Up, and the rest. Trademarked names are not used as titles or trade dress.

## Engine and sound

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

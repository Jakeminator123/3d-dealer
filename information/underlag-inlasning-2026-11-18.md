# Underlag från inläsningen 2026-11-18

Överlämning till nästa chatt: det som lästes, vad som är belagt och vad som är förslag. Inget är byggt än.
Märkning: **[E]** = jag har själv läst/mätt det. **[U]** = rapporterat av en underagent med fil:rad, stickprov gjorda. **[F]** = förslag, inte beslutat.

## 1. Vad som lästes

| Källa | Version | Anmärkning |
| --- | --- | --- |
| `information/` (5 filer) och `glb/` (alla modeller och bilder) | den här mappen | [E] |
| Dealer, lokalt `C:\Users\jakem\dev\super-feature-sg\dealer` | `9d720ef`, 7 commits före `2e3967c` (den externa granskarens version), plus ocommittade ändringar | [E] Bara läst. En annan agent arbetar där. |
| Scoutgaming, lokalt `C:\Users\jakem\dev\scoutgaming` | `90d6697c4850` (samma som granskaren) | [U] Bara signalkontrakt, presentation och kärnans API. |
| Runway MCP | arbetsytan "Jakob", 5 984 köpta krediter | [E] `whoami` samt specarna för `generate_video` och `remove_video_background`. Ingen generering gjord. |

## 2. Modellerna i `glb/` [E]

Mätt med ett skript som läser GLB-huvudet. Alla mått är Meshys normerade skala (längsta sida ca 1,9), inte verkliga meter.

| Fil | Trianglar | MB | Mått x·y·z | Rigg / animation | Omdöme |
| --- | --- | --- | --- | --- | --- |
| `black-jack-tbl.glb` (bord) | 937 000 | 46 | 1,90 · 1,01 · 1,43 | nej | För tung. Finns i tre byteidentiska kopior. |
| `…Dealing_Sho…texture.glb` (sko) | 192 000 | 18 | 0,60 · 0,64 · 1,92 | nej | Användbar efter förenkling och rätt skala (verklig längd ca 0,42 m). |
| `…Chip_Tray…texture.glb` (marktråg) | 3 850 000 | 124 | 1,93 · 0,23 · 0,77 | nej | Oanvändbar som den är. |
| `paow/paow_v1_150k.glb` | 154 000 | 44 | 1,10 · 1,90 · 0,33 | nej | Texturer 38 MB (PNG). |
| `paow/paow_v1_25k.glb` | 26 000 | 38 | samma | nej | Lätt nät, samma tunga texturer. |
| `paow/Meshy_AI_Meshy_Merged_Animations.glb` | 154 000 | 48 | skala 0,01 | 24 leder, **inga fingerleder**; bara Running och Walking | Duger som kroppsdocka, inte för grepp. |

Slutsats: bord, tråg och marker byggs hellre som enkla, rätt dimensionerade objekt. Skon och Paulinas kropp kan förenklas och användas som förlaga.

## 3. Paulinas identitet

- [E] `glb/paow/1-paow-fram-kavaj.png` (1640 × 4700, vit bakgrund): platinablond page, svart kavaj, krämfärgad topp, blomhänge, tatueringar på hals och bröst **och på båda händernas ryggar och fingrar**.
- [E] Dealers `data/dealers.json` beskriver bara tatueringar på hals och bröst.
- [E] `docs/BRISTER.md:83-86`: bankens filmer har otatuerade, större händer; keystone och ankare 1 är tatuerade. Att måla tatueringar i färdiga filmer har fallit (2 av 5).
- [E] `docs/BRISTER.md:87-89`: skuggan under armarna sitter i grundbilden (armbågarna på ett bord bakom kanten) och syns i varje film.
- [E] `data/dealer-standard.json:11-17`: standarden kräver fritt hängande armbågar och inget mörkt ovanför bordskantens rad (831,5). Det är alltså en regel som förbjuder skuggan, inte ett besked från Jakob.
- [U] Inget citat av Jakob i `docs/BESKED.md` säger ordagrant "alltid tatueringar på händerna"; närmast är 2026-11-17/18 (`BESKED.md:203-218`): tatuerade keystones som förstahandsval och "Ankare 1 ska nu vara paushänder som är tatuerade".

## 4. Filmmetoder som prövats [U, stickprov E i `tools/film-prompting.md:112-131, 379-400`]

| Metod | Utfall | Status |
| --- | --- | --- |
| Giv **bara dit**, Kling 4, 1080p, 4 s, första bild + sista bild + referensfilm till samma plats | Plats 4: 3 av 4 håller (4/5). Kortet lagt 0–2 px från planen. | Håller bäst |
| Samma, med en **renderad docka** som referensfilm (rörelsen läst ur en verklig hand) | Plats 4: 2 av 2 (4/5). Plats 3: 1/5. Plats 5: 3/5. Ca 85 krediter per tagning. | Håller som metod |
| Tur och retur, Kling 4, 7 s, med referensfilm | Flera godkända till plats 4, 1 och dealern | Håller delvis |
| WAN 3 utan referensfilm | 0 av 6 samma kväll; ytterplatser 0 av 8 | Faller |
| Kling Motion Control | 0 av 3 vände kortet | Faller |
| Video-till-video / Aleph / `edit_video` | Fel ansikte tillbaka, skons fönster töms | Faller |
| Hel runda i ett klipp | 0 av 7, ca 3 500 krediter | Faller |

Lärdomar som återkommer:
- Ett kort och en handling per klipp.
- Ett klipp börjar på en stillbild, aldrig på en annan films ruta (ca 5 nivåers tonskifte per länk).
- Referensfilmen styr väg, takt, vändning och kortets skenbara storlek; utseende, sko och slutläge tas ur bilderna. Den ska sluta som sista bilden.
- Blick och huvud styrs av första och sista bilden, inte av referensfilmen.
- Det kort modellen ritar är 16–35 % för långt i handen i många tagningar, och färgerna byter ibland sida.
- Beställning går i dag via Runway MCP (appens krediter), inte Developer API (`docs/DRIFT.md:168-207`).

## 5. Geometri [U, linsen stickprovad E i `src/table-lens.ts:1-34`]

- Två kameror lever sida vid sida. Kortplanen använder linsen; spelets liggande kort använder kontraktets vidare kamera.
- **Linsen** (`TABLE_LENS`): brännvidd 2334 px i rutan 1764 × 1174, lutning 25,06°, 1,110 m över filten, 1,844 m från dealerns bordskant, vertikalt synfält 28,2°. Passad mot ett mätt kort på plats 4 och antagna kroppsmått.
- Kontraktets kamera: 886 px, lutning 2,5°, 493 mm, skalfaktor k = 2. Härledd ur plankorten, ingen fysisk kamera.
- Världen i linsen: x höger, y upp, z mot kameran, filten y = 0, verkliga meter.
- Kort 63 × 88 mm. Sko: längd 0,42 m, bredd 0,118 m, lutning 58°, utlopp 12 mm över filten (formen antagen, foten mätt i bild).
- Bordets ellips (halvbredd 0,95 m, djup 0,60 m) och marktrågets läge är antagna. Inga lagrade världsmeter finns för plats 1–7; de räknas fram.
- Gamla scenen har redan ett **veck** (`fold`, `src/scene3d-film.ts:473-482`): filmen står på bordskanten och bordsdelen bär händer, kort och skuggor.
- Rena funktioner värda att föra över: `see`, `onPlane`, `filmEye`, `realCardQuad`, `lensForFocal`, `shoePose` (`src/table-lens.ts`), `spots`, `seatEye` (`dealer3d/src/world.ts`).

## 6. Spelkärna och signaler [U]

- `game/core.ts`: `newGame`, `step`, `publicView`. Ren tillståndsmaskin med injicerad slump. Hinder för webbläsaren: `node:crypto` i `rng.ts`, `random-port.ts`, `shoe-proof.ts`, `shoe-source.ts`.
- Regler: 8 lekar, dealern stannar på alla 17, titt på ess/tia, försäkring, dubbla (även efter split), split upp till 4 händer, ingen surrender, blackjack 3:2, sidospel (par, 21+3).
- Signaler utåt: `speak`, `deal`, `reveal`, `turn`, `settle`, `idle`. Dealer använder `seat` 1–7; Scoutgaming `box` 0–6. Dealer saknar Scouts `speechTake`, `filmedTake`, `filmedTransitions`, `moving`.
- Beteendetester värda att föra över: `game-rules`, `game-session`, `game-shoe`, `game-presentation`, `game-seats`, `game-fuzz`, `game-rng`.
- Gamla studion: Next 16 + React 19; Casino är en iframe mot `/game.html`; three 0.180 utan React Three Fiber. Meny: Bordet, Karta, Granska, Material, Lipsync, Casino, Beslut, Fråga, Ljud, Modeller, plus 17 rutter.

## 7. Runway i den anslutna arbetsytan [E]

- `kling-4` är den modell som tar första bild, sista bild **och** referensfilmer i samma anrop. 23,5 krediter/s i 1080p; med referensfilm 14,1 krediter/s räknat på utlängd plus den längre av in- och utlängd.
- Seedance, WAN och Gemini Omni kan inte kombinera första/sista bild med referenser.
- `remove_video_background` ger en film med genomskinlig bakgrund, 1 kredit/s, högst 60 s.
- 3D-generering är inte tillgänglig i arbetsytan.

## 8. Förslag [F]

- En scen i verkliga meter är källan. Kamera, bord, sko och kortplatser står i en fil; labb, beställning och casino läser den.
- Dealern är film på en vikt yta; bord, sko, kort och marker är 3D.
- Ord: Scen, Identitet (ersätter keystone), Ankare (bara VILA och REDO), Klipp, Förlaga, Tagning.
- Ankarbilder och klipp görs **ur scenen**: scenen renderar en förlaga (docka och enfärgat kort), Kling 4 gör filmen med första bild, sista bild och förlagan som referensfilm.
- Filmens kort är en färgmarkör som nycklas bort; kortet som syns är alltid scenens 3D-kort i verklig storlek. Oprövat.
- Mappar: `src/engine`, `src/scene`, `src/lab`, `src/casino`, `src/pipeline`, `src/server`, `content/`, `assets/`, `docs/`.

## 9. Öppet

- Vad "böjt" exakt ska betyda (vecket, en böjd bakgrund, eller båda).
- Om nyp eller släp ska vara Paulinas enda grepp i första kedjan.
- Budget i krediter för första provet.
- Hur långt åt sidan en spelarplats får stå innan egna filmer per kameragrupp behövs. Avgörs av ett sidoprov.

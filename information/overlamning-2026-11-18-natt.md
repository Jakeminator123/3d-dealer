# Överlämning 2026-11-18 natt → Claude Code

Pausad på Jakobs begäran 07:17. Nästa chatt: bättre modell i Claude Code. Läs detta först, sedan [docs/status.md](../docs/status.md), [AGENTS.md](../AGENTS.md) och [docs/decisions.md](../docs/decisions.md).

## Viktigt: modellbyte att granska innan återupptag

| När (lokal tid) | Vad |
| --- | --- |
| ~06:26–07:00 | Cursor-agent (Claude Fable 5.2) tar över, startar underagenter. |
| ~06:40–06:58 | Paulina helfigur VILA/REDO + Kling 4-klipp (104 krediter). |
| ~06:48–07:14 | Scenens tredje varv (golv, helfigur i scen, förlaga) nästan klart. |
| **07:14** | **Cursor: "Other Models usage limit reached. Switched to Auto."** Två underagenter dog: scenen (`1a1d363c…`) och generisk dealer (`c8e2e205…`). |
| 07:14–07:17 | Huvudchatten fortsatte efter bytet (Auto/Grok-läge): typfel i `helfigur.ts`, tester, docs, startade 2D-film-agent. **Detta avsnitt ska granskas innan arbetet återupptas** — kvaliteten och avgörandena efter 07:14 är osäkrare. |

Granska särskilt: `docs/status.md`, `docs/decisions.md` (nya stycket "scenen med golv och helfigur"), `docs/production.md` (avsnitt "Helfigur för en ny dealer"), `src/pipeline/helfigur.ts` + test, och om 2D-film-agenten (`36b9a425…`) hann skriva något i `assets/` eller registret efter 07:17.

## Målet (ofullständigt)

`/goal`: samma visuella kvalitet som 2D-filmerna, med möjlighet att vinkla om som 3D. Leverabler 0–6 i Cursor-målet. Klart i praktiken: ignore, scenbevis, Paulina sittande helfigur + klipp, förlaga ur scenen. Kvar: 2D-film ur förlagan (två vinklar), generisk dealer, oberoende granskning av 2D, commit, avgörande om riktig 3D-modell behövs.

## Git

- Gren: `main`, lokalt, **inget fjärrarkiv**.
- Senaste commit: `e833877` — Paulinas första helfigur registrerad.
- **Mycket ocommittat** (scenens tredje varv + pipeline). Se `git status`. Committa inte blint: granska diffen efter modellbytet först.
- Media (`assets/`, `glb/`, `output/`) utanför Git. `.cursorignore` ligger (Jakob kopierade den).

## Runway

- Arbetsyta "Jakob". Saldo senast mätt **4 774** krediter (efter 2D-kedjan 117 krediter; före den 4 891; före Paulina-helfigur 5 005).
- Natten: högst 2 000 krediter totalt, högst 250 per beställning (Jakobs "hög budget" + agentens tolkning i AGENTS.md).
- Film: Kling 4. Bilder: GPT Image 2.6 Sunburst först, Nano Banana sist.

## Klart och verifierat

| Del | Bevis |
| --- | --- |
| `.cursorignore` + `.cursorindexingignore` + läsregler i AGENTS.md | filer i roten |
| Rum med golv, lyft 0 | `output/scen-matning/golv-*.png` (t.ex. `golv-prov-uppifran-skarp.png`, `golv-d2-spelaren-foajen-paulina-stillbild.png`) |
| Liv-helfigur i scenen + Paulina-stillbild bakom bord | samma skärmbilder |
| Förlaga Spelaren + stillbild Plats 7 | `output/forlagor/liv-vila-redo_spelaren_balsal.mp4` (+ json), `…_plats-7_balsal_bild.png` |
| Paulina VILA/REDO helfigur + klipp | `assets/dealers/paulina/anchors/*-helfigur-bord.png`, `assets/reference/films/paulina-helfigur-vila-redo.mp4` — **godkänd** av oberoende granskare (filmen bara som förlaga; tatuering saknas mitt i rörelsen; 24 fps) |
| Liv kopierad in | `assets/reference/liv-*.png`, `assets/reference/films/liv-*.mp4` |
| Mall + recept | `content/figure-frame.json`, `src/pipeline/helfigur.ts` |
| Tester | 144 pass, typecheck grön (mätt efter typfix) |

## Pågår / osäkert vid paus

| Vad | Status |
| --- | --- |
| 2D-film ur förlagan | **Klart efter pausen (07:17–07:31), fortfarande Auto/Grok-kedja — granska innan nästa steg.** Se tabell nedan. |
| Generisk dealer | Avbruten vid modellgräns; `helfigur.ts` finns, inga `assets/dealers/generisk-1/` klara (kontrollera) |
| Scen-agenten | Dog 07:14; det mesta var redan i trädet. Docs/status uppdaterades delvis efter bytet. |
| `vila-helfigur.png` (händer på låren) | fortfarande `granska igen`; ersatt i praktiken av `vila-helfigur-bord.png` |

### 2D-kedjan som landade efter pausen (117 krediter, saldo 4891 → 4774)

Alla status `att granska`. Ark i `output/work/2d-spelaren/`.

| Fil | Modell | Krediter |
| --- | --- | --- |
| `assets/dealers/paulina/anchors/vila-spelaren.png` | gpt-image-2.6-sunburst | ~10 |
| `assets/dealers/paulina/anchors/redo-spelaren.png` | gpt-image-2.6-sunburst | ~11 |
| `assets/reference/films/paulina-spelaren-vila-redo.mp4` | Kling 4 1080p 4 s | 85 |
| `assets/dealers/paulina/anchors/vila-plats7.png` | gpt-image-2.6-sunburst | 11 |

- Film vs förlaga (enligt agenten): samma inramning, låst kamera, arm till skon; **24 fps** (förlaga 30).
- Plats 7: bara VILA; **saknar REDO + film**; vinkeln kan ha drivit mot Spelaren.
- Tveksamt enligt agenten: tatuering mitt i Spelaren-filmen; om Plats 7 behåller förlagans kamera.
- Agent: [2D-film Paulina ur förlaga](36b9a425-8b58-4530-9876-267369f0879e) — gjordes efter modellbytet 07:14.

## Nästa steg (i ordning)

1. **Granska allt efter 07:14** (Auto/Grok), inklusive 2D-filerna ovan. Läs diff: `git diff --stat` och särskilt docs + `helfigur.ts`. Se ark i `output/work/2d-spelaren/`.
2. Oberoende granskare av `vila-spelaren`, `redo-spelaren` och `paulina-spelaren-vila-redo.mp4` mot förlagan och `giv-p4-nyp-docka-2.mp4`.
3. Plats 7: REDO + film om VILA håller; annars gör om VILA först.
4. Generisk dealer enligt `docs/production.md` "Helfigur för en ny dealer".
5. Avgör: behövs riktig 3D-personmodell? (Runway mesh avstängd; utgångsläge = omvinkling via scen + ny film per kamera.)
6. Commit (utan assets), uppdatera `docs/status.md`.

## Fällor

- Rör aldrig `C:\Users\jakem\dev\super-feature-sg\dealer`.
- local-studio: bara läsning; kopiera + registrera.
- Labbet: klicka aldrig omdömesknappar som agent (`npm run judge`).
- `content/assets.json` skrivs av flera samtidigt: läs om, skriv via `.tmp` + rename.
- Serverkod laddas inte om: egen port 5313 för prov, rör inte Jakobs 5310 om den kör.
- Filmer: ark med ffmpeg, aldrig läs mp4 som text.

## Startprompt till Claude Code

```
Läs information/overlamning-2026-11-18-natt.md först (hela), sedan AGENTS.md, docs/status.md, docs/decisions.md.
Granska allt som gjordes efter modellbytet 07:14 (Auto/Grok) innan du fortsätter.
Ta sedan leverabel 4: 2D-film ur förlagan för Paulina (Spelaren, sedan Plats 7).
Rör inte dealer-repot. Committa bara när Jakob ber om det.
```

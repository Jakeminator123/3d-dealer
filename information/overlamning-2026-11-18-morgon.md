# Överlämning 2026-11-18 morgon: given till plats 4, dealern på grönt, ur flera vinklar

Skriven av agenten (Claude Code) till sig själv eller nästa agent, på Jakobs begäran 08:35: om gränsen nås ska arbetet kunna fortsätta efter en `/clear`. Läs detta, sedan [AGENTS.md](../AGENTS.md) och arbetsloggen `output/work/giv-4/LOGG.md` (utanför Git: beställningar, saldon och mätningar i den ordning de gjordes). Ersätter [nattens överlämning](overlamning-2026-11-18-natt.md) som startpunkt.

## Vad Jakob har sagt (07:19–08:35)

- Alla privilegier: agenten ändrar efter eget omdöme och frågar inte. Han sover.
- Provfilmen är **en hel giv**: kortet ur skons mynning till plats 4, med blick, huvud och överkropp som följer med. Filmen där bara handen gick till skon var "helt fel".
- **Dealern på grönt**, filmad ur scenens kamera och nycklad; bord, sko, kort och rum är 3D runt henne.
- Hon ska kunna ses "som 3D från olika vinklar utan att hon för den delen dealar till olika positioner": samma giv, samma kortplats, ur flera kameror.
- **En standard, med Pamela som grund**: var korten hämtas och var de läggs, för plats 1–7, lika för alla dealers och lika i 3D-renderingen och 2D-filmerna.
- Dealern och bordet ska "skjutas samman"; förra vyn kändes som en hög reling.
- "Hennes händer är för stora på allt jag ser." Allt han sett hittills "har varit skit": ribban är hög.
- Budget: högst 250 krediter per beställning och 2 000 för natten, räknat från 5 005 (golv 3 005). Ljud tas alltid bort.
- Gamla Dealer (`C:\Users\jakem\dev\super-feature-sg\dealer`) och Scoutgaming får läsas, aldrig ändras.

## Vad som är byggt (allt ocommittat; `npm test` 178 gröna, 2 väntade fel för plats 6 och 7)

| Sak | Var |
| --- | --- |
| Närbilden av en vy: samma öga, inzoomat på dealerns arbetsyta (kortplatserna, skon, kroppen). Dockans huvud blir 258 bildpunkter i 1920 × 1080. | `closeEye`, `workArea` i `src/scene/geometry.ts`; `film.reach` i `content/scene.json`; vyn skrivs `{ kind: 'spelaren', close: true }` |
| Spelaren flyttad närmare: 0,60 m över filten, 1,90 m från kanten, 15°, 48° (var 2,40 m, 16°, 45°). | `player` i `content/scene.json` |
| Dealerfilm på den vikta ytan ur vilket öga som helst, film eller stillbild. Prövad fram och tillbaka: sammanfaller med originalet. | `src/scene/film.ts`, `picture.ts`, `key.ts`; dealern `{ kind: 'film', file, view }` |
| Dockan: Pamelas avlästa nyp-giv ur gamla Dealer, hämtad i scenens sko och lagd på platsens första kortplats; `moveFor` ställer om till plats 1–5. Händerna är 17,5 cm (gamla dockans givhand mätte 24 cm). | `src/scene/doll.ts`, `dollPose.ts`, `content/doll.json`, `content/moves/giv-nyp-plats-4.json`; dealern `{ kind: 'docka', move, pose, seat? }` |
| Ateljé: grön skärm, enfärgat bord, rutnät på filten (10 cm), kortplatserna utritade. | `setStudio`, `setPlaces` i `src/scene/build.ts` |
| Huvudlös sparning av förlagor (bild eller klipp) med Chrome över DevTools-protokollet, egen server på ledig port. | `node src/pipeline/shoot.ts <beställning.json>`; sidan `src/lab/forlaga.html` + `src/lab/shoot.ts` |
| Import och strykning i registret. | `node src/pipeline/import.ts <post.json>` och `… stryk <fil> "<varför>"` |
| Labbet väljer dealerns egna filmer först (`use: "dealerfilm"`, `view`). | `src/lab/backdrops.ts`, `SceneStep.tsx` |

Arbetsfiler under `output/work/giv-4/`: `gor-bestallning.mjs` (skriver beställningar för dockans REDO, LAGT, VILA och klipp ur en vy), `mat-ankare.ts` (mäter en bild mot dockans väntade lägen), `passa-ankare.ts` (flyttar en bild så att skon hamnar där scenens sko står; skodetekteringen ska bytas mot den i mat-ankare), `uppladdat.json` (Runway-adresser som går att återanvända), `bestallningar/` och `ankare/`.

## Läget i genereringen (08:55)

- Receptet för ett ankare som håller: dockans ställning ur vyns närbild i ateljén (rutnät, hudfärgade händer) → Nano Banana Pro sätter Paulina i ställningen (håller sko, bordskant och kort inom 4 bildpunkter) → GPT Image 2.6 Sunburst rättar bara huvudet (likheten) → `krymp-hand.ts` 0,82 → `mala-kort.ts` (det lagda kortet) → `platta-gront.ts`. Sunburst ensam flyttar bordet 30 bildpunkter och gör händerna 1,2–1,3 gånger för stora; Ideogram 4.5 Precise Edit och orden "warm golden" ger orange hår.
- Spelaren: ankarna `dealers/paulina/anchors/spelaren-redo.png` och `spelaren-lagt-4.png` och tagningen `dealers/paulina/clips/giv-4-nyp_spelaren_t1.mp4` (Kling 4, 85 krediter) är importerade som `att granska`. Lagd i scenen landar kortet i konturen för plats 4, och filmens sko sammanfaller med scenens (`output/forlagor/giv-4-nyp-spelaren-t1_*bevis*.mp4`).
- En oberoende granskare (underagent) dömer de tre filerna och sätter status med `npm run judge`.
- Plats 7: en underagent gör REDO och LAGT 4 ur dockans sidovy (`output/work/giv-4/ankare/plats-7-*-klar.png`), budget 130 krediter. Dockans underlag och klipp ligger i `output/forlagor/docka-giv-nyp-plats-4_plats-7-nara_atelje*`.
- Standarden i bild: `output/work/giv-4/standard-platser.jpg` (dockan vid skon och med kortet lagt på plats 1–7, kortplatserna utritade). Alla sju platser går fria.

## Pausat 09:05

Jakob bad om paus när Claude-gränsen stod på 96 %. Två underagenter stoppades mitt i arbetet, och ett engångsjobb väcker agenten 13:07 om samma session är öppen.

- **Granskningen av Spelaren är inte gjord.** De tre filerna står kvar som `att granska`. Beställningen till granskaren står i den här chattens historik; kraven är de som står i `docs/production.md` under Regler, och måtten tas med `output/work/giv-4/mat-ankare.ts`.
- **Plats 7 är halvgjord.** Underagenten hann tre försök på REDO och två på LAGT med Nano Banana Pro (`output/work/giv-4/ankare/plats-7-*-nano.png`, ark i `plats-7-nano-ark.jpg`). Försök 1 kopierade sidobildens uppställning (ge inte `sida-kavaj-tatuerad.png` som referens); försök 2 följer dockan. Retusch, krympning och plattning återstår, och sedan tagningen. Dess beställningar är inte förda i loggen: cirka 100 krediter, saldot är inte läst efter 4 577.
- Efter pausen gjordes också, utan beställningar: scenens eget kort (`src/scene/cards.ts`, `setCard`) och nyckeln som tar bort märkkortets blå när kortet ligger. Sett ur Spelaren i `output/work/giv-4/bevis-kort.jpg` och `output/forlagor/giv-4-nyp-spelaren-t1_*bevis-kort*.mp4`. Labbet lägger kortet när klippets post bär `lands: { seat, index, at }`; posten för tagningen har inte fått det än (lägg till `"lands": { "seat": 4, "index": 0, "at": 3.0 }`).
- Labbets steg Scen är prövat i en webbläsare utan fönster på port 5313 (`output/work/giv-4/lab-scen.png`): tagningen spelas som förvald dealer, inga fel. Jakobs server på 5310 kör gammal serverkod och behöver startas om för att spara förlagor av de nya slagen.
- `npm test` 189 gröna och typkontrollen ren 09:04. Ingenting är committat.
- `docs/decisions.md`, `docs/architecture.md` och `docs/production.md` är skrivna om. `docs/status.md` och README är det inte.

## Återupptaget 09:08

- Inga underagenter kör. Registret är helt (75 poster, alla sha256 rätt).
- **Runway är utloggat** (MCP: "needs you to sign in again"). Jakob loggar in med `/mcp`. Till dess går ingenting att beställa, och saldot går inte att läsa (senast mätt 4 577 efter tagningen; Plats 7-agenten gjorde sedan fem bilder med Nano Banana Pro, uppskattat 100 krediter, inte mätt).
- Plats 7, mätt mot dockan: `plats-7-redo-2-nano.png` följer underlaget (skon på samma bildpunkter, händerna 120 × 88 och 124 × 92 mot dockans 116 × 76 och 92 × 76). `plats-7-redo-3-nano.png` är fel (skon omritad). `plats-7-lagt-2-nano.png` har skon rätt men givhanden 188 × 92 mot dockans 112 × 88 och ett för långt blått kort (116 mot 64 bildpunkter). Fortsätt från redo-2 och lagt-2: retusch av huvudet (Sunburst), krympning, kort, plattning.
- Tagningens post har fått `lands: { seat: 4, index: 0, at: 3.0 }`, så Labbet lägger scenens kort där.
- `docs/status.md` och README är omskrivna. En ny, snävare granskare dömer Spelarens tre filer.

## Näst, i ordning

1. Läs granskarens omdöme om Spelaren och rätta det som går utan ny beställning. En ny tagning bara om granskaren underkänner den (85 krediter).
2. Plats 7: se underagentens ankare, importera dem (`use: "dealerfilm"`, `view: { kind: "plats", seat: 7 }`), beställ tagningen med Kling 4 (samma text som för Spelaren, dockklippet ur Plats 7 som referens), lägg den i scenen ur Plats 7 och låt en granskare döma.
3. Märkkortet: prova att nyckla bort det blå och rita scenens 3D-kort på kortplatsen (provet "Markörkortet" i production.md). Inte påbörjat.
4. Dokumenten: `docs/status.md` (skrevs senast av 2D-agenten efter modellbytet och ska skrivas om), `docs/production.md` (kedjan med docka, närbild, ankare i två steg), README. `docs/decisions.md` och `docs/architecture.md` är uppdaterade 08:50.
5. Commit (lokalt, inget fjärrarkiv).
6. Om budgeten räcker: returen LAGT 4 → REDO, plats 1 eller 7 ur Spelaren, eller en generisk dealer genom samma kedja.

## Fällor

- `generate_image` och `init_upload` svarar med hela texten och långa adresser: låt underagenter göra upprepade beställningar.
- Bash-verktyget förstör omvända snedstreck och vissa citattecken i här-dokument: skriv skript med Write-verktyget.
- Serverkod laddas inte om; `shoot.ts` startar sin egen server varje gång. Jakobs server på 5310 rörs inte.
- En annan vy än den filmen är gjord i visar kroppen platt. Det är väntat: varje vy har sin film.
- Skon finns både i filmen och i scenen. Sedda ur filmens öga sammanfaller de om bilden är inpassad.

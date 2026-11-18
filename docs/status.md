# Läget

Senast ändrad 2026-11-18. Ersätt det som inte längre gäller.

## Finns

- Mappstrukturen och dokumenten.
- Ett startkommando: `npm run dev`, sedan http://localhost:5310/lab/. Se [README.md](../README.md).
- Servern (`src/server`): lämnar ut registret, filerna i `assets/` och förhandsbilder av dem. Svarar bara på localhost.
- Labbet, steget Granska: registret avdelning för avdelning. Bilder i full storlek och pixel för pixel, filmer i full fart, långsamt och ruta för ruta, modeller i 3D med mått mätta i filen. Omdömen sätts med klick och sparas i `content/assets.json`. Jakob kan skriva varför, och agentens svar syns bredvid.
- Labbets steg Scen och scenen (`src/scene`, `content/scene.json`): en första version med bord, sko, dealer och vald bakgrund, att vrida runt i och att döma bakgrunderna i. Ur scenens kamera stämmer dealern med ankarbilden (mätt, se [decisions.md](decisions.md)). Scenen öppnar i vyn Spelaren: ögat i dealerns ögonhöjd, dealern framifrån, rummet bakom henne, hela bordet med vall, och zoom med mushjulet (sett i skärmbilder under `output/scen-matning/`). Gamla linsen finns kvar som vyn Filmkameran. Inte gjort: golv i rummen (bakgrunden ligger oändligt långt bort, så det som står nära kameran i rummet ser för stort ut), kort, marker, skugga på bordet, rummets ljus på bord och dealer, sparade reglage. Lyftet står på 5° och ska bort när rummen har golv.
- Agentens väg till registret: `npm run judge` läser kön av det som fått `granska igen`, sätter omdömen och skriver svar. Reglerna står i [AGENTS.md](../AGENTS.md).
- Spelkärnan (`src/engine`): förd över ur gamla Dealer med sju testfiler. De tio kodfilerna är byte för byte desamma som där; ursprung och avvikelser står i `src/engine/provenance.json`. Den är inte kopplad till något gränssnitt än.
- Tester: `npm test` (122 tester, varav 71 för spelkärnan) och `npm run typecheck` gick igenom 2026-11-18.
- 62 filer i `assets/` (134 MB), alla registrerade i `content/assets.json` med ursprung och sha256. Läget för varje fil står i registret.
- Underlaget från inläsningen av gamla projektet: [information/underlag-inlasning-2026-11-18.md](../information/underlag-inlasning-2026-11-18.md).

## Finns inte än

- Casinot och produktionskedjan, och Labbets steg Dealer, Klipp och Spela.
- En spelsession i servern, och kort och uppspelning av klipp i scenen.
- Dealerns fil och klippregistret i `content/`.
- Ett steg som tar bort det som fått `utgår`. Tills vidare görs det för hand efter Jakobs besked.
- Ett fjärrarkiv för Git. Mappen har sedan 2026-11-18 ett lokalt arkiv med en första commit; inget är pushat.

## Omdömen

Sedan 2026-11-18 dömer agenten, efter oberoende granskning, och Jakob ändrar det han vill i Labbet: http://localhost:5310/lab/#granska. Kvar att döma är bakgrunder, material och modeller. De bedöms i scenen, när bakgrunden går att lyfta.

| Grupp | Antal | Mapp |
| --- | --- | --- |
| Identitet | 7 | `assets/dealers/paulina/identity/` |
| Ankare | 5 | `assets/dealers/paulina/anchors/` |
| Bakgrunder | 17 | `assets/scene/backgrounds/` |
| Material | 12 | `assets/scene/materials/` |
| Modeller | 2 | `assets/models/` |
| Referens, bilder | 12 | `assets/reference/` |
| Referens, filmer | 7 | `assets/reference/films/` |

- Identiteten har fått en närbild på händerna (`hander-ovansida.png`, genererad 2026-11-18) och ett utsnitt av Jakobs fotografi med armar och händer (`foto-armar-hander.png`).
- Filmerna är de givar till plats 4 som höll i gamla provet: två med Pamelas film som referens och två med en dockfilm som referens, med referensfilmerna bredvid.

- Numren i Labbet är registrets ordning inom varje avdelning. Det är samma numrering som på arken i `output/review/` (kontrollerat mot arket för referensbilder). Labbet ersätter ark 1–5; ark 6 och 7 är jämförelser som Labbet inte visar.
- Vad som medvetet lämnades utanför står sist i `content/assets.json`, under `leftOut`.
- De fem ankarna är gjorda i gamla projektets ruta (1764 × 1174 på grönt, skon inbakad). De är förlagor för nya ankare, inte färdiga för den nya scenen.
- REDO med nyp finns också med tatuerade händer (`redo-nyp-tatuerad.png`, gjord 2026-11-18 för 20 krediter). Hur den gjordes står i dess post i registret. Den väntar på Jakobs omdöme.
- Fyra filer som Jakob gav `utgår` är borttagna 2026-11-18. De står sist i registret, under `leftOut`, med sina källor.

## Näst

1. Jakob går igenom bilderna i Labbet. Det som får `utgår` tas bort ur `assets/` och registret efter hans besked.
2. Scenen, tredje varvet: rummen får golv i rätt höjd och skala, så att bakgrunden inte ser inzoomad ut och lyftet kan tas bort. Elva bakgrunder har `granska igen` med Jakobs ord och agentens svar, och väntar på det. Därefter döms resten av bakgrunderna, materialen och modellerna i scenen. Se [överlämningen](../information/overlamning-2026-11-18.md). Vägvalet 2026-11-18: Paulina görs i helfigur på grönt utan bord, som i local-studio, och scenen byggs om efter det; den första bilden (`vila-helfigur.png`) är beställd.
3. Kedjan för plats 4, det första filmprovet. Förbereds i en egen chatt; se [överlämningen](../information/overlamning-kedja-plats-4-2026-11-18.md).
4. Resten av etapp 1: kort i scenen, en spelsession i servern, och en första vy för Casinot.
5. De tre proven i [production.md](production.md), "Att pröva först".

## Öppet

- Om fler filmer ur gamla projektet ska med.
- Om nyp eller släp blir Paulinas grepp i den första kedjan.
- Om fler identitetsbilder från sidan ska göras (ansikte och kropp, stående och sittande). En sidobild med tatuerade händer är gjord 2026-11-18 ur `original-sida-kavaj.png` (`sida-kavaj-tatuerad.png`, 40 krediter); fler är inte beställda.
- Om dealern ska sitta lägre i bild i de nya ankarna, med mer av armarna synliga och magen in under bordskanten. Jakobs tanke 2026-11-18; han är osäker.
- Om returen håller som egen film för Paulina (LAGT n→REDO). Kedjan för plats 4 prövar det.
- Att spelkärnan följer Scoutgamings kod token för token är gamla Dealers uppgift. Jämförelsen är inte körd om här.

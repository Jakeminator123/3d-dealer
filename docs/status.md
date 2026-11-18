# Läget

Senast ändrad 2026-11-18, mitt på dagen. Ersätt det som inte längre gäller. Antal och listor står inte här: fråga registret.

## Målet

Paulina delar ut kort till alla sju platser och kommer tillbaka, med två kort per plats, i vyn Spelaren: 14 klipp. Vilka som finns och vilka som saknas: `node src/pipeline/runda.ts paulina spelaren --plan`.

## Finns

- Servern (`src/server`): lämnar ut registret, filerna i `assets/` och förhandsbilder av dem, och tar emot förlagor. Svarar bara på localhost, och startar om sig själv när dess kod ändras. `npm start` och `npm stop` ([README.md](../README.md)); Labbet på http://localhost:5310/lab/.
- Labbet, steget Granska: registret avdelning för avdelning. Bilder i full storlek och pixel för pixel, filmer i full fart, långsamt och ruta för ruta, modeller i 3D med mått mätta i filen. Omdömen sätts med klick och sparas i registret. Jakob kan skriva varför, och agentens svar syns bredvid.
- Scenen (`src/scene`, `content/scene.json`) och Labbets steg Scen: bord, sko och ett rum med golv, att vrida runt och zooma i. Vyerna är Spelaren, Plats 1–7 och närbilden av var och en. Dealern i scenen är en följd av dealerfilmer på den vikta ytan, eller dockan.
- Dockan (`src/scene/doll.ts`, `dollPose.ts`, `content/doll.json`, `content/moves/`): cykeln REDO → kortet lagt → REDO för plats 1–7 och kort 0–1, och den äldre enkla given. Hon är standarden för var kort hämtas och läggs.
- Tagningens väg (`src/pipeline/tagning.ts`, `content/tagning.json`): paketet före beställningen, och mätning mot gränsvärden, bevis i scenen och registrering efter. Se [production.md](production.md).
- Uppspelningen av en hel giv (`src/scene/reel.ts`, `src/pipeline/runda.ts`, `content/runda.json`): klippen i följd, med scenens kort kvar på bordet. Prövad med pilotklippet tre gånger i rad: `output/work/runda/`.
- Paulina ur Spelaren: ankaret `spelaren-redo.png` och pilotklippet för plats 4, första kortet, godkända av oberoende granskare. Den äldre given utan återväg (`giv-4-nyp_spelaren_t1.mp4`) är också godkänd.
- Paulina ur Plats 7: ankarna `plats-7-redo.png` och `plats-7-lagt-4.png` är godkända. Den äldre givens tagning är underkänd och arkiverad.
- Registret (`content/register.db`): posterna, omdömenas historik, beställningarna med kostnad, uppladdningarna, mätningarna och det som har lämnat registret. Vägen dit är `npm run reg` (`npm run reg -- hjälp`); reglerna står i [AGENTS.md](../AGENTS.md).
- Spelkärnan (`src/engine`): förd över ur gamla Dealer med sju testfiler. De tio kodfilerna är byte för byte desamma som där; ursprung och avvikelser står i `src/engine/provenance.json`. Den är inte kopplad till något gränssnitt än.
- Prov: `npm test` (också gränserna mellan mapparna och serverns felsvar), `npm run typecheck`, och `npm run reg -- check` för `assets/` mot registret.

## Finns inte än

- De 13 övriga cykelklippen ur Spelaren. De beställs i omgångar och döms av en oberoende granskare.
- En cykel ur Plats 7, och dealerns egna kort.
- Skugga under handen på filten, rummets ljus på bord och dealer, marker, sparade reglage.
- En verklig handled i dockans cykel till plats 6 och 7: den böjs 99–111° (måttet `dockansHandled` flaggar det).
- De lokala stegen för ett ankare (krympa händer, platta det gröna) som kod i `src/pipeline`. De ligger som skript i `output/work/giv-4/`.
- Casinot, en spelsession i servern, och Labbets steg Dealer, Klipp och Spela.

## Omdömen

Agenten dömer efter oberoende granskning, och Jakob ändrar det han vill i Labbet: http://localhost:5310/lab/#granska. Läget frågas ur registret:

- antal per grupp och status: `npm run reg -- summary`;
- det som väntar: `npm run reg -- queue`, och `npm run reg -- list <grupp> "granska igen"`;
- det produktionslinjen inte använder, och vad som föreslås för var och en: `npm run reg -- unused`;
- det som lämnades utanför, arkiverades eller togs bort, med hela posten: `npm run reg -- show <fil>` (arkiverade filer ligger i `output/work/arkiv/`).

## Näst

1. Serien ur Spelaren klar och dömd, och hela given sparad som film med `runda.ts`.
2. Pilotklippet om igen, om 24 rutor/s i dockans film tar bort rycket i takten.
3. En cykel ur Plats 7 med det godkända ankaret.
4. Bakgrunderna med Jakobs ord, och materialen och modellerna, döms i scenen.
5. Resten av etapp 1: spelsession, Casinot, Labbets steg Dealer, Klipp och Spela.

## Öppet

- Om GitHub-arkivet ska vara publikt. Där ligger privata samtal, uppgifter om Runway-kontot och en värdering av Scout Gaming, och spelkärnan är kopierad ur Scoutgaming. Ingenting pushas utan Jakobs ord.
- Om märkkortets färger i luften (röd baksida, vit framsida) är rätt. De är agentens val.
- Om ögonlocken i `spelaren-redo.png` ska höjas: hon ser ned hela klippet, vilket granskaren tyckte kan läsas som sömnigt i närbild. Ett nytt ankare gäller då alla klipp.
- Om `dealers/paulina/anchors/vila.png`, det sista ankaret i gamla rutan, ska stå kvar: skons passning i `content/scene.json` och dealerns kropp i `src/scene/geometry.test.ts` är mätta i den. Ingen kod läser filen.
- Om nyp eller släp blir Paulinas grepp. Cykeln här är nyp.
- Om Spelarens avstånd (`player` i `content/scene.json`) är rätt. Det är valt av agenten efter Jakobs ord om att bord och dealer ska skjutas samman; han har inte sett det. Som jämförelse står local-studios öga 1,48 m över golvet, cirka 0,68 m över filten (vårt: 0,60).
- Om bordsmodellens skala stämmer: skon hänger 4–7 cm utanför kanten mot dealern sedd från sidan, och kortplatserna ligger inom 0,45 m från dealern på ett bord som är 1,5 m djupt. local-studios bord är 297,0 × 141,8 × 84,5 cm; vårt är 2,10 m långt (`table.model` i `content/scene.json`). Jakob: rätta det sist.
- Att spelkärnan följer Scoutgamings kod token för token är gamla Dealers uppgift. Jämförelsen är inte körd om här.

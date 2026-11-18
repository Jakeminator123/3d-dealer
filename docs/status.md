# Läget

Senast ändrad 2026-11-18, förmiddag. Ersätt det som inte längre gäller.

## Finns

- Mappstrukturen och dokumenten.
- Ett startkommando: `npm run dev`, sedan http://localhost:5310/lab/. Se [README.md](../README.md).
- Servern (`src/server`): lämnar ut registret, filerna i `assets/` och förhandsbilder av dem, och tar emot förlagor. Svarar bara på localhost.
- Labbet, steget Granska: registret avdelning för avdelning. Bilder i full storlek och pixel för pixel, filmer i full fart, långsamt och ruta för ruta, modeller i 3D med mått mätta i filen. Omdömen sätts med klick och sparas i `content/assets.json`. Jakob kan skriva varför, och agentens svar syns bredvid.
- Scenen (`src/scene`, `content/scene.json`) och Labbets steg Scen: bord, sko och ett rum med golv, att vrida runt och zooma i. Vyerna är Spelaren (ögat i dealerns ögonhöjd, 1,90 m från hennes bordskant), Plats 1–7, närbilden av var och en, och Filmkameran. Dealern i scenen är en av fyra: en dealerfilm på den vikta ytan, dockan, en helfigur eller ett gammalt ankare. Kortplatserna går att rita ut, och scenens eget kort läggs på kortplatsen när ett klipp har lagt sitt märkkort.
- Dockan (`src/scene/doll.ts`, `dollPose.ts`, `content/doll.json`, `content/moves/`): nyp-given REDO → LAGT, hämtad i scenens sko och lagd på första kortplatsen för plats 1–7. Hon är standarden för var kort hämtas och läggs. I bild: `output/work/giv-4/standard-platser.jpg`.
- Förlagor ur scenen, från Labbet eller från kommandoraden (`node src/pipeline/shoot.ts`): bilder och klipp ur en vy, i rum eller i ateljé.
- Paulinas giv till plats 4 ur Spelaren, på grön skärm: ankarna `spelaren-redo.png` och `spelaren-lagt-4.png` och tagningen `clips/giv-4-nyp_spelaren_t1.mp4`. Lagd i scenen hamnar kortet på kortplatsen för plats 4, och scenens kort tar märkkortets plats (bevisfilmer: `output/forlagor/giv-4-nyp-spelaren-t1_*`). Hur den gjordes står i [production.md](production.md).
- Import och strykning i registret: `node src/pipeline/import.ts`.
- Agentens väg till registret: `npm run judge` läser kön av det som fått `granska igen`, sätter omdömen och skriver svar. Reglerna står i [AGENTS.md](../AGENTS.md).
- Spelkärnan (`src/engine`): förd över ur gamla Dealer med sju testfiler. De tio kodfilerna är byte för byte desamma som där; ursprung och avvikelser står i `src/engine/provenance.json`. Den är inte kopplad till något gränssnitt än.
- Tester: `npm test` (189 tester, varav 71 för spelkärnan) och `npm run typecheck` gick igenom 2026-11-18.
- 75 filer i `assets/`, alla registrerade i `content/assets.json` med ursprung och sha256. Läget för varje fil står i registret.
- Underlaget från inläsningen av gamla projektet: [information/underlag-inlasning-2026-11-18.md](../information/underlag-inlasning-2026-11-18.md).

## Finns inte än

- Samma giv ur en sidovy. Dockans underlag ur Plats 7 finns; Paulinas ankare därifrån är halvgjorda och filmen är inte beställd. Se [överlämningen](../information/overlamning-2026-11-18-morgon.md).
- Vägen tillbaka (LAGT → REDO, LAGT → VILA), VILA → REDO, givar till de andra platserna och dealerns egna kort, som ankare och film. Dockan har bara given dit.
- Handens tatuering genom hela rörelsen: den försvinner mitt i tagningen.
- Skugga på bordet, rummets ljus på bord och dealer, marker, sparade reglage.
- De lokala stegen för ett ankare (krympa händer, måla kort, platta det gröna) som kod i `src/pipeline`. De ligger som skript i `output/work/giv-4/`.
- Casinot, en spelsession i servern, och Labbets steg Dealer, Klipp och Spela.
- Dealerns fil och klippregistret i `content/`.
- Ett steg som tar bort det som fått `utgår`. Tills vidare görs det för hand efter Jakobs besked.
- Ett fjärrarkiv för Git. Allt sedan commit `e833877` är ocommittat.

## Omdömen

Sedan 2026-11-18 dömer agenten, efter oberoende granskning, och Jakob ändrar det han vill i Labbet: http://localhost:5310/lab/#granska.

| Grupp | Antal | Mapp |
| --- | --- | --- |
| Identitet | 7 | `assets/dealers/paulina/identity/` |
| Ankare | 10 | `assets/dealers/paulina/anchors/` |
| Klipp | 1 | `assets/dealers/paulina/clips/` |
| Bakgrunder | 17 | `assets/scene/backgrounds/` |
| Material | 12 | `assets/scene/materials/` |
| Modeller | 2 | `assets/models/` |
| Referens, bilder | 14 | `assets/reference/` |
| Referens, filmer | 12 | `assets/reference/films/` |

- Av ankarna är två gjorda för vyn Spelaren (`use: "dealerfilm"`), tre är helfigurer och fem är i gamla projektets ruta (1764 × 1174, skon inbakad). De gamla är referens.
- Elva bakgrunder har `granska igen` och väntar på omdöme i scenen med golv. Därefter material och modeller.
- Numren i Labbet är registrets ordning inom varje avdelning.
- Vad som medvetet lämnades utanför, och det som har strukits, står sist i `content/assets.json`, under `leftOut`. Strukna filer ligger i `output/work/struket/`.

## Näst

1. Samma giv ur Plats 7: ankare och film efter dockan sedd därifrån, och tagningen lagd i scenen ur Plats 7.
2. Det granskaren anmärkte på i Spelarens ankare och tagning (står i registret, `statusBy`).
3. Vägen tillbaka och VILA → REDO för dockan, så att en hel kedja går att spela.
4. Elva bakgrunder, material och modeller döms i scenen.
5. Ankarets lokala steg in i `src/pipeline`, när receptet har hållit för en dealer till.
6. Resten av etapp 1: spelsession, Casinot, Labbets steg Dealer, Klipp och Spela.

## Öppet

- Om nyp eller släp blir Paulinas grepp. Given här är nyp.
- Takten: nyp-given är 4 s. Jakob vill ha släp-givarna dubbelt så snabba som gamla provets 4 s; om nyp har han inget sagt.
- Om Spelarens nya avstånd (1,90 m) är rätt. Det är valt av agenten efter Jakobs ord om att bord och dealer ska skjutas samman; han har inte sett det.
- Om bordsmodellens skala stämmer: skon hänger utanför kanten mot dealern sedd från sidan. Jakob: rätta det sist.
- Att spelkärnan följer Scoutgamings kod token för token är gamla Dealers uppgift. Jämförelsen är inte körd om här.

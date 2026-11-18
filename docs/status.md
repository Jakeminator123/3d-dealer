# Läget

Senast ändrad 2026-11-18, förmiddag. Ersätt det som inte längre gäller.

## Finns

- Mappstrukturen och dokumenten.
- Ett startkommando: `npm run dev`, sedan http://localhost:5310/lab/. Se [README.md](../README.md).
- Servern (`src/server`): lämnar ut registret, filerna i `assets/` och förhandsbilder av dem, och tar emot förlagor. Svarar bara på localhost.
- Labbet, steget Granska: registret avdelning för avdelning. Bilder i full storlek och pixel för pixel, filmer i full fart, långsamt och ruta för ruta, modeller i 3D med mått mätta i filen. Omdömen sätts med klick och sparas i `content/assets.json`. Jakob kan skriva varför, och agentens svar syns bredvid.
- Scenen (`src/scene`, `content/scene.json`) och Labbets steg Scen: bord, sko och ett rum med golv, att vrida runt och zooma i. Vyerna är Spelaren (ögat i dealerns ögonhöjd, 1,90 m från hennes bordskant), Plats 1–7 och närbilden av var och en. Dealern i scenen är en dealerfilm på den vikta ytan eller dockan. Kortplatserna går att rita ut, och scenens eget kort läggs på kortplatsen när ett klipp har lagt sitt märkkort.
- Dockan (`src/scene/doll.ts`, `dollPose.ts`, `content/doll.json`, `content/moves/`): nyp-given REDO → LAGT, hämtad i scenens sko och lagd på första kortplatsen för plats 1–7. Hon är standarden för var kort hämtas och läggs. I bild: `output/work/giv-4/standard-platser.jpg`.
- Förlagor ur scenen, från Labbet eller från kommandoraden (`node src/pipeline/shoot.ts`): bilder och klipp ur en vy, i rum eller i ateljé. Jakobs server på 5310 startades 05:25 och kör serverkoden därifrån (mätt 2026-11-18 förmiddag): den behöver startas om innan Labbet kan spara förlagor med en dealerfilm eller dockan.
- Paulinas giv till plats 4 ur Spelaren, på grön skärm: ankarna `spelaren-redo.png` och `spelaren-lagt-4.png` och tagningen `clips/giv-4-nyp_spelaren_t1.mp4`. Lagd i scenen hamnar kortet på kortplatsen för plats 4, och scenens kort tar märkkortets plats (bevisfilmer: `output/forlagor/giv-4-nyp-spelaren-t1_*`). Hur den gjordes står i [production.md](production.md).
- Import och arkivering i registret: `node src/pipeline/import.ts` för in en fil, och `node src/pipeline/import.ts stryk` arkiverar en (flyttar den till `output/work/struket/` och stryker posten).
- Agentens väg till registret: `npm run judge` läser kön av det som fått `granska igen`, sätter omdömen och skriver svar. Reglerna står i [AGENTS.md](../AGENTS.md).
- Spelkärnan (`src/engine`): förd över ur gamla Dealer med sju testfiler. De tio kodfilerna är byte för byte desamma som där; ursprung och avvikelser står i `src/engine/provenance.json`. Den är inte kopplad till något gränssnitt än.
- Tester: `npm test` (182 tester, varav 71 för spelkärnan och 36 för dockan) och `npm run typecheck` gick igenom 2026-11-18 förmiddag.
- 75 filer i `assets/`, alla registrerade i `content/assets.json` med ursprung och sha256. Läget för varje fil står i registret.
- Git: grenen `main` och fjärrarkivet `origin` (github.com/Jakeminator123/3d-dealer), som är publikt. Lokala `main` ligger före `origin`; ingenting pushas utan Jakobs ord.
- Underlaget från inläsningen av gamla projektet: [information/underlag-inlasning-2026-11-18.md](../information/underlag-inlasning-2026-11-18.md).

## Finns inte än

- Samma giv ur en sidovy. Dockans underlag ur Plats 7 finns (`output/forlagor/docka-giv-nyp-plats-4_plats-7-nara_atelje*`). Av Paulinas ankare därifrån följer `output/work/giv-4/ankare/plats-7-redo-2-nano.png` och `plats-7-lagt-2-nano.png` dockan (skon på samma bildpunkter), men i LAGT är givhanden 188 × 92 bildpunkter mot dockans 112 × 88 och kortet för långt (116 mot 64). Retusch av huvudet, krympning, kortet och plattning återstår, och sedan tagningen. De fem försöken med Nano Banana Pro kostade cirka 100 krediter, uppskattat och inte mätt.
- Vägen tillbaka (LAGT → REDO, LAGT → VILA), VILA → REDO, givar till de andra platserna och dealerns egna kort, som ankare och film. Dockan har bara given dit.
- Handens tatuering genom hela rörelsen: den försvinner mitt i tagningen.
- Skugga på bordet, rummets ljus på bord och dealer, marker, sparade reglage.
- De lokala stegen för ett ankare (krympa händer, måla kort, platta det gröna) som kod i `src/pipeline`. De ligger som skript i `output/work/giv-4/`.
- Casinot, en spelsession i servern, och Labbets steg Dealer, Klipp och Spela.
- Dealerns fil och klippregistret i `content/`.
- Ett kommando som tar bort en fil och dess post. I dag finns bara `stryk`, som arkiverar.

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

- Av ankarna är två gjorda för vyn Spelaren (`use: "dealerfilm"`), tre är helfigurer och fem är i gamla projektets ruta (1764 × 1174, skon inbakad). Bara de två för Spelaren används: helfigurerna och de gamla ankarna går inte längre att visa i scenen.
- Elva bakgrunder har `granska igen` och väntar på omdöme i scenen med golv. Därefter material och modeller.
- Numren i Labbet är registrets ordning inom varje avdelning.
- Vad som medvetet lämnades utanför, och det som har strukits, står sist i `content/assets.json`, under `leftOut`. Arkiverade filer ligger i `output/work/struket/`.

## Näst

1. Samma giv ur Plats 7: ankare och film efter dockan sedd därifrån, och tagningen lagd i scenen ur Plats 7.
2. Den oberoende granskningen av Spelarens två ankare och tagning: de står fortfarande som `att granska`.
3. Vägen tillbaka och VILA → REDO för dockan, så att en hel kedja går att spela.
4. Elva bakgrunder, material och modeller döms i scenen.
5. Ankarets lokala steg in i `src/pipeline`, när receptet har hållit för en dealer till.
6. Resten av etapp 1: spelsession, Casinot, Labbets steg Dealer, Klipp och Spela. Jakob har frågat efter stegen; Dealer är närmast (identitet och ankare per dealer, ur registret).

## Öppet

- Om nyp eller släp blir Paulinas grepp. Given här är nyp.
- Takten för nyp-given, i dag 4 s. Om nyp har Jakob inget sagt; om släp, se [production.md](production.md).
- Om Spelarens nya avstånd (1,90 m) är rätt. Det är valt av agenten efter Jakobs ord om att bord och dealer ska skjutas samman; han har inte sett det. Som jämförelse står local-studios öga 1,48 m över golvet, cirka 0,68 m över filten (vårt: 0,60).
- Om bordsmodellens skala stämmer: skon hänger 4–7 cm utanför kanten mot dealern sedd från sidan, och kortplatserna ligger inom 0,45 m från dealern på ett bord som är 1,5 m djupt. local-studios bord är 297,0 × 141,8 × 84,5 cm; vårt är 2,10 m långt (`table.model` i `content/scene.json`). Jakob: rätta det sist.
- Att spelkärnan följer Scoutgamings kod token för token är gamla Dealers uppgift. Jämförelsen är inte körd om här.

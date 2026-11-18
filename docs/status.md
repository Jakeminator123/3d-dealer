# Läget

Senast ändrad 2026-11-18, förmiddag. Ersätt det som inte längre gäller. Antal och listor står inte här: fråga registret.

## Finns

- Mappstrukturen och dokumenten.
- Servern (`src/server`): lämnar ut registret, filerna i `assets/` och förhandsbilder av dem, och tar emot förlagor. Svarar bara på localhost, och startar om sig själv när dess kod ändras. `npm start` och `npm stop` ([README.md](../README.md)); Labbet på http://localhost:5310/lab/.
- Labbet, steget Granska: registret avdelning för avdelning. Bilder i full storlek och pixel för pixel, filmer i full fart, långsamt och ruta för ruta, modeller i 3D med mått mätta i filen. Omdömen sätts med klick och sparas i registret. Jakob kan skriva varför, och agentens svar syns bredvid.
- Scenen (`src/scene`, `content/scene.json`) och Labbets steg Scen: bord, sko och ett rum med golv, att vrida runt och zooma i. Vyerna är Spelaren (ögat i dealerns ögonhöjd, `player` i `content/scene.json`), Plats 1–7 och närbilden av var och en. Dealern i scenen är en dealerfilm på den vikta ytan eller dockan. Kortplatserna går att rita ut, och scenens eget kort läggs på kortplatsen när ett klipp har lagt sitt märkkort.
- Dockan (`src/scene/doll.ts`, `dollPose.ts`, `content/doll.json`, `content/moves/`): nyp-given REDO → LAGT, hämtad i scenens sko och lagd på första kortplatsen för plats 1–7. Hon är standarden för var kort hämtas och läggs. I bild: `output/work/giv-4/standard-platser.jpg`.
- Förlagor ur scenen, från Labbet eller från kommandoraden (`node src/pipeline/shoot.ts`): bilder och klipp ur en vy, i rum eller i ateljé.
- Paulinas giv till plats 4 ur Spelaren, på grön skärm: ankarna `spelaren-redo.png` och `spelaren-lagt-4.png` och tagningen `clips/giv-4-nyp_spelaren_t1.mp4`, alla godkända. Lagd i scenen hamnar kortet på kortplatsen för plats 4, och scenens kort tar märkkortets plats (bevisfilmer: `output/forlagor/giv-4-nyp-spelaren-t1_*`). Hur den gjordes står i [production.md](production.md).
- Samma giv ur Plats 7: ankarna `plats-7-redo.png` och `plats-7-lagt-4.png` är godkända. Tagning 1 är underkänd (högra handen lyfter och svävar 1,79–2,67 s) och arkiverad: `npm run reg -- show dealers/paulina/clips/giv-4-nyp_plats-7_t1.mp4`.
- Registret (`content/register.db`): posterna, omdömenas historik, beställningarna med kostnad, uppladdningarna, mätningarna och det som har lämnat registret. Vägen dit är `npm run reg` (`npm run reg -- hjälp`); reglerna står i [AGENTS.md](../AGENTS.md).
- Spelkärnan (`src/engine`): förd över ur gamla Dealer med sju testfiler. De tio kodfilerna är byte för byte desamma som där; ursprung och avvikelser står i `src/engine/provenance.json`. Den är inte kopplad till något gränssnitt än.
- Prov: `npm test` (också gränserna mellan mapparna och serverns felsvar), `npm run typecheck`, och `npm run reg -- check` för `assets/` mot registret.
- Underlaget från inläsningen av gamla projektet: [information/underlag-inlasning-2026-11-18.md](../information/underlag-inlasning-2026-11-18.md).

## Finns inte än

- En godkänd tagning ur Plats 7.
- Vägen tillbaka (LAGT → REDO, LAGT → VILA), VILA → REDO, givar till de andra platserna och dealerns egna kort, som ankare och film. Dockan har bara given dit.
- Handens tatuering genom hela rörelsen: i Spelarens tagning försvinner den mitt i.
- Skugga på bordet, rummets ljus på bord och dealer, marker, sparade reglage.
- De lokala stegen för ett ankare (krympa händer, måla kort, platta det gröna) som kod i `src/pipeline`. De ligger som skript i `output/work/giv-4/`.
- Casinot, en spelsession i servern, och Labbets steg Dealer, Klipp och Spela.
- Dealerns fil och klippregistret i `content/`.

## Omdömen

Agenten dömer efter oberoende granskning, och Jakob ändrar det han vill i Labbet: http://localhost:5310/lab/#granska. Läget frågas ur registret:

- antal per grupp och status: `npm run reg -- summary`;
- det som väntar: `npm run reg -- queue`, och `npm run reg -- list <grupp> "granska igen"`;
- det produktionslinjen inte använder, och vad som hindrar att det tas bort: `npm run reg -- unused`;
- det som lämnades utanför, arkiverades eller togs bort, med hela posten: `npm run reg -- show <fil>` (arkiverade filer ligger i `output/work/arkiv/`).

## Näst

1. En ny tagning ur Plats 7, och den lagd i scenen ur Plats 7.
2. Vägen tillbaka och VILA → REDO för dockan, så att en hel kedja går att spela.
3. Bakgrunderna, materialen och modellerna döms i scenen.
4. Ankarets lokala steg in i `src/pipeline`, när receptet har hållit för en dealer till.
5. Resten av etapp 1: spelsession, Casinot, Labbets steg Dealer, Klipp och Spela. Jakob har frågat efter stegen; Dealer är närmast (identitet och ankare per dealer, ur registret).

## Öppet

- Om `dealers/paulina/anchors/vila.png`, det sista ankaret i gamla rutan, ska stå kvar: skons passning i `content/scene.json` och dealerns kropp i `src/scene/geometry.test.ts` är mätta i den. Ingen kod läser filen.
- Om nyp eller släp blir Paulinas grepp. Given här är nyp.
- Takten för nyp-given, i dag 4 s. Om nyp har Jakob inget sagt; om släp, se [production.md](production.md).
- Om Spelarens nya avstånd (1,90 m) är rätt. Det är valt av agenten efter Jakobs ord om att bord och dealer ska skjutas samman; han har inte sett det. Som jämförelse står local-studios öga 1,48 m över golvet, cirka 0,68 m över filten (vårt: 0,60).
- Om bordsmodellens skala stämmer: skon hänger 4–7 cm utanför kanten mot dealern sedd från sidan, och kortplatserna ligger inom 0,45 m från dealern på ett bord som är 1,5 m djupt. local-studios bord är 297,0 × 141,8 × 84,5 cm; vårt är 2,10 m långt (`table.model` i `content/scene.json`). Jakob: rätta det sist.
- Att spelkärnan följer Scoutgamings kod token för token är gamla Dealers uppgift. Jämförelsen är inte körd om här.

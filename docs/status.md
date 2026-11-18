# Läget

Senast ändrad 2026-11-18, eftermiddag. Ersätt det som inte längre gäller. Antal och listor står inte här: fråga registret.

## Målet är nått

Paulina delar ut kort till alla sju platser och kommer tillbaka, med två kort per plats, i vyn Spelaren: 14 klipp, alla godkända av oberoende granskare. Hela given ses i Labbet (http://localhost:5310/lab/, steget Scen) eller sparas med `node src/pipeline/runda.ts paulina spelaren [--nara]`. Vilka klipp som spelas: `node src/pipeline/runda.ts paulina spelaren --plan`.

## Finns

- Produktionslinjen, körd för en hel serie: dockans cykel → REDO-ankare på grönt → Kling 4 → mätning och oberoende granskning → följd i scenen. Se [production.md](production.md). Alla klipp i serien höll i första tagningen; piloten gjordes om en gång för takten.
- Dockan (`src/scene/doll.ts`, `dollPose.ts`, `content/doll.json`, `content/moves/`): cykeln REDO → kortet lagt → REDO för plats 1–7 och kort 0–1. Hon är standarden för var kort hämtas och läggs.
- Tagningens väg (`src/pipeline/tagning.ts`, `matning.ts`, `content/tagning.json`): `forbered`, `ta-emot` och `mät-om`, med mått mot gränsvärden och bevis i scenen.
- Uppspelningen (`src/scene/reel.ts`, `round.ts`, `src/pipeline/runda.ts`, `content/runda.json`): klippen i följd med scenens kort kvar på bordet, i Labbet och som film.
- Paulina ur Spelaren: ankaret `spelaren-redo.png` och 14 cykelklipp. Ur Plats 7: ankaret `plats-7-redo.png` och en cykel till plats 4, godkänd; samma giv håller alltså från sidan.
- Scenen (`src/scene`, `content/scene.json`) och Labbets steg Scen: bord, sko och ett rum med golv; vyerna Spelaren, Plats 1–7 och närbilden av var och en. Tolv rum är godkända i scenen med bord och dealer på plats.
- Labbet, steget Granska: registret avdelning för avdelning, med omdömen, Jakobs ord och agentens svar.
- Registret (`content/register.db`): posterna, omdömenas historik, beställningarna med kostnad, uppladdningarna, mätningarna och det som har lämnat registret. Vägen dit är `npm run reg` (`npm run reg -- hjälp`); reglerna står i [AGENTS.md](../AGENTS.md).
- Servern (`src/server`): svarar bara på localhost och startar om sig själv när dess kod ändras. `npm start` och `npm stop` ([README.md](../README.md)).
- Spelkärnan (`src/engine`): förd över ur gamla Dealer med sju testfiler; ursprung och avvikelser står i `src/engine/provenance.json`. Den är inte kopplad till något gränssnitt än.
- Prov: `npm test` (också gränserna mellan mapparna och serverns felsvar), `npm run typecheck`, och `npm run reg -- check` för `assets/` mot registret.

## Finns inte än

- De 13 övriga korten ur Plats 7, och andra vyer. Skon ska flyttas först (se Öppet).
- Dealerns egna kort, och det som händer mellan givarna (VILA, vänta, vända kort, samla in).
- Valören på kortet medan det är i luften: framsidan är blank tills kortet har landat.
- Skugga under handen och under korten på filten, rummets ljus på bord och dealer, marker.
- En bildhöjd per bakgrund: Monacos gäster ser för långa ut med scenens höjd, och rätt med 1,0 m.
- De lokala stegen för ett ankare (krympa händer, platta det gröna) som kod i `src/pipeline`. De ligger som skript i `output/work/giv-4/`.
- Casinot, en spelsession i servern, och Labbets steg Dealer, Klipp och Spela.

## Omdömen

Agenten dömer efter oberoende granskning, och Jakob ändrar det han vill i Labbet: http://localhost:5310/lab/#granska. Läget frågas ur registret:

- antal per grupp och status: `npm run reg -- summary`;
- det som väntar: `npm run reg -- queue`, och `npm run reg -- list <grupp> "granska igen"`;
- det produktionslinjen inte använder, och vad som föreslås för var och en: `npm run reg -- unused`;
- det som lämnades utanför, arkiverades eller togs bort, med hela posten: `npm run reg -- show <fil>` (arkiverade filer ligger i `output/work/arkiv/`).

Tre bakgrunder och fyra material har `utgår` och tas bort vid nästa arbetspass, om Jakob inte har ändrat omdömet. Identitetsbilden `original-sida-kavaj.png` har också `utgår` men står kvar så länge en annan post pekar på den som sin källa.

## Näst

1. Skons läge avgörs, och sedan serien ur Plats 7 (granskarens ordning: plats 1, 3, 5 och 7 först).
2. Dealerns egna kort och rörelserna mellan givarna, som cykler ur samma REDO.
3. Mätningen för sidovyer: fyra mått jämför i dag mot fel ruta eller fel hörn (`output/work/granskning-plats-7-cykel/`).
4. Spelkärnan kopplad till uppspelningen: en signal väljer klipp och kort. Därefter Casinot och Labbets steg Dealer, Klipp och Spela.

## Öppet

- Om GitHub-arkivet ska vara publikt. Där ligger privata samtal, uppgifter om Runway-kontot och en värdering av Scout Gaming, och spelkärnan är kopierad ur Scoutgaming. Ingenting pushas utan Jakobs ord; lokala `main` ligger före `origin/main`.
- Skons läge: mitten står på dealerns bordskant, så bakhörnet hänger cirka 12 cm utanför, vilket syns från sidan. Flyttas den stämmer de 14 klippen ur Spelaren inte längre med scenens sko sedd från andra håll. Jakob i natt: rätta det sist.
- Vilket rum som passar Paulina bäst, och om utomhusrummen hör hemma. Arket med alla rum: `output/work/granskning-rum/bakgrunder-omdomen.jpg`.
- Om märkkortets färger i luften (röd baksida, vit framsida) är rätt, och om filmens sko (mörkare, bronsram) duger i filmens egen vy. Båda är agentens val.
- Om ögonlocken i `spelaren-redo.png` ska höjas: hon ser ned hela klippet. Ett nytt ankare gäller då alla klipp.
- Om `dealers/paulina/anchors/vila.png`, det sista ankaret i gamla rutan, ska stå kvar: skons passning i `content/scene.json` och dealerns kropp i `src/scene/geometry.test.ts` är mätta i den. Ingen kod läser filen.
- Om nyp eller släp blir Paulinas grepp. Cykeln här är nyp.
- Om Spelarens avstånd (`player` i `content/scene.json`) är rätt. Det är valt av agenten efter Jakobs ord om att bord och dealer ska skjutas samman. Som jämförelse står local-studios öga 1,48 m över golvet, cirka 0,68 m över filten (vårt: 0,60).
- Om bordsmodellens skala stämmer: kortplatserna ligger inom 0,45 m från dealern på ett bord som är 1,5 m djupt. local-studios bord är 297,0 × 141,8 × 84,5 cm; vårt är 2,10 m långt (`table.model` i `content/scene.json`).
- Att spelkärnan följer Scoutgamings kod token för token är gamla Dealers uppgift. Jämförelsen är inte körd om här.

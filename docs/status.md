# Läget

Senast ändrad 2026-11-19, natt. Ersätt det som inte längre gäller. Antal och listor står inte här: fråga registret.

## Var vi står

Serien ur vyn Spelaren görs om med cykeln E (`cykel-nyp-rask`, 3,0 s, ankaret `spelaren-redo-3.png`), ritad efter en mätt verklig dealer, i omgångar med en oberoende granskare emellan. Den första serien (14 klipp, äldre rörelse och ankare) fann Jakob stel och hackig; korten och handlederna var bra. Standardrundan har alla sju platserna (`content/runda.json`), och vilka klipp som spelas i den, och vilka kort som saknar klipp, säger `node src/pipeline/runda.ts paulina spelaren --plan`. Två händer (`cykel-tva-hander`) prövas som nästa cykel, först som ett provklipp till plats 4.

## Finns

- Produktionslinjen, körd för en hel serie: dockans cykel → REDO-ankare på grönt → Kling 4 → mätning och oberoende granskning → följd i scenen. Se [production.md](production.md).
- Dockan (`src/scene/doll.ts`, `dollPose.ts`, `content/doll.json`, `content/moves/`): cykeln REDO → kortet lagt → REDO för plats 1–7 och kort 0–2, och dealerns öppna kort, hålkort, vändning och extrakort. Hon andas, leder med blick och bål, och står aldrig frusen. Måtten på dynamiken: `src/pipeline/rorelse.ts`.
- Tagningens väg (`src/pipeline/tagning.ts`, `matning.ts`, `content/tagning.json`): `forbered`, `ta-emot` och `mät-om`, med mått mot gränsvärden och bevis i scenen.
- Spelkärnan driver uppspelningen (`src/scene/round.ts`, `reel.ts`, `src/server/game.ts`): varje utdelat kort väljer sitt klipp, och kort utan klipp läggs utan dealerns rörelse. Casinot (http://localhost:5310/casino/) spelar en runda mot spelkärnan, och `runda.ts` sparar en runda med frö som film.
- Scenen (`src/scene`, `content/scene.json`): bord, sko på bordet, kortplanen som båge, rum med golv; vyerna Spelaren, Plats 1–7 och närbilden av var och en. Kortet visar sin valör från vändningen, och korten och handen skuggar filten. Tolv rum är godkända.
- Labbet (http://localhost:5310/lab/): Scen (hela given), Kortplan (bågen, dealerns rad och kortens storlek med reglage, sparade i `content/scene.json`) och Granska (registret med omdömen, Jakobs ord och agentens svar).
- Paulina ur Spelaren: ankaret `spelaren-redo-3.png` med klippen i serien E (givklipp, hålkortet, vändningen och väntan), och det äldre `spelaren-redo.png` med sina 14 klipp. Ur Plats 7: ankaret `plats-7-redo.png` och en godkänd cykel till plats 4, på den gamla geometrin.
- Registret (`content/register.db`): posterna med öga, sko och landningsplats, omdömenas historik, beställningarna med kostnad, uppladdningarna, mätningarna och det som har lämnat registret. Vägen dit är `npm run reg` (`npm run reg -- hjälp`); reglerna står i [AGENTS.md](../AGENTS.md).
- Servern (`src/server`): svarar bara på localhost och startar om sig själv när dess kod ändras. `npm start` och `npm stop` ([README.md](../README.md)).
- Spelkärnan (`src/engine`): förd över ur gamla Dealer med sju testfiler; ursprung och avvikelser står i `src/engine/provenance.json`.
- Prov: `npm test`, `npm run typecheck`, och `npm run reg -- check` för `assets/` mot registret.
- Mallen för en ny dealer: dealerns fil (`content/dealers/<id>.json`), `src/pipeline/identitet.ts` och `ankare.ts` (från en bild av en person till identitetsbilder och ett REDO-ankare), och Labbets steg Dealer, som visar var en dealer står och nästa kommando. Torrprovad utan betald generering; inte körd på riktigt för en andra dealer.
- Klippens fart i uppspelningen (`speed.clips` i `content/runda.json`, reglage i steget Kortplan), och ett statiskt bygge av det riktiga Casinot (`npm run build:statisk`), utlagt på Vercel bakom Jakobs inloggning (hur: [decisions.md](decisions.md), Tekniken). Det läggs ut på nytt när serien ändras. Labbet finns bara på datorn.
- En sida för mobilen med filmer och läge, privat för Jakob: källan ligger i `output/work/mobilsida/`.

## Finns inte än

- De klipp i serien E som ännu saknas eller är underkända: `runda.ts --plan` säger vilka kort i rundan som går utan klipp, och `node src/pipeline/dealer.ts paulina` vad som finns per plats och kort. Granskarnas omdömen ligger i `output/work/granskning-e-1/` och `-2/` (`omdome.json`): det som underkänns arkiveras och tas om efter en ändring i dockan.
- En serie med två händer. Den beställs när Jakob har sett provklippet bredvid E.
- Serier ur andra vyer. Ankaret ur Plats 7 är gjort på den gamla geometrin och görs om först.
- Det som händer mellan givarna: samla in kort, betala ut, marker.
- Djup i filmen, så att kameran kan flyttas med parallax. Dockans djup kan ge det; inte prövat.
- De lokala stegen för ett ankare (krympa händer, platta det gröna) som kod i `src/pipeline`. De ligger som skript i `output/work/giv-4/`.
- Labbets steg Klipp och Spela.

## Omdömen

Agenten dömer efter oberoende granskning, och Jakob ändrar det han vill i Labbet: http://localhost:5310/lab/#granska. Rörelsens naturlighet dömer Jakob själv, på provklipp, innan en serie beställs. Läget frågas ur registret:

- antal per grupp och status: `npm run reg -- summary`;
- det som väntar: `npm run reg -- queue`, och `npm run reg -- list <grupp> "granska igen"`;
- det produktionslinjen inte använder, och vad som föreslås för var och en: `npm run reg -- unused`;
- det som lämnades utanför, arkiverades eller togs bort, med hela posten: `npm run reg -- show <fil>` (arkiverade filer ligger i `output/work/arkiv/`).

Tre bakgrunder och fyra material har `utgår` och tas bort vid nästa arbetspass, om Jakob inte har ändrat omdömet. Identitetsbilden `original-sida-kavaj.png` har också `utgår` men står kvar så länge en annan post pekar på den som sin källa.

## Näst

1. Serien med E görs klar: de kort i standardrundan som saknar ett godkänt klipp, och spelarnas tredje kort och dealerns extrakort. Sedan sparas hela rundan som en film (`node src/pipeline/runda.ts paulina spelaren --nara`) och läggs på mobilsidan. När serien är godkänd arkiveras de 14 äldre klippen och provklippen A–D, och de ankare som då inte används tas bort.
2. Två händer: Jakob ser provklippet bredvid E och väljer. En serie med två händer kostar ungefär som serien E. Jakob har föreslagit att flera rörelsemönster godkänns bredvid varandra ("Kanske ska vi godkänna flera rörelsemönster"): alla klipp ur samma ankare kedjas fritt, men rundan väljer i dag den senaste godkända tagningen per kort. Att den väljer bland flera är inte byggt.
3. Filmen på dockan, det första steget mot en dealer som håller när kameran dras runt (Jakobs ursprungliga tanke, [decisions.md](decisions.md), Projektet). Ett prov utan krediter på ett klipp som finns: filmen projiceras från klippets öga (registrets `eye`) på den rörliga dockan, som rör sig som filmen ruta för ruta, och kameran flyttas några tiotal grader. Sedan en film från vänster och en från höger ur samma docka, som tonar över i varandra efter kamerans vinkel, och Meshy-figuren av henne (`glb/paow/`, riggen saknar fingerleder) passad till dockans skelett som bärare med hennes form. Inget av det är prövat; risken är kanterna där dockans form inte är hennes.
4. Mätfelen som granskarna har pekat ut (`output/work/granskning-e-2/omdome.json`, "matten") rättas i `src/pipeline/matning.ts` och `rorelse.ts`.
5. Mallen prövas med en andra dealer ur en enda bild, och ankarets steg för lagning vid givhanden läggs till i `ankare.ts`.
6. Mätningen för sidovyer, och ett nytt ankare och en serie ur Plats 7 på den nya geometrin.
7. Labbets steg Klipp och Spela, och det som händer mellan givarna.

## Öppet

- Om GitHub-arkivet ska vara publikt. Där ligger privata samtal, uppgifter om Runway-kontot och en värdering av Scout Gaming, och spelkärnan är kopierad ur Scoutgaming. Ingenting pushas utan Jakobs ord; lokala `main` ligger före `origin/main`.
- Krediterna: kontot delas med Codex arbete i gamla Dealer. Ett klipp på 3 s kostar 64 krediter (mätt), så en hel serie ur en vy kostar cirka 1 700, utan omtagningar.
- Kortplanens tal och kortens storlek: valda av agenten, ställbara av Jakob i Labbets steg Kortplan.
- Skon: bakkanten vilar på bordets trälist, eftersom filten bakom korten är smalare än skon. Från filmens egen vy visas filmens sko, som saknar scenskons mässingsram.
- Den verkliga dealern är mätt ur en film som är någon annans (`output/work/verklig-dealer/rapport.md`): bara tal lämnar den, inga rutor. Mer referensfilm som skulle hjälpa står sist i rapporten.
- Om `dealers/paulina/anchors/vila.png`, det sista ankaret i gamla rutan, ska stå kvar: skons passning i `content/scene.json` och dealerns kropp i `src/scene/geometry.test.ts` är mätta i den. Ingen kod läser filen.
- Om nyp eller släp blir Paulinas grepp. Cykeln här är nyp.
- Om Spelarens avstånd (`player` i `content/scene.json`) är rätt. Det är valt av agenten efter Jakobs ord om att bord och dealer ska skjutas samman. Som jämförelse står local-studios öga 1,48 m över golvet, cirka 0,68 m över filten (vårt: 0,60).
- Om bordsmodellens skala stämmer. local-studios bord är 297,0 × 141,8 × 84,5 cm; vårt är 2,10 m långt (`table.model` i `content/scene.json`).
- Att spelkärnan följer Scoutgamings kod token för token är gamla Dealers uppgift. Jämförelsen är inte körd om här.

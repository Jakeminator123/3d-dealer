# Läget

Senast ändrad 2026-11-19. Ersätt det som inte längre gäller. Antal och listor står inte här: fråga registret.

## Var vi står

Serien ur vyn Spelaren är gjord med cykeln E (`cykel-nyp-rask`, 3,0 s, ankaret `spelaren-redo-3.png`), ritad efter en mätt verklig dealer: ett klipp till varje kort i en runda, godkända av oberoende granskare i tre omgångar. Standardrundan har alla sju platserna (`content/runda.json`) och spelas helt med dealerns klipp; `node src/pipeline/runda.ts paulina spelaren --plan` säger vilka. Jakob har inte dömt serien med ögat än. Han fann den första serien (14 klipp, äldre rörelse och ankare) stel och hackig, och har sagt om nattens klipp att hon fortfarande är lite stel. Två händer (`cykel-tva-hander`) finns som ett provklipp till plats 4. Dealern är en film per vy: en figur som håller när kameran dras runt är inte byggd (Näst, punkt 4).

## Finns

- Produktionslinjen, körd för en hel serie: dockans cykel → REDO-ankare på grönt → Kling 4 → mätning och oberoende granskning → följd i scenen. Se [production.md](production.md).
- Dockan (`src/scene/doll.ts`, `dollPose.ts`, `content/doll.json`, `content/moves/`): cykeln REDO → kortet lagt → REDO för plats 1–7 och kort 0–2, och dealerns öppna kort, hålkort, vändning och extrakort. Hon andas, leder med blick och bål, och står aldrig frusen. Måtten på dynamiken: `src/pipeline/rorelse.ts`.
- Tagningens väg (`src/pipeline/tagning.ts`, `matning.ts`, `content/tagning.json`): `forbered`, `ta-emot` och `mät-om`, med mått mot gränsvärden och bevis i scenen.
- Spelkärnan driver uppspelningen (`src/scene/round.ts`, `reel.ts`, `src/server/game.ts`): varje utdelat kort väljer sitt klipp, och kort utan klipp läggs utan dealerns rörelse. Casinot (http://localhost:5310/casino/) spelar en runda mot spelkärnan, och `runda.ts` sparar en runda med frö som film.
- Scenen (`src/scene`, `content/scene.json`): bord, sko på bordet, kortplanen som båge, rum med golv; vyerna Spelaren, Plats 1–7 och närbilden av var och en. Kortet visar sin valör från vändningen, och korten och handen skuggar filten. Tolv rum är godkända.
- Labbet (http://localhost:5310/lab/), det enda stället att granska på: Scen (hela given), Kortplan (bågen, dealerns rad och kortens storlek med reglage, sparade i `content/scene.json`), Dealer (kartan över vad en spelbar dealer kräver och vad som finns: identitet, ankare och varje kort med sitt läge), Klipp (varje tagning mot dockans förlaga, i takt, i halv fart och ruta för ruta, med omdöme, mått och beställning, också de arkiverade; och scenens tal och videojobbets format) och Granska (registret med omdömen, Jakobs ord och agentens svar).
- Paulina ur Spelaren: ankaret `spelaren-redo-3.png` med hela serien E (spelarnas tre första kort, dealerns öppna kort, hålkortet, vändningen, två extrakort och väntan), och det äldre `spelaren-redo.png` med sina 14 klipp. Ur Plats 7: ankaret `plats-7-redo.png` och en godkänd cykel till plats 4, på den gamla geometrin.
- Registret (`content/register.db`): posterna med öga, sko och landningsplats, omdömenas historik, beställningarna med kostnad, uppladdningarna, mätningarna och det som har lämnat registret. Vägen dit är `npm run reg` (`npm run reg -- hjälp`); reglerna står i [AGENTS.md](../AGENTS.md).
- Servern (`src/server`): svarar bara på localhost och startar om sig själv när dess kod ändras. `npm start` och `npm stop` ([README.md](../README.md)).
- Spelkärnan (`src/engine`): förd över ur gamla Dealer med sju testfiler; ursprung och avvikelser står i `src/engine/provenance.json`.
- Prov: `npm test`, `npm run typecheck`, och `npm run reg -- check` för `assets/` mot registret.
- Mallen för en ny dealer: dealerns fil (`content/dealers/<id>.json`), `src/pipeline/identitet.ts` och `ankare.ts` (från en bild av en person till identitetsbilder och ett REDO-ankare), och Labbets steg Dealer, som visar var en dealer står och nästa kommando. Torrprovad utan betald generering; inte körd på riktigt för en andra dealer.
- Klippens fart i uppspelningen (`speed.clips` i `content/runda.json`, reglage i steget Kortplan), och ett statiskt bygge av det riktiga Casinot (`npm run build:statisk`), utlagt på Vercel bakom Jakobs inloggning (hur: [decisions.md](decisions.md), Tekniken). Det läggs ut på nytt när serien ändras. Labbet finns bara på datorn.

## Finns inte än

- Dockan levande i Labbet. Hon syns där som sin film bredvid varje tagning (steget Klipp), inte som en figur man kan vrida på, ställa om eller låta göra en annan rörelse. En tagning och en ny dealer görs med kommandon i terminalen ([production.md](production.md)), och beställningen lägger agenten (Näst, punkt 2).
- En dealer som håller när kameran dras runt, med mjuka övergångar mellan vinklar: en 3D-figur som bär filmerna (Näst, punkt 4).
- En serie med två händer. Dockan klarar plats 1–4; vid plats 5–7 och dealerns kort går händerna för nära varandra eller skon, och kortet ska vändas lågt och bäras plant (`output/work/tva-hander/rapport.md`, `output/work/granskning-e-3/omdome.json`).
- Serier ur andra vyer. Ankaret ur Plats 7 är gjort på den gamla geometrin och görs om först.
- Det som händer mellan givarna: samla in kort, betala ut, marker.
- De lokala stegen för ett ankare (krympa händer, platta det gröna) som kod i `src/pipeline`. De ligger som skript i `output/work/giv-4/`.
- Labbets steg Spela.
- Ett lager för media utanför datorn. `assets/`, `glb/` och `output/` ligger utanför Git och finns bara här. Det som inte går att göra om (`assets/`, `glb/`, `output/tagningar/` och `output/work/arkiv/`) har en kopia på datorns andra skiva, `D:\3d-dealer-kopia`, gjord för hand 2026-11-19 och jämförd med källan; den förnyas inte av sig själv (`robocopy <mapp> D:\3d-dealer-kopia\<mapp> /E` för var och en). Dockans film för varje tagning ligger i tagningens paket (`output/tagningar/<id>/referens.mp4`).

## Omdömen

Agenten dömer efter oberoende granskning, och Jakob ändrar det han vill i Labbet: http://localhost:5310/lab/#granska. Rörelsens naturlighet dömer Jakob själv, på provklipp, innan en serie beställs. Läget frågas ur registret:

- antal per grupp och status: `npm run reg -- summary`;
- det som väntar: `npm run reg -- queue`, och `npm run reg -- list <grupp> "granska igen"`;
- det produktionslinjen inte använder, och vad som föreslås för var och en: `npm run reg -- unused`;
- det som lämnades utanför, arkiverades eller togs bort, med hela posten: `npm run reg -- show <fil>` (arkiverade filer ligger i `output/work/arkiv/`).

Granskarnas omdömen om serien E ligger i `output/work/granskning-e-1/`, `-2/` och `-3/` (`omdome.json`), med mätfelen de fann. Tvåhandsprovet står som `att granska`: Jakob dömer rörelsen.

Tre bakgrunder och fyra material har `utgår` och tas bort vid nästa arbetspass, om Jakob inte har ändrat omdömet. Identitetsbilden `original-sida-kavaj.png` har också `utgår` men står kvar så länge en annan post pekar på den som sin källa.

## Näst

1. Jakob ser serien E i Labbets steg Klipp och säger vad som inte är naturligt, klipp för klipp; anmärkningarna blir krav på dockan. När han har sett den arkiveras de 14 äldre klippen och provklippen A–D, de ankare som då inte används tas bort, och rörelserna `cykel-nyp-lugn` och `cykel-nyp-flytande`, som ingen serie använder, tas bort ur `content/moves/`. De klipp i E som filmades före nattens huvudrörelse kan tas om, så att serien blir jämn i början (granskaren, omgång 3).
2. Dockan levande i Labbet (Jakob 2026-11-19 frågar efter "ett laboratorium där jag kan se den här dockan och prova att skapa nya klipp eller en ny typ av dealer"): ett steg där dockan gör en vald rörelse till en vald plats i scenen, med kameran fri och rörelsens värden (`content/moves/`) som reglage, och där en tagning förbereds till ett paket. Scenen ritar redan dockan (`src/lab/shoot.ts`); det som saknas är valet i Labbet. Beställningen går fortfarande genom agenten, eftersom Runway nås genom MCP-servern och inte med nycklar. Inga krediter.
3. Två händer: Jakob ser provklippet bredvid E och väljer. En serie med två händer kostar ungefär som serien E. Jakob har föreslagit att flera rörelsemönster godkänns bredvid varandra ("Kanske ska vi godkänna flera rörelsemönster"): alla klipp ur samma ankare kedjas fritt, men rundan väljer i dag den senaste godkända tagningen per kort. Att den väljer bland flera är inte byggt.
4. Filmen på dockan, det första steget mot en dealer som håller när kameran dras runt (Jakobs ursprungliga tanke, [decisions.md](decisions.md), Projektet). Ett prov utan krediter på ett klipp som finns: filmen projiceras från klippets öga (registrets `eye`) på den rörliga dockan, som rör sig som filmen ruta för ruta, och kameran flyttas några tiotal grader. Sedan en film från vänster och en från höger ur samma docka, som tonar över i varandra efter kamerans vinkel, och Meshy-figuren av henne (`glb/paow/`, riggen saknar fingerleder) passad till dockans skelett som bärare med hennes form. Inget av det är prövat; risken är kanterna där dockans form inte är hennes.
5. Mätfelen som granskarna har pekat ut (`output/work/granskning-e-2/omdome.json`, "matten") rättas i `src/pipeline/matning.ts` och `rorelse.ts`, och fasmåtten får en form som gäller en tvåhandsgiv.
6. Mallen prövas med en andra dealer ur en enda bild, och ankarets steg för lagning vid givhanden läggs till i `ankare.ts`.
7. Mätningen för sidovyer, och ett nytt ankare och en serie ur Plats 7 på den nya geometrin.
8. Labbets steg Spela, och det som händer mellan givarna.

## Öppet

- Om GitHub-arkivet ska vara publikt. Där ligger privata samtal, uppgifter om Runway-kontot och en värdering av Scout Gaming, och spelkärnan är kopierad ur Scoutgaming. Ingenting pushas utan Jakobs ord; `git status -sb` säger om lokala `main` ligger före `origin/main`. Allt till och med natten 2026-11-19 ligger där, pushat från den här datorn samma förmiddag.
- Krediterna: kontot delas med Codex arbete i gamla Dealer. Ett klipp på 3 s kostar 64 krediter (mätt), så en hel serie ur en vy kostar 1 749 utan omtagningar. Serien E kostade 2 218: 34 tagningar för 27 klipp, 28 godkända (16 av 22 i de två första omgångarna, 12 av 12 i den tredje). En dealer ur en vy, med identitet och ankare: cirka 2 400 (identitetens cirka 150 är uppskattade, ankarets cirka 30 mätta).
- Kortplanens tal och kortens storlek: valda av agenten, ställbara av Jakob i Labbets steg Kortplan.
- Skon: bakkanten vilar på bordets trälist, eftersom filten bakom korten är smalare än skon. Från filmens egen vy visas filmens sko, som saknar scenskons mässingsram.
- Den verkliga dealern är mätt ur en film som är någon annans (`output/work/verklig-dealer/rapport.md`): bara tal lämnar den, inga rutor. Mer referensfilm som skulle hjälpa står sist i rapporten.
- Om `dealers/paulina/anchors/vila.png`, det sista ankaret i gamla rutan, ska stå kvar: skons passning i `content/scene.json` och dealerns kropp i `src/scene/geometry.test.ts` är mätta i den. Ingen kod läser filen.
- Om nyp eller släp blir Paulinas grepp. Cykeln här är nyp.
- Om Spelarens avstånd (`player` i `content/scene.json`) är rätt. Det är valt av agenten efter Jakobs ord om att bord och dealer ska skjutas samman. Som jämförelse står local-studios öga 1,48 m över golvet, cirka 0,68 m över filten (vårt: 0,60).
- Om bordsmodellens skala stämmer. local-studios bord är 297,0 × 141,8 × 84,5 cm; vårt är 2,10 m långt (`table.model` i `content/scene.json`).
- Att spelkärnan följer Scoutgamings kod token för token är gamla Dealers uppgift. Jämförelsen är inte körd om här.

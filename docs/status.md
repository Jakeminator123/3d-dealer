# Läget

Senast ändrad 2026-11-19, kväll. Ersätt det som inte längre gäller. Antal och listor står inte här: fråga registret.

## Var vi står

Serien ur vyn Spelaren är gjord med cykeln E (`cykel-nyp-rask`, 3,0 s, ankaret `spelaren-redo-3.png`), ritad efter en mätt verklig dealer: ett klipp till varje kort i en runda, godkända av oberoende granskare i tre omgångar. Standardrundan har alla sju platserna (`content/runda.json`) och spelas helt med dealerns klipp; `node src/pipeline/runda.ts paulina spelaren --plan` säger vilka. Jakob har inte dömt serien med ögat än; han har sagt att hon fortfarande är lite stel, och att kortet "svävar framför handen". Den äldre serien och provklippen före E är arkiverade. Dealern är en film per vy: en figur som håller när kameran dras runt är inte byggd (Näst, punkt 5).

2026-11-19 prövades tre vägar till en mänskligare rörelse. Allt nedan är mätt; om hon ser mänskligare ut dömer Jakob.

- **Ett färdigt klipp som referens** (två prov, `output/work/referensprov/`): Kling kopierar klippet nästan ruta för ruta vad texten än säger, och det gröna mörknar för varje generation, så första och sista rutan klarar inte gränsen mot REDO. Receptet används inte.
- **Ingen referensfilm** (`output/work/friprov/`): i en fri cykel gör modellen en egen rörelse, kortet landar rätt, och första och sista rutan ligger strax under gränsen mot REDO. Två kort i en tagning landar båda rätt, men bitarna kedjar bara i den ordning de filmades. En friare modell (Seedance) med klippet som lös referens kopierade klippet.
- **Rörelsefångst ur film** (`output/work/mansklig-docka/`, `rapport.md` och `prov-a/resultat.md`): MediaPipe Holistic på två egna klipp klarade inte gränserna som sattes före mätningen. Handen tappas i nypet vid skon, och djupet går inte att få ur en kamera framifrån; kropp, armar och den bärande handen följer med.

## Finns

- Produktionslinjen, körd för en hel serie: dockans cykel → REDO-ankare på grönt → Kling 4 → mätning och oberoende granskning → följd i scenen. Se [production.md](production.md).
- Dockan (`src/scene/doll.ts`, `dollPose.ts`, `content/doll.json`, `content/moves/`): cykeln REDO → kortet lagt → REDO för plats 1–7 och kort 0–2, och dealerns öppna kort, hålkort, vändning och extrakort. Hon andas, leder med blick och bål, och står aldrig frusen. Måtten på dynamiken: `src/pipeline/rorelse.ts`.
- Tagningens väg (`src/pipeline/tagning.ts`, `matning.ts`, `foljd.ts`, `content/tagning.json`): `forbered`, `ta-emot` och `mät-om`, med mått mot gränsvärden och bevis i scenen. `forbered` kan också ta ett klipp som referens, ingen referens alls, eller flera kort i en tagning ([production.md](production.md#filmen)).
- Spelkärnan driver uppspelningen (`src/scene/round.ts`, `reel.ts`, `src/server/game.ts`): varje utdelat kort väljer sitt klipp, och kort utan klipp läggs utan dealerns rörelse. Casinot (http://localhost:5310/casino/) spelar en runda mot spelkärnan, och `runda.ts` sparar en runda med frö som film.
- Scenen (`src/scene`, `content/scene.json`): bord, sko på bordet, kortplanen som båge, rum med golv; vyerna Spelaren, Plats 1–7 och närbilden av var och en. Kortet visar sin valör från vändningen, och korten och handen skuggar filten.
- Labbet (http://localhost:5310/lab/), det enda stället att granska på, omgjort 2026-11-19. Översikt är startsidan: vad som väntar på Jakob, vad som väntar på agenten och var varje dealer står. Stegen: Scen (hela given), Kortplan (bågen, dealerns rad och kortens storlek med reglage), Dealer (kartan över vad en spelbar dealer kräver och vad som finns), Dockan (dockan levande: rörelse, plats, kort och handling; uppspelning och fri kamera; rörelsens värden som reglage; spara som ny rörelse; mått; förbered tagning), Klipp (varje tagning mot sin referens, med omdöme, Jakobs ord, mått och beställning, också de arkiverade), Granska (registret) och Spela (Casinot). Korten heter C1–C3 och ankarna har koder bredvid orden ([architecture.md](architecture.md#orden)). Ingenting beställs från Labbet: en förberedd tagning väntar på agenten.
- Paulina ur Spelaren: ankaret `spelaren-redo-3.png` med hela serien E. Ur Plats 7: ankaret `plats-7-redo.png` och en godkänd cykel till plats 4, på den gamla geometrin.
- Registret (`content/register.db`): posterna med öga, sko och landningsplats, omdömenas historik, beställningarna med kostnad, uppladdningarna, mätningarna och det som har lämnat registret. Vägen dit är `npm run reg` (`npm run reg -- hjälp`); reglerna står i [AGENTS.md](../AGENTS.md).
- Servern (`src/server`): svarar bara på localhost och startar om sig själv när dess kod ändras. `npm start` och `npm stop` ([README.md](../README.md)).
- Spelkärnan (`src/engine`): förd över ur gamla Dealer med sju testfiler; ursprung och avvikelser står i `src/engine/provenance.json`.
- Prov: `npm test`, `npm run typecheck`, och `npm run reg -- check` för `assets/` mot registret.
- Mallen för en ny dealer: dealerns fil (`content/dealers/<id>.json`), `src/pipeline/identitet.ts` och `ankare.ts` (från en bild av en person till identitetsbilder och ett REDO-ankare), och Labbets steg Dealer, som visar var en dealer står och nästa kommando. Torrprovad utan betald generering; inte körd på riktigt för en andra dealer.
- Klippens fart i uppspelningen (`speed.clips` i `content/runda.json`, reglage i steget Kortplan), och ett statiskt bygge av det riktiga Casinot (`npm run build:statisk`), utlagt på Vercel bakom Jakobs inloggning (hur: [decisions.md](decisions.md), Tekniken). Det läggs ut på nytt när serien ändras. Labbet finns bara på datorn.

## Finns inte än

- En docka som rör sig som en människa. Mätt på dockan: den vilande handen rör sig inte, handen står för länge vid skon, och varje kort ger samma rörelse i bålen (`output/work/mansklig-docka/rapport.md`). Kling kopierar dockans dynamik, så felen följer med in i filmen.
- Ett grepp där kortet sitter mellan tumme och fingrar genom hela vändningen. I dag ritas det framför handen.
- En dealer som håller när kameran dras runt, med mjuka övergångar mellan vinklar: en 3D-figur som bär filmerna (Näst, punkt 5).
- En serie med två händer. Dockan klarar plats 1–4; vid plats 5–7 och dealerns kort går händerna för nära varandra eller skon, och kortet ska vändas lågt och bäras plant (`output/work/tva-hander/rapport.md`, `output/work/granskning-e-3/omdome.json`).
- Serier ur andra vyer. Ankaret ur Plats 7 är gjort på den gamla geometrin och görs om först.
- Det som händer mellan givarna: samla in kort, betala ut, marker.
- De lokala stegen för ett ankare (krympa händer, platta det gröna) som kod i `src/pipeline`. De ligger som skript i `output/work/giv-4/`.
- Ett lager för media utanför datorn. `assets/`, `glb/` och `output/` ligger utanför Git och finns bara här. Det som inte går att göra om (`assets/`, `glb/`, `output/tagningar/` och `output/work/arkiv/`) har en kopia på datorns andra skiva, `D:\3d-dealer-kopia`, gjord för hand 2026-11-19 på förmiddagen och jämförd med källan; den förnyas inte av sig själv (`robocopy <mapp> D:\3d-dealer-kopia\<mapp> /E` för var och en), och dagens provklipp och arkiveringar finns inte i den.

## Omdömen

Agenten dömer efter oberoende granskning, och Jakob ändrar det han vill i Labbet: http://localhost:5310/lab/#granska. Rörelsens naturlighet dömer Jakob själv, på provklipp, innan en serie beställs. Läget frågas ur registret:

- antal per grupp och status: `npm run reg -- summary`;
- det som väntar: `npm run reg -- queue`, och `npm run reg -- list <grupp> "granska igen"`;
- det produktionslinjen inte använder, och vad som föreslås för var och en: `npm run reg -- unused`;
- det som lämnades utanför, arkiverades eller togs bort, med hela posten: `npm run reg -- show <fil>` (arkiverade filer ligger i `output/work/arkiv/`).

Granskarnas omdömen om serien E ligger i `output/work/granskning-e-1/`, `-2/` och `-3/` (`omdome.json`), med mätfelen de fann. Tvåhandsprovet och dagens provklipp (varianterna `klippref`, `redigerad`, `fri`, följden och Seedance-provet) står som `att granska`: Jakob dömer rörelsen, och rundan spelar dem inte.

Identitetsbilden `original-sida-kavaj.png` har `utgår` men står kvar så länge en annan post pekar på den som sin källa. De äldre ankarna, som ingen serie längre använder, är godkända och står kvar tills de är dömda.

## Näst

1. Jakob ser i Labbets steg Klipp på serien E, tvåhandsprovet och dagens provklipp, och säger vad som är naturligt och vad som inte är det. Hans öga väljer väg: fri rörelse utan referensfilm, eller en bättre docka som referens. I steget Dockan kan han se rörelserna `cykel-nyp-lugn` och `cykel-nyp-flytande`, som ingen serie använder; de tas bort ur `content/moves/` när han har sett dem.
2. Om den fria rörelsen är bättre: en lång tagning till alla sju platserna med REDO mellan givarna (Jakobs förslag; 15 s kostar 260–320 krediter och väntar på hans ja), eller fria cykler till ytterlägena. Det som måste lösas är skarven mot REDO (text, omtagning eller en kort lokal övergång) och att en följd bara kedjar i filmad ordning, vilket passar ett fullsatt bord men inte en ensam plats i Casinot.
3. En mänskligare docka (`output/work/mansklig-docka/rapport.md`): den vilande handen, pausen vid skon, en bål i två delar och skuldran; greppet med tummen på kortets ena sida och fingrarna på den andra; och rörelsefångst ur en film som Jakob gör med två mobiler (instruktionen står i rapportens avsnitt 4). Väntar på Jakob: filmen, ja eller nej till paketet `@mediapipe/tasks-vision`, och åtkomsten till SAM 3D Body, som han ordnar.
4. Två händer: Jakob ser provklippet bredvid E och väljer. En serie med två händer kostar ungefär som serien E. Gamla Dealers tvåhandsgiv till alla åtta kort (`dealer3d/src/two-hand.ts` där) kan kopieras in med ursprung när han har valt. Jakob har föreslagit att flera rörelsemönster godkänns bredvid varandra; rundan väljer i dag den senaste godkända tagningen per kort, och att den väljer bland flera är inte byggt.
5. Filmen på dockan, det första steget mot en dealer som håller när kameran dras runt (Jakobs ursprungliga tanke, [decisions.md](decisions.md), Projektet). Ett prov utan krediter på ett klipp som finns: filmen projiceras från klippets öga (registrets `eye`) på den rörliga dockan, och kameran flyttas några tiotal grader. Sedan en film från vänster och en från höger som tonar över i varandra, och Meshy-figuren av henne (`glb/paow/`, riggen saknar fingerleder) som bärare. Inget av det är prövat.
6. Mätfelen som granskarna har pekat ut (`output/work/granskning-e-2/omdome.json`, "matten") rättas i `src/pipeline/matning.ts` och `rorelse.ts`, och fasmåtten får en form som gäller en tvåhandsgiv.
7. Mallen prövas med en andra dealer ur en enda bild, som Jakob ger, och ankarets steg för lagning vid givhanden läggs till i `ankare.ts`. Agentens förslag är att vänta tills rörelsen sitter, eftersom en ny dealer ärver dockan.
8. Mätningen för sidovyer, och ett nytt ankare och en serie ur Plats 7 på den nya geometrin.
9. Det som händer mellan givarna.
10. Smått i Labbet: `tagning.ts` exporterar de prov av dockan som `forbered` gör (servern upprepar dem i `src/server/rorelser.ts`), och en förberedelse som pågår överlever en omstart av servern.

## Öppet

- Om GitHub-arkivet ska vara publikt. Där ligger privata samtal, uppgifter om Runway-kontot och en värdering av Scout Gaming, och spelkärnan är kopierad ur Scoutgaming. Jakob 2026-11-19: det får vara publikt tills vidare. Ingenting pushas utan Jakobs ord; `git status -sb` säger om lokala `main` ligger före `origin/main`.
- Krediterna: kontot delas med Codex arbete i gamla Dealer. Ett klipp på 3 s med Kling 4 i 1080p kostar 64–65 krediter med referensfilm och 54 utan (mätt). Serien E kostade 2 218, och proven 2026-11-19 kostade 337. En dealer ur en vy, med identitet och ankare: cirka 2 400 (identitetens cirka 150 är uppskattade, ankarets cirka 30 mätta). Om projektet ska ha en egen ram per dag har Jakob inte svarat på.
- Ett lager för media utanför datorn: agentens förslag är en privat hink där filerna ligger efter registrets sha256. Det kräver ett konto som Jakob väljer.
- Kortplanens tal och kortens storlek: valda av agenten, ställbara av Jakob i Labbets steg Kortplan.
- Skon: bakkanten vilar på bordets trälist, eftersom filten bakom korten är smalare än skon. Från filmens egen vy visas filmens sko, som saknar scenskons mässingsram.
- Den verkliga dealern är mätt ur en film som är någon annans (`output/work/verklig-dealer/rapport.md`): bara tal lämnar den, inga rutor.
- Om `dealers/paulina/anchors/vila.png`, det sista ankaret i gamla rutan, ska stå kvar: skons passning i `content/scene.json` och dealerns kropp i `src/scene/geometry.test.ts` är mätta i den. Ingen kod läser filen.
- Om nyp eller släp blir Paulinas grepp. Cykeln här är nyp.
- Om Spelarens avstånd (`player` i `content/scene.json`) är rätt. Det är valt av agenten efter Jakobs ord om att bord och dealer ska skjutas samman. Som jämförelse står local-studios öga 1,48 m över golvet, cirka 0,68 m över filten (vårt: 0,60).
- Om bordsmodellens skala stämmer. local-studios bord är 297,0 × 141,8 × 84,5 cm; vårt är 2,10 m långt (`table.model` i `content/scene.json`).
- Att spelkärnan följer Scoutgamings kod token för token är gamla Dealers uppgift. Jämförelsen är inte körd om här.

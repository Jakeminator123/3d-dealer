# Läget

Senast ändrad 2026-11-19, kväll. Ersätt det som inte längre gäller. Antal och listor står inte här: fråga registret.

## Var vi står

Serien ur vyn Spelaren är gjord med cykeln E (`cykel-nyp-rask`, 3,0 s, ankaret `spelaren-redo-3.png`), ritad efter en mätt verklig dealer: ett klipp till varje kort i en runda, godkända av oberoende granskare i tre omgångar. Standardrundan har alla sju platserna (`content/runda.json`) och spelas helt med dealerns klipp; `node src/pipeline/runda.ts paulina spelaren --plan` säger vilka. Jakob har inte dömt serien med ögat än; han har sagt att hon fortfarande är lite stel, och att kortet "svävar framför handen". Den äldre serien och provklippen före E är arkiverade. Dealern är en film per vy: en figur som håller när kameran dras runt är inte byggd (Näst, punkt 5).

2026-11-19 prövades tre vägar till en mänskligare rörelse. Allt nedan är mätt; om hon ser mänskligare ut dömer Jakob.

- **Ett färdigt klipp som referens** (två prov, `output/work/referensprov/`): Kling kopierar klippet nästan ruta för ruta vad texten än säger, och det gröna mörknar för varje generation, så första och sista rutan klarar inte gränsen mot REDO. Receptet används inte.
- **Ingen referensfilm** (`output/work/friprov/`): i en fri cykel gör modellen en egen rörelse, kortet landar rätt, och första och sista rutan ligger strax under gränsen mot REDO. Två kort i en tagning landar båda rätt, men bitarna kedjar bara i den ordning de filmades. En friare modell (Seedance) med klippet som lös referens kopierade klippet. Jakob samma dag: den fria cykeln är "faktiskt mycket bra" och följden "mycket bra", men den vilande högerarmen är fixerad och kanske i onaturlig vinkel. En text som låter armen leva får handen att röra sig, men vinkeln sitter i ankaret, och det provet blev sämre i övrigt (kortet vänds sent, det gröna glider).
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

Granskarnas omdömen om serien E ligger i `output/work/granskning-e-1/`, `-2/` och `-3/` (`omdome.json`), med mätfelen de fann. Tvåhandsprovet, de fria provklippen (`fri`, följden och `fri-arm`) och ankarvarianterna står som `att granska`: Jakob dömer rörelsen och ställningen, och rundan spelar dem inte. Provklippen `klippref`, `redigerad` och Seedance-provet och ankarvarianten `a2-3` fick `utgår` 2026-11-19 och tas bort vid nästa arbetspass, om Jakob inte har ändrat omdömet.

Identitetsbilden `original-sida-kavaj.png` har `utgår` men står kvar så länge en annan post pekar på den som sin källa. De äldre ankarna, som ingen serie längre använder, är godkända och står kvar tills de är dömda.

## Näst

Arbetet går i två spår, så att två chattar kan arbeta samtidigt utan att röra samma filer (Jakob 2026-11-19: "samla hela projektet lite så vi inte spretar"). Varje chatt committar bara sina egna filer, med sökvägar och aldrig `git add -A`, skriver om sitt eget stycke här, och skriver i registret bara genom `npm run reg`. Det som inte står i ett spår väntar.

### Spåret Filmen

Målet: Paulina spelbar ur Spelaren med den fria rörelsen. Filerna: `src/pipeline/tagning.ts`, `ankare.ts`, `foljd.ts`, `vila.ts`, `matning.ts` och `rorelse.ts`, `content/tagning.json`, `content/ankare.json`, `content/dealers/`, `assets/dealers/`, och Runways krediter.

1. Hela bordet i en tagning (Jakobs förslag): plats 1–7 och dealerns öppna kort, med REDO mellan givarna, ur dagens ankare A2.1 och utan referensfilm. 16 s kostar cirka 280 krediter (17–18 per sekund, mätt på två prov) och väntar på Jakobs ja. Mätt i provet med två kort: båda landar rätt, bitarna kedjar bara i filmad ordning, och kortet bars framför handen.
2. Ankaret. Jakob om varianterna (`output/work/friprov/ankare-varianter.jpg`): `arm-a` och `arm-b` är inte bättre; tvåhandsställningarna `a2-3` och `a2-3-b` är "okej" men har för mycket skugga vid hennes högerarm, och förebilden ur gamla Dealer har annat grönt och annat perspektiv (den är gjord i gamla Dealers kamera: 1,11 m över filten och lutad 25 grader, mot 0,60 m och 15 grader här). Ett A2.3 görs därför på riktigt genom vår kamera: dockans tvåhandsställning som underlag och hela ankarets väg med de lokala stegen (händernas storlek, kortet, det gröna, inga skuggor), cirka 30 krediter. Det väntar på dockan: hon har ingen REDO i tvåhandsställningen (`cykel-tva-hander` börjar i samma REDO som enhandsgiven, och vid ingen tid ligger vänsterhanden vid kortet i mynningen och högerhanden på filten intill skon samtidigt; rutorna står i `output/work/friprov/kopior/tvahand-tider.jpg`). Ställningen hör till spåret Figuren, och sedan behöver `ankare.ts förbered` ett val av rörelse: i dag tar den alltid `cykel-nyp` ur `content/ankare.json`. Jakob väljer sedan mellan A2.1 och A2.3 på en fri cykel ur var och en; han är osäker på om två händer blir för många rörelser. Ett nytt REDO betyder att alla klipp görs ur det, eftersom klipp ur olika ankare inte kedjas.
3. Fria cykler till ytterlägena (plats 1, plats 7, dealerns kort, hålkortet och vändningen), cirka 54 krediter styck, och sedan en hel fri serie med ett klipp per kort (cirka 1 460 krediter, på Jakobs ja). Enskilda klipp behövs för en ensam plats i Casinot. Det som måste lösas: greppet (tummen på kortets ena sida och fingrarna på den andra), den vilande högerarmen, som Jakob finner stel, och skarven mot REDO (text, omtagning eller en kort lokal övergång).
4. Spelet spelar en följd: rundan väljer i dag ett klipp per kort (`src/scene/round.ts`), och ett klipp med flera kort saknar plats och kort i registret.
5. Mätfelen som granskarna har pekat ut (`output/work/granskning-e-2/omdome.json`, "matten") rättas i `src/pipeline/matning.ts` och `rorelse.ts`.
### Spåret Figuren

Målet: Paulinas kropp och rörelse i 3D, så att samma naturliga giv går att visa ur vilken vy som helst. Filerna: `src/scene/doll.ts`, `dollPose.ts`, `content/doll.json`, `content/moves/`, nya filer i `src/pipeline` för fångsten, `glb/` och `output/work/figur/`. Inga krediter utan att Jakob har sett kostnaden. Koden skrivs på grenen `figuren` i arbetsträdet `C:/Users/jakem/Desktop/3d-dealer-figur` ([decisions.md](decisions.md), Arbetssättet); media, registret, arbetsmaterialet och det här stycket ligger kvar i huvudmappen.

Det som finns att börja med:

- SAM 3D Body (Meta) är installerat av Jakob 2026-11-19 i `C:/Users/jakem/dev/sam-3d-body`, och fungerar på datorns grafikkort: en bild in, en 3D-kropp med händer ut, i kamerans koordinater. Hur det körs, vad det lämnar och vad som inte är prövat (film, export till 3D-fil) står i `PROJEKT-GUIDE.md` där. Mappen är ett eget projekt: det körs och läses, och ändras inte härifrån.
- Två kroppar ur SAM 3D Body ligger i `C:/Users/jakem/Desktop/body` (`keystone-hel` och `keystone-sittande`, var och en `person_0.glb`), gjorda ur identitetsbilderna `helkropp-staende.png` och `sittande-vid-bord.png`. Mätt: ett nät med 18 439 hörn och skelettet som lösa stavar; ingen rigg, ingen textur och ingen rörelse; den stående är 1,66 m lång. De är alltså hennes form och ställning, inte en färdig figur. Meshy-figuren i `glb/paow/` har textur men saknar fingerleder.
- Dagens fynd som spåret bygger på: en fri film utan referens rör sig naturligt (Jakob: "faktiskt mycket bra"), och Kling kopierar en referensfilm nästan ruta för ruta. MediaPipe klarade inte nypet eller djupet (`output/work/mansklig-docka/prov-a/resultat.md`), och utredningen om vad som gör dockan stel står i `output/work/mansklig-docka/rapport.md`.

1. Fångsten, utan krediter: SAM 3D Body körs ruta för ruta på den fria cykeln Jakob tyckte om (`dealers/paulina/clips/cykel-nyp-rask-fri-4-0_spelaren_t1.mp4`) och läggs i scenen genom klippets öga (registrets `eye`). Gränserna sätts före mätningen, de samma som för MediaPipe: handen inom 2 cm från sin plats i scenen, och fingrarna rätt i minst 90 % av rutorna i nypet.
2. Håller fångsten: dockan spelar den fångade rörelsen som en ny rörelse i `content/moves/`, synlig i Labbets steg Dockan ur alla vyer, och Jakob dömer den med ögat.
3. En REDO i tvåhandsställningen, det Jakob kallar A2.3: vänd mot skon, vänsterhanden vid kortet i mynningen och högerhanden på filten intill skon. Spåret Filmen väntar på den för att göra ankaret.
4. Dockans mått passas mot hennes kropp ur den stående och den sittande kroppen (axelbredd, armarnas längd, sitthöjd), i `content/doll.json`.
5. Samma giv ur en annan vy: dockans film ur Plats 7 som referens till Kling, med ett ankare ur den vyn. Betalt, och visas för Jakob först.
6. Filmen på figuren, det första steget mot en dealer som håller när kameran dras runt (Jakobs ursprungliga tanke, [decisions.md](decisions.md), Projektet): filmen projiceras från klippets öga på den rörliga kroppen, och kameran flyttas några tiotal grader. Inte prövat.

### Väntar

- En andra dealer ur 1–5 bilder genom mallen. En ny dealer ärver dockan och rörelsen, så den väntar tills Paulina sitter.
- Serier ur andra vyer än Spelaren, och ett nytt ankare ur Plats 7 på den nya geometrin.
- Det som händer mellan givarna: samla in kort, betala ut, marker.
- Rörelsefångst ur en film som Jakob gör själv (instruktionen står i `output/work/mansklig-docka/rapport.md`, avsnitt 4). Den behövs först om fångsten ur de fria klippen inte räcker.
- Rörelserna `cykel-nyp-lugn` och `cykel-nyp-flytande`, som ingen serie använder, tas bort ur `content/moves/` när Jakob har sett dem i steget Dockan.
- Smått i Labbet: `tagning.ts` exporterar de prov av dockan som `forbered` gör (servern upprepar dem i `src/server/rorelser.ts`), och en förberedelse som pågår överlever en omstart av servern.

## Öppet

- Om GitHub-arkivet ska vara publikt. Där ligger privata samtal, uppgifter om Runway-kontot och en värdering av Scout Gaming, och spelkärnan är kopierad ur Scoutgaming. Jakob 2026-11-19: det får vara publikt tills vidare. Ingenting pushas utan Jakobs ord; `git status -sb` säger om lokala `main` ligger före `origin/main`.
- Krediterna: kontot delas med Codex arbete i gamla Dealer. Ett klipp på 3 s med Kling 4 i 1080p kostar 64–65 krediter med referensfilm och 54 utan (mätt). Serien E kostade 2 218, och proven 2026-11-19 kostade 471 (saldot 4 704 efter dem). En ankarvariant kostar 20. En dealer ur en vy, med identitet och ankare: cirka 2 400 (identitetens cirka 150 är uppskattade, ankarets cirka 30 mätta). Om projektet ska ha en egen ram per dag har Jakob inte svarat på.
- Ett lager för media utanför datorn: agentens förslag är en privat hink där filerna ligger efter registrets sha256. Det kräver ett konto som Jakob väljer.
- Kortplanens tal och kortens storlek: valda av agenten, ställbara av Jakob i Labbets steg Kortplan.
- Skon: bakkanten vilar på bordets trälist, eftersom filten bakom korten är smalare än skon. Från filmens egen vy visas filmens sko, som saknar scenskons mässingsram.
- Den verkliga dealern är mätt ur en film som är någon annans (`output/work/verklig-dealer/rapport.md`): bara tal lämnar den, inga rutor.
- Om `dealers/paulina/anchors/vila.png`, det sista ankaret i gamla rutan, ska stå kvar: skons passning i `content/scene.json` och dealerns kropp i `src/scene/geometry.test.ts` är mätta i den. Ingen kod läser filen.
- Om nyp eller släp blir Paulinas grepp. Cykeln här är nyp.
- Om Spelarens avstånd (`player` i `content/scene.json`) är rätt. Det är valt av agenten efter Jakobs ord om att bord och dealer ska skjutas samman. Som jämförelse står local-studios öga 1,48 m över golvet, cirka 0,68 m över filten (vårt: 0,60).
- Om bordsmodellens skala stämmer. local-studios bord är 297,0 × 141,8 × 84,5 cm; vårt är 2,10 m långt (`table.model` i `content/scene.json`).
- Att spelkärnan följer Scoutgamings kod token för token är gamla Dealers uppgift. Jämförelsen är inte körd om här.

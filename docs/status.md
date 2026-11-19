# Läget

Senast ändrad 2026-11-19, kväll. Ersätt det som inte längre gäller. Antal och listor står inte här: fråga registret.

## Var vi står

Serien ur vyn Spelaren är gjord med cykeln E (`cykel-nyp-rask`, 3,0 s, ankaret `spelaren-redo-3.png`), ritad efter en mätt verklig dealer: ett klipp till varje kort i en runda, godkända av oberoende granskare i tre omgångar. Standardrundan har alla sju platserna (`content/runda.json`) och spelas helt med dealerns klipp; `node src/pipeline/runda.ts paulina spelaren --plan` säger vilka. Jakob har inte dömt serien med ögat än; han har sagt att hon fortfarande är lite stel, och att kortet "svävar framför handen". Den äldre serien och provklippen före E är arkiverade. Dealern är en film per vy: en figur som håller när kameran dras runt är inte byggd (Näst, punkt 5).

2026-11-19 prövades tre vägar till en mänskligare rörelse. Allt nedan är mätt; om hon ser mänskligare ut dömer Jakob.

- **Ett färdigt klipp som referens** (två prov, `output/work/referensprov/`): Kling kopierar klippet nästan ruta för ruta vad texten än säger, och det gröna mörknar för varje generation, så första och sista rutan klarar inte gränsen mot REDO. Receptet används inte.
- **Ingen referensfilm** (`output/work/friprov/`): i en fri cykel gör modellen en egen rörelse, kortet landar rätt, och första och sista rutan ligger strax under gränsen mot REDO. Två kort i en tagning landar båda rätt, men bitarna kedjar bara i den ordning de filmades. En friare modell (Seedance) med klippet som lös referens kopierade klippet. Jakob samma dag: den fria cykeln är "faktiskt mycket bra" och följden "mycket bra", men den vilande högerarmen är fixerad och kanske i onaturlig vinkel. En text som låter armen leva får handen att röra sig, men vinkeln sitter i ankaret, och det provet blev sämre i övrigt (kortet vänds sent, det gröna glider).
- **Rörelsefångst ur film** (`output/work/mansklig-docka/`, `rapport.md` och `prov-a/resultat.md`): MediaPipe Holistic på två egna klipp klarade inte gränserna som sattes före mätningen. Handen tappas i nypet vid skon, och djupet går inte att få ur en kamera framifrån; kropp, armar och den bärande handen följer med.
- **SAM 3D Body på den fria cykeln** (`output/work/figur/fangst-1/`, `resultat.md` och `granskning/dom.json`): klarade ingen av gränserna. Nätet följer henne i bild och kroppens mått håller mellan rutorna, men handen som når fram får fel djup (den hamnar under filten) och fingrarna i nypet ligger fel. Brännvidden som verktyget självt skattar hoppar mellan rutorna: klippets öga ur registret används. Samma fångst passad mot scenens villkor (`output/work/figur/fangst-2/`) ger en rörelse som dockan spelar ur alla vyer: handens och kortets väg håller, fingrarna i nypet inte.

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

Läget 2026-11-19, kväll. Klippen ligger i tre steg, som Labbet sorterar efter ([architecture.md](architecture.md#orden)): steg 1 är dockans film, steg 2 prototypen som följer dockan (hela serien E; rätt kort och rörelser, inte naturlig), steg 3 slutfilmen med fri rörelse. Rundan spelar steg 3 där ett godkänt klipp finns och annars steg 2, och i steg 2 bara seriens rörelse (`series.move` i `content/runda.json`), så ett steg 2-klipp kan godkännas som referens utan att spelas. Jakob har godkänt den fria cykeln till plats 4, första kortet; den spelas där, och serien E till resten.

Prövat med film som referens: ingen modell som Runway når gör en naturligare film ur en onaturlig referens (`output/work/videoreferens/rapport.md`). Hela bordet i en tagning (16 s, åtta kort, 282 krediter) fann Jakob "extremt dålig": korten vändes framför henne och gled ut till platserna, och texten var för lång.

1. Receptet som håller (Jakob 2026-11-19: tvåkortsprovet är "skitbra"): hans korta, förklarande text, två händer, två kort i en tagning på 5 s med Kling 4, utan referensfilm, ur rena A2.1 (texterna `tvahand-2`, `tvahand-7-6`, `tvahand-5-4` och `tvahand-1-d` i `content/tagning.json`; 89 krediter per tagning). Längre tagningar håller inte: åtta kort på 16 s och sju kort på 18 s fick båda `utgår`. Hela bordet görs därför som fyra tagningar som fogas lokalt (`output/work/friprov/foljd-alla.mp4`, i scenen `foljd-alla-i-scenen.mp4`, mått i `foljd-alla-matt.json`): plats 7–6, 5–4, 3–2 och 1 med dealerns öppna kort. Mätt: alla åtta korten landar rätt, skarvarna mellan tagningarna ligger på 39–41 dB mot gränsen 33, och högerhanden tar kortet i tre av fyra tagningar. I tagningen 1–D gled kortet till plats 1 av sig självt med båda händerna vid kroppen; den tas om om Jakob vill gå vidare. Väntar på Jakobs dom på den fogade filmen.
2. Godkänner Jakob följden: omtagning av 1–D, sedan andra kortet till varje plats, hålkortet, vändningen och dealerns extrakort i samma recept, och att spelet kan spela en tagning med två kort (punkt 5). Kling 4:s rabatt slutar 2026-11-30; en tagning på 5 s går då från 89 till cirka 112 krediter (uppskattat ur 54 till 68 för 3 s).
3. Tre förslag ur utredningen om video som referens väntar på Jakobs val, inget är beställt: två fria klipp via en mellanbild där kortet just har lagts (hans A3P4; cirka 128 krediter), hans egen filmade giv som referens (cirka 65 krediter och en kvarts filmning; Kling kopierar referensen, så en mänsklig referens borde ge en mänsklig rörelse), och en öppen modell lokalt med ställbar styrka (inga krediter, cirka en dag).
4. Ankaret. Två händer ur dagens A2.1 gör den vilande högerarmen levande utan ny bild. Ett A2.3 genom vår kamera väntar på en tvåhands-REDO i dockan (spåret Figuren) och sedan på ett val av rörelse i `ankare.ts förbered`; varianterna `arm-a` och `arm-b` fann Jakob inte bättre.
5. Spelet spelar en följd: rundan väljer ett klipp per kort (`src/scene/round.ts`), och ett klipp med flera kort saknar plats och kort i registret. Väntans klipp (`waitClip`) följer inte regeln om steg än.
6. Mätfelen som granskarna har pekat ut (`output/work/granskning-e-2/omdome.json`, "matten") rättas i `src/pipeline/matning.ts` och `rorelse.ts`.

### Spåret Figuren

Målet: samma naturliga giv ur fler vyer än Spelaren. Filerna: `src/scene/doll.ts`, `dollPose.ts`, `content/doll.json`, `content/moves/`, `content/tagning-justerad.json` med `src/pipeline/justerat.ts`, nya filer i `src/pipeline` för fångsten, `glb/` och `output/work/figur/`. Inga krediter utan att Jakob har sett kostnaden. Arbetet görs i huvudmappen ([decisions.md](decisions.md), Arbetssättet).

Jakob 2026-11-19, efter dagens prov: arbetet ska vara enhetligt och inte spreta ("Vad ska vi ha allt till?"). Spåret har därför en fråga i taget, och den som gäller nu är punkt 1.

Underlaget:

- SAM 3D Body (Meta) är installerat av Jakob i `C:/Users/jakem/dev/sam-3d-body` och går på datorns grafikkort: en bild in, en 3D-kropp med händer ut, i kamerans koordinater. Hur det körs står i `PROJEKT-GUIDE.md` där. Mappen är ett eget projekt: det körs och läses, och ändras inte härifrån.
- Två kroppar ur SAM 3D Body ligger i `C:/Users/jakem/Desktop/body`, gjorda ur identitetsbilderna `helkropp-staende.png` och `sittande-vid-bord.png`: hennes form och ställning som nät, utan rigg, textur och rörelse. Meshy-figuren i `glb/paow/` har textur, men riggen slutar i handleden och har bara gång och löpning.

Prövat 2026-11-19, utan krediter, vart och ett i sin mapp under `output/work/figur/` med `resultat.md`:

- `fangst-1/`: SAM 3D Body ensamt höll inte gränserna (Var vi står).
- `fangst-2/`: samma fångst passad mot scenen. Lederna ligger på strålarna genom sina bildpunkter från klippets öga, handens djup tas ur kortets storlek i bild, och REDO, kortplatsen, filten och skon är villkor. Dockan spelar rörelsen till plats 4 utan kodändring (`fangst-2-plats-4.json`, inte införd i `content/moves/`). Greppet mot det lagda kortet håller gränsen på 2 cm; fingrarna i nypet gör det inte (dömt av en oberoende granskare, `granskning/dom.json`), eftersom greppet är cykeln E:s och inte hennes, och dockans arm är för kort: den sträcks till sin gräns där hennes är böjd.
- `vyprov/`: dockan, Meshy-figuren och dagens film ur Spelaren, Plats 1, Plats 4 och Plats 7. Dockan ritas ur alla vyer, och filmen är platt ur en annan vy än sin egen. Dockan lagd över filmen i samma vy sammanfaller med henne i händer, axlar och ansikte (`docka-over-film_spelaren.jpg`, sett och inte mätt): filmen är gjord genom scenens kamera.
- `jamforelse-paow/`: PAOW i gamla Dealer mot Paulina, läst på Jakobs ord (`jamforelse.md` och två filmer sida vid sida). Också hon är en platt film i en 3D-scen. Gamla Dealer har ett vinkelprov som tonar över mellan en film framifrån och en från sidan, där sidofilmen är gjord ur en färdig film med Runways `edit_video`.
- `tvahand-redo/`: dockans REDO i tvåhandsställningen, A2.3. `cykel-tva-hander` börjar och slutar i den; godkänd av en oberoende granskare efter en rättning (`granskning/omdome.md`). Underlaget till ankaret är `a23-redo-spelaren.png`. Att hon ser mot skon är justerat för cykeln i `content/tagning-justerad.json`; originalen i `content/tagning.json` står kvar ([production.md](production.md#filmen)). Spåret Filmens punkt 4 väntar alltså inte längre på dockan, utan på ett val av rörelse i `ankare.ts förbered`, och på hålkortet, vändningen och väntan ur samma REDO. Fem andra av rörelsens gränser faller för cykeln till plats 4 (`tvara`, `vagUt`, `paKortet`, `vagTillbaka`, `tillbakaMotUt`; Labbets steg Dockan, Mått): om det är fel i rörelsen eller gränser gjorda för en hand är inte utrett.

Näst, en sak i taget:

1. Jakob ser de två filmerna ur passningen och dömer om den fångade rörelsen lever där E är stel: `output/work/figur/fangst-2/film-spelaren-bredvid.mp4` (dockan bredvid originalet) och `film-plats-7-bredvid.mp4` (samma rörelse ur Plats 7 bredvid E).
2. Är den värd att gå vidare med: dockan får hennes mått (armarnas längd, sitthöjd; i fångsten är armarna 13–15 % längre än dockans, med fångstens egen skala) och ett grepp efter hennes hand, i `content/doll.json`; passningen görs om och blir ett steg i `src/pipeline` för handens och kortets väg. Det som saknas i dockan för mer än plats 4: ett spår för huvudets riktning, och att rörelsen följer med till andra platser.
3. Samma giv ur en annan vy, betalt och visat för Jakob först: dockans film ur Plats 7 som referens till Kling, med ett ankare ur den vyn; eller gamla Dealers väg, en sidofilm ur en färdig film med `edit_video`. Ett klipp och ett ankare räcker för att se om vägen håller.
4. Filmen på figuren, så att kameran kan flyttas några tiotal grader ([decisions.md](decisions.md), Projektet): filmen projiceras från klippets öga på den rörliga kroppen. Inte prövat.

Väntar på Jakob:

- De två filmerna i punkt 1.
- Ställningen A2.3 (`output/work/figur/tvahand-redo/a23-mot-a21.jpg`, och rörelsen `cykel-tva-hander` i Labbets steg Dockan, tid 0 ur vyn Spelaren): högerhanden ligger bredvid mynningen och hon vrider sig mindre än i ankarvarianten `a2-3`.

### Väntar

- En andra dealer ur 1–5 bilder genom mallen. En ny dealer ärver dockan och rörelsen, så den väntar tills Paulina sitter.
- Serier ur andra vyer än Spelaren, och ett nytt ankare ur Plats 7 på den nya geometrin.
- Det som händer mellan givarna: samla in kort, betala ut, marker.
- Rörelsefångst ur en film som Jakob gör själv (instruktionen står i `output/work/mansklig-docka/rapport.md`, avsnitt 4). Den behövs först om fångsten ur de fria klippen inte räcker.
- Rörelserna `cykel-nyp-lugn` och `cykel-nyp-flytande`, som ingen serie använder, tas bort ur `content/moves/` när Jakob har sett dem i steget Dockan.
- En följd i Labbets steg Dockan. Steget spelar ett kort till en plats åt gången; Jakob 2026-11-19 saknade ett val för flera platser efter varandra, som de två korten i en tagning, eller hela bordet.
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

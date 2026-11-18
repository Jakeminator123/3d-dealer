# Beslut

Nyast överst. Ett beslut som ersätts stryks inte: skriv det nya överst och peka på det gamla.

## 2026-11-18, en produktionslinje, och det som inte används tas bort

Citat är Jakobs ord samma förmiddag (cirka 09:35–09:45), dikterade.

| Beslut | Skäl |
| --- | --- |
| Målet är så många bra filmer av Paulina att hon kan dela ut kort till alla sju platser och komma tillbaka, med minst två kort per plats. | "skapa så många bra videos till Pau att vi får ihop tillräckligt med sekvenser för att hon kan dela ut kort och återkomma till alla positioner med minst två kort per plats." |
| En produktionslinje: dockan i scenen, ankare på grön skärm i vyns närbild, film med Kling 4, och filmen nycklad i scenen genom samma öga ([production.md](production.md)). Det som inte används tas bort, och det som är bra samlas på ett ställe. | "Vi ska utesluta ineffektiva metoder och automatiskt avlägsna de som inte används. Rensa gammalt material men behåll det som är bra och samla det i en enda källa." "Om vi hittar en effektiv metod, ta bort de andra. Ta bort keystones eller ankare som inte används. Om något är för komplicerat, ta bort det. Jag vill inte ha onödiga beslut; agera inom logiska ramar och skapa best practices." |
| Borttaget ur koden samma dag, eftersom linjen inte använder det: helfiguren i scenen (`src/scene/figure.ts`, gruppen `figure` i `content/scene.json`), dess recept (`src/pipeline/helfigur.ts`, `content/figure-frame.json`), det gamla ankaret på den vikta ytan och vyn Filmkameran. Gamla linsen finns kvar i `content/scene.json` som det scenens mått är mätta genom. Ersätter helfiguren och Filmkameran under "scenen med golv och helfigur" och "det Jakob lämnade över" längre ned. Registrets poster för helfigurerna och de gamla ankarna står kvar tills de tas bort. | Jakobs ord ovan. Helfiguren var inte längre förlagan sedan morgonen, och de gamla ankarna är gjorda i gamla rutan med skon inbakad. Koden finns i Git-historiken (commit `70755fe`). |
| "Ta bort" betyder radera: filen finns inte kvar. "Arkivera" betyder flytta: filen finns kvar på ett annat ställe, i dag `output/work/struket/`. | "Se till att 'ta bort' ÄR radera och att 'arkivera' är 'flytta'" (cirka 09:38). |
| Generering går genom Runways MCP-server, aldrig genom API-nycklar. Ersätter "Du får hög budget på runway/openai_api_key" (06:30). | "se till att vi använder allt från NCP-servern och inte API-et". NCP läses som MCP. |
| Generering får kosta 1 000 krediter i timmen. Ersätter riktmärket 300 i timmen och nattens ram om 250 per beställning och 2 000 för natten, längre ned. Saldot läses före och efter, och modell, indata och kostnad redovisas. En enskild beställning över 100 krediter visas för Jakob först; den gränsen är agentens tills han säger annat. | "Du får ha tusen krediter per timme i genereringar" (cirka 09:45). |
| Dokumentationen byggs nedifrån: fakta står i data (`content/` och registret), och dokumenten säger kort vad som gäller och länkar dit. Filmproduktionen har en metod, i [production.md](production.md). Överlämningarna i `information/` är borttagna; det som gällde i dem står nu i `docs/` och [AGENTS.md](../AGENTS.md). | "Vi ska ha en bottom-up-logik för dokumentation som klargör vad som gäller och standardiserade metoder för filmproduktion." |
| En film som inte fungerar ska gå att granska och felet gå att peka ut: varje tagning bär sin beställning, sina indata och sitt omdöme. | "Om vissa filmer inte fungerar, ska vi kunna granska materialet och identifiera problem." |
| Registret och arbetsdatan (beställningar, uppladdningar, kostnader, mätningar) flyttas från stora JSON-filer till SQLite (`node:sqlite`). | "Överväg att använda SQL-databaser istället för stora JSON-filträd som ignoreras." Valt av huvudagenten. |
| Underagenter körs som standard med Opus 5.5 på extra hög ansträngning. | "underagenter får du med fördel använda Opus 5.5 extra hög som standardval!" |
| Arbetet sker i `3d-dealer` på skrivbordet. Gamla Dealer är Codex arbetsyta: dess grenar, arbetsträd och `D:\dealer-scratch` rörs inte. En gren eller ett arbetsträd med opushade commits tas aldrig bort utan Jakobs ja för just den grenen, och aldrig i ett annat repo än `3d-dealer`. | Jakobs besked samma förmiddag. Regeln om grenar lades till efter en händelse samma dag. |

## 2026-11-18, dealern på grönt ur scenens kamera, och dockan som standard

Citat är Jakobs ord samma morgon (07:19–08:35), när han lämnade över till agenten för natten.

| Beslut | Skäl |
| --- | --- |
| Dealerns filmer görs på grön skärm ur scenens kamera och nycklas in i scenen. Bord, sko, kort och rum är scenens 3D och bakas inte in i filmen. Ersätter nattens försök med rum, bord och sko inbakade i bilden. | Jakobs val bland tre: "Dealern på grönt". Då går rum, bord och sko att byta, och händerna hamnar över scenens kort. Filmen med allt inbakat kallade han "skit". |
| Provfilmen är en hel giv: kortet ur skons mynning till plats 4, med blick, huvud och överkropp som följer med. Ett klipp där bara handen går till skon räcker inte som prov. | Jakobs val, och om filmen VILA → REDO: "hon rör bara handen, helt fel". |
| Samma giv ska gå att se ur flera vinklar: en film per vy, alla gjorda efter samma rörelse i scenens mått. Att byta vy ändrar aldrig var kortet läggs. | "dealern ska filmas så man kan se henne som 3D från olika vinklar utan att hon för den delen dealar till olika positioner" |
| Dockan är standarden för rörelsen, lika för alla dealers. Hon bär Pamelas avlästa nyp-giv ur gamla Dealer. Kortet hämtas där det står i scenens sko och läggs på platsens första kortplats, båda ur `content/scene.json`, och samma rörelse ställs om till plats 1–7. Förlagan är dockan sedd genom vyns kamera; helfiguren är det inte längre. Preciserar 06:06 ("helfiguren är förlagan"). | "Det måste finnas en standard. Vi kan gärna utgå från Pamela, men då är det viktigt att allt följer en och samma grund." Helfiguren är en platt bild: från sidan syns den som en kuliss, och i local-studios skala står hon 10–15 % för stor mot bordet (hjässan 0,81 m över filten mot dockans 0,67). |
| En dealerfilm görs i vyns närbild: samma öga som vyn, riktat mot dealern och inzoomat på hennes arbetsyta (`film.reach`). Filmen läggs tillbaka på den vikta ytan genom samma öga. | Dealern blir cirka 260 bildpunkter i huvudhöjd i 1920 × 1080, som i gamla projektets filmer, och ingenting förskjuts eftersom ögat står kvar. Agentens val. |
| Spelaren står närmare: 1,90 m från dealerns bordskant, 15° nedåt, 48° bildvinkel, fortfarande i dealerns ögonhöjd. Ersätter 2,40 m, 16° och 45° under "teknikval i etapp 1". | "känns som om det skulle vara en reling eller en kant som är mycket högre. Möjligtvis är bordet för långt bort, eller hon är för långt bort från bordet. De måste skjutas samman." Prövat i bild med dockan vid bordet. |
| Dockans händer är 17,5 cm långa, och ankarnas händer hålls vid dockans storlek. | "Hennes händer är för stora på allt jag ser." Mätt: gamla dockans givhand var 24 cm, och bildmodellerna ritar händerna 1,2–1,3 gånger dockans. |
| Ett ankare görs i två steg: en bildmodell som håller underlagets geometri sätter dealern i dockans ställning, och en som träffar likheten rättar huvudet. I natt: Nano Banana Pro, sedan GPT Image 2.6 Sunburst. Preciserar 06:30 ("för bilder prövas andra modeller före Nano Banana"). | Mätt i fyra försök: Sunburst ensam flyttade bord och sko 30 bildpunkter och gjorde händerna för stora; Nano Banana Pro höll sko, bordskant och kort inom 4 bildpunkter men gav fel hår och ett slätare ansikte. |
| Agenten har alla privilegier och ändrar efter eget omdöme. Gamla Dealer och Scoutgaming får läsas som referens. Natten får kosta 2 000 krediter, högst 250 per beställning. | "ALLA privilegier har du och du får ändra vad du vill efter ditt omdöme." "Referensrepos finns som sagt såsom dealer eller scoutgaming." Budgeten valde han i fråga. |

## 2026-11-18, scenen med golv och helfigur

| Beslut | Skäl |
| --- | --- |
| Rummet har golv: en 360-bild skärs mot en sfär kring upptagningspunkten, och under golvet mot golvplanet (samma idé som local-studios `GroundedSkybox`, i skuggprogrammet). Lyftet står på 0. | Jakob: lyftet är fel väg. Bakgrunden såg inzoomad ut när den låg oändligt långt bort. Sett i skärmbilder (`output/scen-matning/golv-*.png`). |
| Helfiguren visas på en upprätt yta bakom bordet (nyckel gemensam med den vikta filmytan). Gamla ankaret på den vikta ytan finns kvar som vyn Filmkameran. | Vägvalet 06:06: helfiguren är förlagan. Livs och Paulinas helfigurer står i registret med `use: "helfigur"`. |
| En förlaga sparas ur scenen i 1920 × 1080, 30 rutor/s, under `output/forlagor/`, med ögats plats och riktning i en json. | Behövs till 2D-filmerna: samma kamera, samma rörelse. Första klippet sparat: Liv VILA → REDO ur Spelaren med Balsalen. |
| Helfigurens mall (Livs gröna, handlägen, gräns 25 bildpunkter) står i `content/figure-frame.json`. Receptet för en ny dealer är `src/pipeline/helfigur.ts`. | Jakob: samma sittande ställningar ur en bild på vilken person som helst. Paulinas VILA/REDO och klipp är godkända som förlaga. |

## 2026-11-18, det Jakob lämnade över till agenten

| Beslut | Skäl |
| --- | --- |
| Helfiguren i 3D-scenen är förlagan, inte slutfilmen. Ur scenen tas referensbilder och koordinater genom valda kameror, och med dem görs de vanliga filmerna, där dealern syns med bordet i bild; de håller högre kvalitet. Helfiguren kan vara Liv eller Paulina i samma ruta. Preciserar raden under, som sa att de gamla ankarna bara blir referens. | Jakob 06:06: "Utifrån den här 3D-varianten ska vi ta olika typer av referensfoton och kanske koordinater, som vi sedan kan använda för att skapa 2D-videos. 2D-videosarna är betydligt bättre än de här 3D-videosarna." |
| Att lyfta bakgrunden är fel väg. Kameran står kvar i ögonhöjd och vinklas så att man ser in i rummet. | Jakob 06:06: "Istället för att vara kvar på golvnivå och vinkla bakgrunden för att se djupare inåt, har vi bara lyfts uppåt. Jag tror att det här är fel." |
| Paulina görs som i local-studio: ankare och klipp i helfigur på grönt, framifrån, utan bord och sko i bilden, med ett riktigt 3D-bord framför. De gamla ankarna med inbakad bordskant blir referens. Scenen byggs om efter den uppställningen. | Jakob pekade dit: "Det finns däremot ett repo ... som skulle kunna hjälpa oss nu." Sett där: dealern framifrån, rummet bakom, stor bordsyta, bordskant och zoom, alltså det han bad om. Magen hamnar under bordet och armarna syns, och ingen sko är inbakad. Dealern Liv har 44 klipp i den rutan som kan vara rörelsereferens. |
| Handens läge vid en plats, med kortet just lagt, är ett ankare: LAGT 1–7 och LAGT D. Det är en gjord stillbild, aldrig en ruta ur en film. Klipp skrivs från→till: REDO→LAGT 3, LAGT 3→REDO, LAGT 3→VILA. Ersätter "två ankare finns" längre ned. | Jakob: "Du bestämmer!", efter att ha bett agenten se på historiken. Gamla filmhandboken ([kopian](../information/filmhandbok-gamla-dealer.md), avsnitt 3 och 5): givar bara dit med slutbild vid platsen höll bäst (plats 4: 5 av 6), och utan slutbild låstes varken kortets storlek, plats eller sida. En plats utan egen slutbild gick inte att beställa. Returen som egen film är oprövad för Paulina; den höll för Pamela. Faller den finns tur och retur kvar, där Jakob godkände 16 av 21 returer. |
| Omdömen sätts av agenten efter oberoende granskning. Jakob är tredje åsikt och kan ändra dem. Regeln står i [AGENTS.md](../AGENTS.md). | "Jag pallar inte godkänna allt. om du säger ngt är bra så är det det, eller låt en automatisk extern granskare se på allt. Jag kan ha en third opinion" |
| `granska igen` är en kö till agenten. Jakob kan skriva varför i Labbet; en granskare rättar eller svarar, och svaret syns i Labbet. | "Om jag klickar Granska igen ska jag kunna motivera och samma andragranskande AI ska kunna rapportera till dig eller själv ändra så saker blir rätt" |
| Agenten avgör det som går att avgöra och frågar inte. | "du borde kunna avgöra det själv eller låta en annan agent göra det. Jag vill inte behöva ta manuella beslut hela tiden." |
| Betald generering beställs utan fråga, tills Jakob säger annat, inom riktmärket 300 krediter i timmen. Gränsen på 100 krediter per beställning, över vilken han får se den först, är agentens tillägg. Ersätter "först efter Jakobs ja per beställning" längre ned. | "Just nu får du ganska fria tyglar när det gäller genereringar om det kan hjälpa oss att förbättra saker." |
| Scenen ska ses ur en och samma sorts vinkel: dealern framifrån, rummet bakom henne och en stor del av bordsytan. Bordets vinkel får justeras något för att nå dit. Skon får tas bort om den stör, och att den hänger utanför bordskanten rättas sist. | "Vi måste ha en och samma typ av vinkel. Vi kan justera bordsvinkeln något för att se bakåt i bilden, dealen framifrån och en stor del av bordsytan", gärna som en "optisk illusion, som jag har löst bättre i till exempel Dealer". "Allt måste dock sitta med koordinater och hur allt delas ut." |

## 2026-11-18, Jakobs besked under granskningen

Citat är Jakobs ord samma dag.

| Beslut | Skäl |
| --- | --- |
| Riktmärket för Runway är 300 krediter i timmen. Varje betald beställning kräver fortfarande hans ja. | "300 krediter i timmen är rimligt som standard/riktmärke" |
| "Böjt" betyder kortets böjning: hur mycket ett kort i handen böjer sig. Det är en egenskap hos det ritade kortet, liksom glans. Ordet säger ingenting om vecket eller bakgrunden; raden längre ned som läste det som vyn är fel på den punkten. Vecket står kvar, eftersom gamla scenen redan vek filmen vid bordskanten. | "böjt är väl hur mycket kortet böjs, såsom ordet glans". Gamla studion hade reglaget "Kortens böjning" bredvid "Kortens glans". |
| Av ankarna används bara de där hon har tatueringar. REDO med släp utan tatuering utgår; REDO med släp och blicken mot kortet gäller i dess ställe. | "där vill jag bara använda den eller dem där hon har tatueringar"; "nästan identisk med den andra när hon har tatueringar och faktiskt tittar mot kortet" |
| REDO med nyp ska finnas med tatuerade händer, gjord ur dagens REDO med nyp. | "På så sätt har vi samma grund för att skapa vad gäller tatueringar" |
| Registret har statusen `granska igen`, mellan `godkänd` och `utgår`. | "ett mittemellanalternativ så det antingen godkänns med anpassning eller i alla fall granskas och resoneras kring" |
| Bakgrunderna bedöms i scenen, med bord och dealer på plats, inte som lösa bilder. | "omöjligt att säga något om utan att först kunna se bord och dealer i den för att kunna vrida omkring i miljön" |
| Första filmprovet är kedjan för plats 4: ett kort per klipp, från de tatuerade ankarna. En film på cirka 15 s till alla sju platser görs inte nu. | Jakobs val bland fyra alternativ. Gamla projektet: hela rundan i en tagning gav 0 användbara av 7 för cirka 3 500 krediter. |
| VILA och REDO är samma ankare som gamla projektets A1 och A2. Orden VILA och REDO används. | "VILA - REDO är ju A1 och A2. Vi kan ha så för enkelhetens skull" |

## 2026-11-18, teknikval i etapp 1

Valda av agenten när Jakob bad om ett lokalt labb att granska i ("börja bygga lokala labbet så jag kan granska i en vy"). Han har inte prövat dem var för sig.

| Beslut | Skäl |
| --- | --- |
| En lokal server i en process: `npm run dev`, port 5310, svarar bara på localhost. Den lämnar ut registret, filerna i `assets/` och sidorna. | "Bara lokalt". Ett kommando att starta. |
| Sidorna byggs med Vite och React, 3D med three direkt. Inget Next. | Samma grund som gamla studion, utan det som inte behövs lokalt. |
| Tester körs med Nodes egen testkörare, och Node 24 kör TypeScript direkt. | Så körs gamla kärnans tester redan. Inga extra paket. |
| Jakobs omdöme sätts med ett klick i Labbet. Servern skriver `status` och `statusBy` i `content/assets.json`. Ett klick tar aldrig bort en fil. | Ett klick i Labbet är hans ord. Att ta bort det som fått `utgår` är ett eget steg efter hans besked. |
| Registret läses och skrivs av `src/pipeline` (import och granskning). Labbet når det genom servern. | Gränserna i [architecture.md](architecture.md). |
| Servern gör förhandsbilder och lägger dem i `output/cache/`. | Mätt: 55 bilder på 125 MB blir 1,4 MB att visa. |
| Scenens kamera är gamla linsen, och den är ögat för plats 4. Dealern är ankarbilden projicerad ur den kameran på en vikt yta. | Då ser dealern ur scenens kamera ut som i ankarbilden. Mätt: 99,7 % av hennes inre bildpunkter är identiska, och bordskanten hamnar på rad 831,49 mot standardens 831,5. |
| Skon som är inbakad i ankarbilden målas över med grönt innan det gröna nycklas bort, så att bara 3D-skon syns. | Annars syns två skor. Brist: en hand som ligger över skon klipps, som i REDO-ankarna. |
| 360-bilden ritas i ett eget pass runt scenen, oändligt långt bort. Den platta bilden visas som kuliss i kamerans ruta. | Vridning, oskärpa, ljusstyrka och spegling ska gå att ställa per bakgrund. |
| Scenen ses först genom vyn Spelaren: ögat 0,60 m över filten, 2,40 m från dealerns bordskant, 16° nedåt, 45° bildvinkel. Bordet lutar 5° mot spelaren kring dealerns bordskant. Gamla linsen är kvar som vyn Filmkameran. Talen står i `content/scene.json`, märkta antagna. | Valda efter prov i bild. Närmare öga ger ingen vall i bild, vidare vinkel gör dealern liten, 0° och 3,6° lutning trycker ihop händerna, 7° syns som sluttning från sidan. Mätt från filmkameran: med 5° lutning hamnar fingertopparna 6 rader lägre än i ankarbilden; utan lutning stämmer bilden som förut. |

## 2026-11-18

Förslaget lades fram av agenten och godkändes av Jakob ("Okej, det låter bra"). Citat är Jakobs ord samma dag.

| Beslut | Skäl |
| --- | --- |
| Ren ombyggnad i en ny mapp. Gamla Dealer och Scoutgaming är läsreferenser. | Projektet hade flera delvis olika svar på samma frågor: kamera, kortplats, ankare, beställning. |
| Scenen först: en scen i verkliga meter, som labb, beställning och casino läser. | Två kameror levde sida vid sida, och kortplanen och spelet räknade olika. |
| Bord, sko, kort och marker är 3D. Dealern är film som viks vid bordskanten. | "Det mesta är 3D-aktigt"; vyn ska gå att se "lite böjt". |
| Keystone slopas som ord och steg. Identitet ersätter det. | Keystone spelades aldrig; dess skuggor följde med in i ankarna. |
| Ankare är enda ordet, och två finns: VILA och REDO. Nyp eller släp hör till klippet. | 2.1, 2.2 och 2.3 var varianter av samma läge. |
| Kartan över ankare och klipp ritas ur klippregistret. | Samma lista fanns på flera ställen. |
| Givar görs med första bild, sista bild och en förlaga som referensfilm. Ett kort per klipp. | Det som höll bäst i gamla projektet. |
| Paulina är visningsnamnet; hon hette Pau och Paow. Id är `paulina`. | "som vi nu kallar Paulina" |
| Paulina har tatueringar på hals, bröst och båda händerna. | "hon alltid ska ha tatueringar, även på händerna" |
| Handtatueringarna behålls som i identitetsbilderna: en ros i mandala på handryggen och små tecken på fingrarna. Närbilden `hander-ovansida.png` är handreferensen. | Jakobs val 2026-11-18, mot alternativet att rita om dem närmare fotografiets mörkare, skuggade ros. Att rita om hade krävt nya händer i alla identitetsbilder och ankare. |
| Kroppens skuggning stannar i filmen; bordets skugga läggs av scenen. | "Hon ska rimligtvis ha lite skugga om det inte läggs på i efterhand." |
| Produktion via Runway MCP i chatten. Betald generering först efter Jakobs ja per beställning. | Webbkontot har krediterna. |
| Bara lokalt. Lipsync och ljud väntar. | "vi kan avvakta med lipsync och ljud tills vi har fått allt annat att fungera" |
| Media ligger utanför Git och registreras i `content/assets.json`. Importen från gamla Dealer är en ögonblicksbild från 2026-11-18. | Gamla projektet kommer att ändras; ingenting här ska bero på det. |

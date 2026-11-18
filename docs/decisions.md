# Beslut

Ett beslut per rad, med datum och skälet i korthet; citat är Jakobs ord. Ett beslut som ersätts tas bort, och det nya säger vad det ersatte; det borttagna finns i Git-historiken. Hur något görs står i [production.md](production.md), och vad orden betyder i [architecture.md](architecture.md#orden).

## Projektet

- 2026-11-18. Ren ombyggnad i en ny mapp, `3d-dealer`. Gamla Dealer och Scoutgaming är läsreferenser, och det som hämtades därifrån är en ögonblicksbild från samma dag. (Agentens förslag; "Okej, det låter bra".)
- 2026-11-18. Bara lokalt. Lipsync och ljud väntar. ("vi kan avvakta med lipsync och ljud tills vi har fått allt annat att fungera")
- 2026-11-18. Målet är så många bra filmer av Paulina att hon kan dela ut kort till alla sju platser och komma tillbaka, med minst två kort per plats. (09:35)
- 2026-11-18. Paulina är visningsnamnet (förut Pau och Paow); id är `paulina`.
- 2026-11-18. Gamla Dealer är Codex arbetsyta och rörs inte, och en gren med opushade commits tas aldrig bort utan Jakobs ja. Regeln står i [AGENTS.md](../AGENTS.md).

## Scenen

- 2026-11-18. Scenen först: en scen i verkliga meter, som Labbet, beställningarna och Casinot läser. (Två kameror levde sida vid sida i gamla projektet, och kortplanen och spelet räknade olika.)
- 2026-11-18. Bord, sko, kort och marker är 3D; dealern är film som viks vid bordskanten.
- 2026-11-18. Scenen ses ur en och samma sorts vinkel: dealern framifrån, rummet bakom henne och en stor del av bordsytan. Bordet får lutas något mot spelaren (`table.tilt`); skon får tas bort om den stör, och att den hänger utanför kanten rättas sist. ("Vi måste ha en och samma typ av vinkel.")
- 2026-11-18. Spelaren står nära dealern, i hennes ögonhöjd (`player` i `content/scene.json`). Ersätter 2,40 m. ("De måste skjutas samman.")
- 2026-11-18. Vyerna är Spelaren, Plats 1–7 och närbilden av var och en. Gamla linsen (`camera`) är ingen vy; bordskanten och kortplatserna är mätta genom den. Ersätter vyn Filmkameran.
- 2026-11-18. Rummet har golv: 360-bilden skärs mot en sfär och mot golvplanet, och lyfts inte. En platt bakgrund visas som kuliss i vyns ruta. Ersätter lyftet. ("Jag tror att det här är fel", om att lyfta bakgrunden.)
- 2026-11-18. Bakgrunderna bedöms i scenen, med bord och dealer på plats. ("omöjligt att säga något om utan att först kunna se bord och dealer i den")
- 2026-11-18. "Böjt" betyder kortets böjning, en egenskap hos det ritade kortet liksom glans. Vecket är något annat. ("böjt är väl hur mycket kortet böjs, såsom ordet glans")
- 2026-11-18. Skon står på bordet, 8,75 cm närmare spelarna än förut, och spelarnas kortplatser flyttades lika långt, så att deras inbördes läge står kvar. Kortplanen är en rundad båge som räknas ur några tal (`places.arc`, och dealerns rad `places.row`). Ersätter V-formen och skon på bordskanten. ("Ska sko ändras gör så!"; korten delades "som lite spjutformat, alltså som rak linje och inte som mer bågformat".)
- 2026-11-18. Ett klipp och ett ankare bär ögat det är gjort genom, skons läge och var kortet landar, och uppspelningen läser dem. En gammal film spelar därför rätt när scenen ändras, och en följd håller sig till klipp ur ett och samma REDO-ankare.
- 2026-11-18. Kortens läge och storlek går att ställa i efterhand: kortet landar där handen lade det och glider sedan till sin plats i dagens kortplan och sin storlek på bordet (`card.onTable`). Labbets steg Kortplan ställer talen. ("Kan vi justera kortpositioner och storlekar av kort – även om det görs i efterhand – så är det precis det jag är ute efter.")
- 2026-11-18. Spelkärnan avgör vilka klipp som spelas: varje utdelat kort väljer sitt klipp efter `seat`, `index` och `action`, med valören ur händelsen. Saknas klippet läggs kortet utan dealerns rörelse. Spelkärnan körs i servern, och Casinot spelar en runda mot den.
- 2026-11-18. En uppspelning: en följd av klipp, där ett ensamt klipp är en följd med ett. Scenens kort ligger kvar tills given är slut, och mellan klippen hålls filmens sista ruta, inte ankarets bild (granskaren mätte ett skärpesprång mot bilden).
- 2026-11-18. Märkkortet målas som ett spelkort medan det är i luften: röd baksida med vit kant, och framsidan med kortets valör från vändningen. Korten och dealerns hand skuggar filten (`card.shadow`, `room.dealerShadow`). ("Korten ser bra ut förresten.")
- 2026-11-18. Sedd från platsen där dealerfilmen är gjord ritas inte scenens 3D-sko: filmens egen sko gäller, så att arm och kort vid platserna intill skon syns framför den. Från andra vyer står 3D-skon kvar: inom 3° från filmens öga gäller filmens sko, mellan 3° och 8° tonar 3D-skon in (gränserna är antagna), och hjulet zoomar utan att flytta ögat. Ersätter att kortet i mynningen ritades över skons ram. (Att skilja armen från skon ruta för ruta gick inte: svart ärm mot svart sko lämnade hål, mätt.)

## Dealern och filmen

- 2026-11-18. Dealerns filmer görs på grön skärm i vyns närbild och nycklas in i scenen genom samma öga; bord, sko, kort och rum bakas inte in. Ersätter nattens försök med allt inbakat ("skit"). (Jakobs val: "Dealern på grönt".)
- 2026-11-18. Samma giv ses ur flera vinklar: en film per vy, alla efter samma rörelse. Att byta vy ändrar aldrig var kortet läggs. ("utan att hon för den delen dealar till olika positioner")
- 2026-11-18. Dockan är standarden för rörelsen, lika för alla dealers: hon bär Pamelas nyp-giv ur gamla Dealer, hämtar kortet i scenens sko och lägger det på platsens första kortplats. Ersätter helfiguren som förlaga. ("Det måste finnas en standard.")
- 2026-11-18. En giv är hela rörelsen: blick, huvud och överkropp följer kortet. ("hon rör bara handen, helt fel")
- 2026-11-18. Ett kort per klipp, och klippet är en cykel: REDO → kortet läggs → REDO, gjort med första bild, sista bild och dockans film som referens. Alla klipp börjar och slutar i samma ställning, så de kedjas fritt och bara REDO behövs som ankare per vy. Ersätter klipp från→till med ett eget slutankare per kortplats, som kostade det dubbla. En hel runda i en tagning görs inte (i gamla projektet gav det 0 användbara av 7 för cirka 3 500 krediter).
- 2026-11-18. Ett ankare är en gjord stillbild, aldrig en ruta ur en film. Sista bilden i en cykel är REDO med märkkortet målat på kortplatsen. Keystone slopas; Identitet ersätter det. ("VILA - REDO är ju A1 och A2.")
- 2026-11-18. Varje tagning går genom `tagning.ts`: paketet före beställningen, mätning mot gränsvärden och registrering efter. En serie beställs i omgångar, och en oberoende granskare dömer varje omgång. ("standardiserade metoder för filmproduktion")
- 2026-11-18. Dockans film sparas i 24 rutor/s, samma som Kling svarar i. (Piloten med 30 hade ett ryck i takten; orsaken är antagen.)
- 2026-11-18. Dockan rör sig som en människa: ingen frusen tid, andning, klockformad fart i handen, bålen börjar före handen och landar efter, blicken går före kortet. Varje klipp mäts på den dynamiken (`src/pipeline/rorelse.ts`, gränser i `content/tagning.json`). Kling kopierar dockans dynamik nästan exakt (mätt), så en stel docka ger en stel film. ("hennes rörelser är tjackiga/hackiga/skräckfilmsaktiga. Hon känns stel", 16:30, om de 14 första klippen.)
- 2026-11-18. Rörelsen bärs av dockan, inte av texten: samma docka med en ny text om att hon rör sig som en levande människa ändrade ingenting (mätt, provklipp A2). Kling halverar ungefär de små rörelserna och fryser personen där dockan gör en paus, så cykeln `cykel-nyp-flytande` (provklipp D) har ingen vila på kortet och 2–3 gånger större små rörelser. D föreslås som standard tills Jakob har valt.
- 2026-11-18. Medan spelet väntar spelas ett vänta-klipp (REDO → REDO, där hon andas och ser upp) i stället för att filmens sista ruta hålls.
- 2026-11-18. Jakob ser provklipp och väljer med ögat innan en serie beställs. Granskarnas mått på händer, kort och skarvar räcker inte: de godkände 14 klipp som han fann stela.
- 2026-11-18. Dockans händer har sitt mått i `content/doll.json`, och ankarnas händer hålls vid det. ("Hennes händer är för stora på allt jag ser.")
- 2026-11-18. Ett ankare görs i två steg: en bildmodell som håller underlagets geometri, sedan en som träffar likheten. Filmen görs med Kling 4. Modellerna och stegen står i [production.md](production.md).
- 2026-11-18. Paulina har alltid tatueringar på hals, bröst och båda händerna, och handtatueringarna ritas som i identitetsbilderna. ("hon alltid ska ha tatueringar, även på händerna")
- 2026-11-18. Kroppens skuggning stannar i filmen; skuggan på bordet läggs av scenen. ("Hon ska rimligtvis ha lite skugga om det inte läggs på i efterhand.")
- 2026-11-18. Kartan över ankare och klipp ritas ur klippregistret och har ingen egen lista.

## Produktionen och registret

- 2026-11-18. En produktionslinje ([production.md](production.md)). Det som inte används tas bort, och det som är bra samlas på ett ställe. ("Om vi hittar en effektiv metod, ta bort de andra." "Om något är för komplicerat, ta bort det.")
- 2026-11-18. "Ta bort" betyder radera och "arkivera" betyder flytta. (09:38)
- 2026-11-18. En underkänd tagning arkiveras till `output/work/arkiv/`; annat oanvänt tas bort. Båda antecknas med hela posten i registret, och vägrar så länge något pekar på filen. ("Om vissa filmer inte fungerar, ska vi kunna granska materialet och identifiera problem.")
- 2026-11-18. Varje tagning bär sin beställning, sina indata och sitt omdöme.
- 2026-11-18. Registret är `content/register.db`, en SQLite-databas (`node:sqlite`) i Git. `src/pipeline/registry.ts` är enda vägen dit och `npm run reg` enda kommandot. Det bär också omdömenas historik, beställningarna med kostnad, uppladdningarna, mätningarna och det som lämnat registret. Ersätter `content/assets.json`. ("Överväg att använda SQL-databaser istället för stora JSON-filträd som ignoreras.")
- 2026-11-18. En Runway-adress sparas utan signatur, eftersom `origin` är publikt.
- 2026-11-18. Dokumentationen byggs nedifrån: fakta i data, och dokumenten säger kort vad som gäller och länkar dit. Inga överlämningar. ("bottom-up-logik för dokumentation")
- 2026-11-18. Generering går genom Runways MCP-server, aldrig med API-nycklar. Ersätter "hög budget på runway/openai_api_key" (06:30). ("se till att vi använder allt från NCP-servern och inte API-et")
- 2026-11-18. Generering får kosta 1 000 krediter i timmen, och en beställning över 100 krediter visas för Jakob först (den gränsen är agentens). Ersätter 300 i timmen och nattens ram. ("Du får ha tusen krediter per timme i genereringar", 09:45)

## Arbetssättet

- 2026-11-18. Agenten avgör det som går att avgöra, inom logiska ramar, och frågar inte. ("Jag vill inte ha onödiga beslut; agera inom logiska ramar och skapa best practices.")
- 2026-11-18. Omdömen sätts av agenten efter oberoende granskning; Jakob är tredje åsikt och ändrar dem i Labbet. ("om du säger ngt är bra så är det det, eller låt en automatisk extern granskare se på allt. Jag kan ha en third opinion")
- 2026-11-18. Statusen `granska igen` ligger mellan `godkänd` och `utgår` och är en kö till agenten; Jakob kan skriva varför, och svaret syns i Labbet.
- 2026-11-18. Underagenter körs som standard med Opus 5.5 på extra hög ansträngning.

## Tekniken

- 2026-11-18. En lokal server i en process, som bara svarar på den här datorn: registret, filerna i `assets/`, förhandsbilder i `output/cache/` och sidorna. Ett klick i Labbet sätter Jakobs omdöme och tar aldrig bort en fil.
- 2026-11-18. Servern startar om sig själv när en fil den läser ändras (Nodes `--watch`), och `npm start` och `npm stop` kör den dold i bakgrunden. Ersätter regeln att servern startas om för hand och att 5310 inte rörs. (Den körde fem timmar gammal kod och svarade 500 efter att registret flyttats.)
- 2026-11-18. Sidorna byggs med Vite och React, 3D med three direkt; inget Next.
- 2026-11-18. Tester körs med Nodes egen testkörare, och Node 24 kör TypeScript direkt; inga extra paket.
- 2026-11-18. En förlaga sparas under `output/forlagor/` med ögats plats och riktning; rutan och takten står i `forlaga` i `content/scene.json`.

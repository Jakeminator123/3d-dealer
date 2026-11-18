# Dealer – rekommendation för omstart och färdig ingångsprompt

**Datum:** 18 november 2026, svensk tid.  
**Till:** Jakob och nästa lokala agent.  
**Syfte:** Beslutsunderlag och ett konkret startuppdrag. Ingen ombyggnad har genomförts inom denna granskning.

## 1. Min rekommendation

**Ja: gör en ren ombyggnad med utvalt återbruk.**

- Bygg en mindre lokal studio där labbet och casinot använder samma scen, kamera, geometri och uppspelning.
- Återanvänd den fristående spelkärnan och avgränsade, verifierbara delar av Dealer.
- Låt en ny grund ersätta de parallella arbetssätten för kortplan, scen, filmbeställning och spel.
- Börja med Paulina, ett bord, en fungerande givkedja och ett verkligt prov från en annan kamera.
- Avvakta med Vercel, annan publicering, lipsync, ljud, bot och operatörssystem.

Ett nytt repo i en separat mapp är rimligt om det hjälper dig att få en tydlig början. En kortlivad ombyggnadsgren kan också fungera. Det viktiga är en tydlig gräns för vad som tas över och en gemensam teknisk grund. En ny repoadress åstadkommer inte detta på egen hand.

Bevara det nuvarande repots granskade version som referens. För in endast utvalda filer och material i den nya aktiva arbetsytan. Låt historiken ligga kvar där den redan finns. Skapa inga inbäddade Git-repon, junctions till gamla projekt eller mappar med hela äldre implementationer.

**Jag rekommenderar inte att skriva om Blackjackreglerna från början.** Det finns redan en fristående kärna i Dealer, med dokumenterat ursprung i Scoutgaming. [D1][S1]

## 2. Vad jag faktiskt har granskat

- Dealer, main: **2e3967c999750d27abd2517008206a5af1d7bcc0**.
- Scoutgaming, main: **90d6697c4850af773ee3128dfb6f79329bf86479**.
- Kodnedslag i spelkärna, kortgeometri, 3D-scen, studions skal, referensval, filmrecept, ankare och ursprungsspårning.
- Aktuell officiell dokumentation för Runway, React Three Fiber, Three.js och Vite.

Detta är en kod- och arkitekturgranskning. Jag har inte startat din lokala studio, kört dess tester eller visuellt bedömt de senaste filmerna. De två textfilerna i din planerade mapp information och dina lokala GLB-filer har inte varit tillgängliga här. Även arbete som ännu inte pushats kan saknas i bedömningen.

### Konkreta fynd som motiverar ombyggnaden

| Fynd | Belägg i nuvarande repo | Slutsats för den nya grunden |
| --- | --- | --- |
| Flera önskade delar finns redan | Dealer har game/core.ts, sessionshantering och en dokumenterad portning från Scoutgaming. | Återanvänd ett sammanhängande regelpaket och kontrollera dess beteende. [D1][S1] |
| Studion har blivit mer samlad | Menyn samlar flera arbetsmoment under Bordet. Casinot öppnar fortfarande game.html i en iframe. | Behåll den förbättrade arbetsordningen. Samla även den tekniska körvägen. En iframe är inte i sig ett fel. [D2] |
| Kortplan och spel använder olika geometri | card-plan.ts använder den nya linsen och planCardQuad. game-table.ts använder fortfarande flatQuad. | En enda funktion ska avgöra var kortet finns och hur det projiceras i varje vy. [D3] |
| Scenen har ytterligare ett kameraval | scene3d-view.ts använder kontraktets kamera eller en alternativ uppskattning. table-lens.ts beskriver varför en ny lins tagits fram. | För över matematik och mätningar, men välj en gemensam kalibrering för det aktuella materialet. [D4] |
| Referensval skiljer sig mellan verktyg | produce.ts accepterar renderade referenser för en metod, medan bordet.ts kräver en rakt godkänd bankfilm. order-model.ts markerar renderade kandidater på annat sätt. | UI och kommandon ska anropa samma beställningsbyggare. Detta är ett glapp i automatiskt referensval, inte bevis för att varje beställning misslyckas. [D5] |
| Nya filmmetoder och äldre förval lever samtidigt | Promptkoden har mall 10, men metodregistret har fortfarande tur och retur på sju sekunder utan referens för ett centralt givsteg. | Ett versionsbundet recept ska styra vad som faktiskt skickas. Pågående införanden får en tydlig status. [D6] |
| Gamla regler är delvis specifika för en metod | dealer-standard.json innehåller bestämda bildmått, handpunkter, sko, fritt hängande armbågar och regler för grönt runt kroppen. | Behandla detta som källmaterial för en viss produktion, inte som universella regler för alla dealers. [D7] |
| 3D-arbetet innehåller användbara byggstenar | dealer3d skiljer mätta bildpunkter från antagna kroppsmått och rekonstruerar en kortbana med delvis antagna höjder. | Behåll tydligheten om vad som är mätt respektive uppskattat. En beräknad bana är inte en verifierad 3D-skanning. [D8] |

Min bedömning är därför att problemet främst är **flera delvis olika svar på samma frågor**: vilken kamera gäller, var ligger kortet, vilket ankare gäller och vilket recept beställs? Att bara flytta mappar skulle lämna detta kvar.

## 3. Ta med detta

| Del | Vad som är värt att ta med | Villkor |
| --- | --- | --- |
| Spelkärna | Dealer game/ och dess ursprung i Scoutgaming: regler, sko, explicit slump, publik vy, avräkning och lokal session. | Välj en implementation. Jämför den befintliga portningen med vald Scout-version och dokumentera skillnader. |
| Spelsignaler | Betydelsen av deal, reveal, turn, settle och idle. Behåll möjlighet att förstå speak senare. | Filmen bestämmer aldrig kortvärden eller spelutfall. |
| Identitet | Paulinas senaste valda referensbilder, ansikte, händer, tatueringar och kläder. | Kontrollera vad som faktiskt gäller. Ett gammalt textpåstående får inte överstyra den aktuella referensen. |
| Godkänt material | De bilder och filmer som behövs för den första fungerande kedjan. | Kontrollera både visuell kvalitet och om kamera, ankare och geometri passar. |
| Geometri | Rena projektionsfunktioner, kortmått, koordinatomvandling och kameraberäkning. | Gamla pixelvärden och uppskattningar får inte bli globala sanningar för nya dealers. |
| Kortspår och masker | Användbara fyrhörningar, kontaktpunkter, släpptider, maskering och efterarbete. | Knyt dem till exakt källfilm, bildstorlek, kamera och version. |
| Klipplogik | Idén med VILA, REDO, givning, retur och separat hålkortsvändning. | En nodkarta och uppspelningen ska läsa samma definitioner. |
| 3D-förlagor | Delar av dockan och kortbanan som kan styra rörelsen före filmgenerering. | Granska även förlagan; felaktig handbana blir inte korrekt av en bättre bildmodell. |
| Granskningsverktyg | Bildrutestegning, jämförelse, markering av problem och tydliga användarbedömningar. | Håll automatkontroll, agentförslag och Jakobs godkännande åtskilda. |
| Spårbarhet | Ursprung, filhash, exakta prompts, referenser, task-ID och vad ett material bygger på. | Spara det som strukturerade data. Återskapa inte alla gamla kodgrenar för historiska beställningar. |

Scoutgamings presentation använder bland annat shoeDraw för kortidentitet och skiljer mellan att dela ett dolt kort och att senare vända samma kort. De betydelserna bör överleva ombyggnaden. Mappningen mellan motorns box 0–6 och spelarplats 1–7 ska finnas på ett ställe. [S2]

Dealer har redan denna omvandling i game/seats.ts. Den lokala signalen använder bland annat seat och to: "seat", där Scout använder box och to: "box". Samma spelbetydelse innebär därför inte att dagens JSON-format är identiska; behåll en uttrycklig adaptergräns. [D1][S2]

Dealers befintliga game/session.ts är en session för en spelare i minnet. Flera spelbara platser och kameror är inte automatiskt flera samtidiga spelare. Gemensamt spel mellan klienter kräver en gemensam sessionshanterare. [D1]

## 4. Lämna detta utanför första versionen

- Vercel-konfiguration, nätkopian, publiceringsverktyg, molnlås och molnbot.
- Lipsync, ljud, talproduktion, introfilmer och trailerarbete.
- Scoutgamings admin, operatörsportaler, databaskopplingar och fulla multiplayerkoordinator.
- Äldre kompletta labb, frysta webbundlar och parallella spelsidor.
- Hela den gamla film- och experimentbanken.
- Alla gamla promptvarianter som aktiv produktionskod.
- Personspecifika undantag och tillfälliga ersättningsfilmer som nya generella standarder.
- Hårdkodade regler om att alla dealers ska ha samma händer, armbågsposition, sko eller gröna bakgrund.
- Flera manuellt underhållna listor för samma ankare, klipp eller produktionsstatus.
- Dåliga GLB-modeller som styr scenens utseende enbart för att de råkar finnas.
- Hela den gamla testsviten. Ta över de beteendefall som skyddar det som faktiskt migreras.
- Historiska agentroller, sessionsadresser, temporära diskvägar och arbetsdagböcker som instruktioner för nya agenter.

Godkänd media och original ska inte raderas för att arbetsytan ska bli ren. Det räcker att bara importera det som behövs. Gamla försök kan ligga kvar på sin ursprungliga plats, utan beroenden från det nya projektet.

## 5. En enkel lokal grund

Mitt förstaval för en ny grund är **React, TypeScript, Vite, Three.js/React Three Fiber och en liten lokal Node-server**. Vite tillhandahåller utvecklingsserver och byggverktyg; R3F är Reacts renderer för Three.js. Det är ett förslag som passar denna lokala studio, inte ett krav att skriva om fungerande Three.js-matematik. [W3][W5]

Dealer kan redan köras lokalt. Att avvakta med Vercel är därför fullt förenligt med målet; ombyggnaden behövs för att samla arbetssätten. [D0]

### Föreslagen mappstruktur

| Mapp eller fil | Ansvar |
| --- | --- |
| src/app/laboratory/ | Labbet: skapa, justera, repetera och granska. |
| src/app/casino/ | Casinot: spelkontroller och spelarvy. |
| src/scene/ | Gemensam 3D-scen, kameror, kort, marker, dealer och uppspelning. |
| src/game-core/ | Fristående spelregler, sko och händelser. Inga UI- eller videoberoenden. |
| src/server/ | Lokal session, API, materialåtkomst och sparning. |
| src/production/ | Ett sätt att bygga produktionsjobb, skicka dem och registrera resultat. |
| src/contracts/ | Typer, format och validering för scen, material, klipp och signaler. |
| content/ | Aktuella scen- och dealerdefinitioner samt materialkatalog. Små versionshanterade data. |
| assets/ | Utvalda original, filmer, masker, texturer och modeller. Stora filer hanteras utanför vanlig Git. |
| runtime/ | Återupptagbara lokala jobb och sessionsdata; utanför Git. Jobbmetadata kan behöva bevaras. |
| output/ | Återskapningsbara renderingar och tillfälliga resultat; utanför Git. |
| tools/ | Små kommandon som använder samma funktioner som studion. |
| docs/ | Kort aktuell dokumentation och begripliga beslut. |
| information/ | De två samtalen och andra bakgrundskällor, märkta som referenser. |
| START.cmd | Installerar nödvändiga beroenden när de saknas och startar den lokala arbetsytan. |

Börja gärna med en package.json, en låsfil och ett startkommando. Exakta mappnamn och antal paket är inget kvalitetsmått. Tydliga beroendegränser är viktigare, och inga mappar ska vara inbäddade Git-repon.

Node-servern är lämplig för kärnan, som har Node-baserade beroenden, och för filåtkomst och leverantörsanrop. Gränssnittet ska inte bära API-hemligheter. [S1]

### Vad användaren ser

- Två huvudlägen: **Labbet** och **Casinot**.
- I Labbet: **Scen → Dealer och ankare → Skapa → Granska → Prova**.
- En stor scenyta och relevanta kontroller för det valda steget.
- Nodkartan som en användbar vy när man behöver se vilka övergångar som finns.
- Samma scenkomponent används när man provar en sekvens och när man spelar.
- Avancerade koordinater och teknisk diagnostik finns tillgängliga utan att fylla grundvyn.

## 6. De viktigaste reglerna för att delarna ska hänga ihop

### Tre utbytbara delar i en gemensam scen

Bakgrund, bord och dealer ska vara utbytbara innehållsdelar. Kort, marker och sko är egna objekt. Allt ska dela kamera och koordinatsystem.

Detta får inte bli tre fasta bildlager med kort ovanpå allt annat. Händer ska kunna täcka kort, bordskanten ska kunna täcka kroppen och kort ska kunna kasta skugga på filten. Djup, masker och kontaktskuggor måste samverka.

### Håll isär tre olika platser

- **Spelarplats:** vilken plats personen spelar på.
- **Utdelningsmål:** var dealern lägger det aktuella kortet.
- **Kameravy:** varifrån scenen betraktas.

En person på plats 1 ska kunna se samma givning till plats 4 som personen på plats 4 ser. Ett byte av kamera får inte ändra kortets fysiska position, spelutfallet eller vilken rörelse som spelas.

### En gemensam scenbeskrivning

Definiera på ett ställe:

- Enheter, axlar och bordets höjd.
- Dealerns placering och storlek.
- Skons placering, riktning och utlopp.
- Kortens verkliga mått och landningsplatser.
- Kamerans position, riktning, bildutsnitt och projektion.
- Handkontakt, kortets bana, släpptid och maskering.
- Vilken kalibrering varje film och varje kortspår bygger på.

Pixelkoordinater ska härledas från den scenen eller omvandlas genom en uttrycklig kalibrering. Undvik att labbet, beställningsbilden och casinot har varsin version av samma mått.

Ändrad kamera eller bordsgeometri kan kräva ny kontroll av klipp och spår. Ett byte av bakgrundsbild ska inte automatiskt ogiltigförklara allt; kontrollera vilka beroenden som faktiskt påverkas.

### En gemensam filmdefinition

Varje klipp ska kunna ange dealer/utseendeversion, scenversion, kamera, start- och slutankare, händelse, källfilm, bildfrekvens, kortspår, släpptid, masker och granskningsstatus.

- Nodkartan byggs av dessa data.
- Beställning, import, granskning och uppspelning läser samma data.
- En ny ankarruta kan hämtas ur en film om den godkänns, fryses och får tydligt ursprung. Härledning från film gör den inte automatiskt korrekt eller inkorrekt.
- Saknat material visas som saknat. Experiment får köras i labbet, men en ersättning ska vara synlig och förklarad.
- När casinot väljer ett materialpaket kontrolleras hela relevanta beroendekedjan från identitet och ankare till efterarbete och kamera.

### Spelkärna, signaler och filmgraf har olika ansvar

- Spelkärnan beslutar vilka kort och utfall som gäller.
- En adapter översätter spelhändelser till presentation.
- Uppspelningen visar dessa händelser i rätt ordning.
- Filmens nodgraf beskriver möjliga rörelser och skarvar.
- En långsam film får inte skapa ett nytt kort eller ändra saldot.
- Labbet kan repetera sparade signaler genom samma uppspelning som casinot använder.

Om flera lokala klienter ska spela vid samma bord används en gemensam auktoritativ session. Varje klient får sin egen kamera, men samma spelhändelser och tidslinje.

## 7. Vilken 3D-metod jag rekommenderar att börja med

**Börja med en hybridpilot:** verklig 3D för bord, sko, kort och marker; fotorealistisk video för Paulina; en enkel 3D-förlaga för handens och kortets rörelse.

Det ger ett avgränsat sätt att pröva det svåraste: trovärdig handkontakt och stabil geometri. Det bevisar inte att filmen fungerar från valfri stol.

| Metod för dealern | Passar till | Begränsning |
| --- | --- | --- |
| Frilagd video på plan eller anpassad yta | Fotorealistisk mittvy och begränsade godkända kamerarörelser. | Återskapar inte osedda sidor av ansikte, händer eller kropp. |
| Matchande filmer från flera vyer | Förutbestämda spelarvyer. | Kräver matchande rörelse, timing, kortkontakt och identitet. Separata genereringar är inte automatiskt samma händelse. |
| Animerad 3D-dealer eller rekonstruerad 3D/4D-representation | Större sammanhängande kameraförflyttningar och fler verkliga perspektiv. | Ett större arbete med modell, rörelse, material, hår, händer och kontakt. |

Detta är min tekniska bedömning av representationerna. Three.js VideoTexture gör en video till en textur; GLTFLoader laddar 3D-material. Att lägga ett GLB-bord under filmen gör inte själva personen till 3D. [W4]

Om realistiska sidovyer är ett absolut krav ska sidovyprovet göras tidigt. Om videometoden faller där väljer ni mer passande material eller en verklig 3D-metod innan ni producerar hela banken. En böjd videoyta får inte användas som bevis på att problemet är löst.

### Produktionskedjan

1. Välj Paulinas aktuella identitetsreferenser.
2. Kalibrera kamera, bord, sko och kort tillsammans.
3. Skapa en enkel 3D-förlaga med rätt grepp, vridning, landning och retur.
4. Förbered bild- och videoreferenser för den modell som faktiskt stöder dem.
5. Generera en kort provtagning och registrera exakt indata.
6. Granska både originalet och kompositen.
7. Spåra kortet, ordna masker och kontaktskuggor, och koppla in motorns kortgrafik.
8. Prova samma material i labbet och casinot.

Utseendet kan börja med en bild eller beskrivning. Ett stabilt produktionspaket behöver ändå konkreta, godkända bilder och rörelser. Runway beskriver att bildreferensen bär bland annat komposition och ljus, medan texten främst bör beskriva rörelsen; fel i händer eller ansikten kan förstärkas i resultatet. [W2]

### Paulina, tatueringar och skuggor

- Använd visningsnamnet **Paulina**.
- Bevara gamla media-ID:n vid import eller gör en explicit engångsmappning från Pau/Paow. Gör ingen blind namnändring i alla filer.
- Ange exakt vilka tatueringar som ska synas på just Paulina. Kravet ska komma från aktuell vald referens, inte en allmän regel för alla dealers.
- Bedöm händerna i ankaren. En filmtext som nämner tatueringar löser inte ett felaktigt startmaterial.
- Behåll naturlig skuggning på kropp och kläder.
- Bestäm hur händer och armbågar faktiskt möter bordet.
- Hantera bordets kontaktskuggor så att de passar den valda geometrin och ljuset.
- Undvik både en kvarvarande mörk fläck från ett tidigare bord och en extra skugga ovanpå en redan inbakad.

Det gamla repots regler om fritt hängande armbågar är ett metodval som ska omprövas mot den scen ni vill bygga. [D7]

### GLB-material

- Inventera bord, sko och marker före användning.
- Kontrollera mått, axlar, pivot, material, texturer och eventuella animationer.
- Anpassa importerade objekt till scenens enheter.
- Använd enkla geometriska ersättare om materialet är dåligt.
- En GLB-fil kan innehålla en modell utan någon animation. Den säger inte i sig något om kvaliteten.
- Håll en vald modell på en tydlig plats i materialkatalogen; undvik flera aktiva kopior i olika mappar.

## 8. Runway och MCP: skriv detta tydligare i uppdraget

Runway skiljer på **Runway Dev MCP**, som hjälper kodagenten arbeta med utvecklarkontot och dokumentationen, och **Runway MCP för mediegenerering i chatten**. Genererings-MCP använder Runway-kontots krediter. Det är viktigt att veta vilken anslutning och vilket konto ett jobb använder. [W1]

För din lokala studio rekommenderar jag:

- Använd officiellt agentstöd för att läsa aktuell dokumentation och kontrollera modellernas indata.
- Lägg appens produktion bakom ett litet gemensamt leverantörsgränssnitt.
- Välj uttryckligen Developer API för appens automatiska jobb om du fortsätter med API-spåret.
- Tillåt även import av material som en agent producerat via en annan godkänd väg.
- Låt studion fungera när ingen agentchatt är öppen.
- Visa exakt prompt och faktiska bild-/videoreferenser före ett jobb.
- Spara task-ID, modell, parametrar, källor, resultat och tillgängliga kostnadsuppgifter.
- Spara pågående jobb så att en omstart inte leder till onödiga dubbla beställningar.
- Hämta modellernas aktuella förmågor. Utgå inte från att alla stöder startbild, slutbild och referensfilm samtidigt.
- Behandla exakta koordinater som något att styra, mäta och vid behov korrigera, inte något en lång textprompt garanterar.

En agentanslutning ger inte automatiskt studions knapp tillgång till samma verktyg. Den integrationen ska verifieras. Första pilotens importflöde kan vara enkelt; en fullständig köplattform behövs inte från början.

Länka till Runways aktuella dokumentation och agentguide i stället för att kopiera hela dokumentationssajten till repot. [W6]

## 9. En rimlig första leverans

**Första fungerande kedjan: Paulina delar två kort, återgår och samma förlopp fungerar i labbet och casinot.**

| Prov | Vad som ska visas |
| --- | --- |
| Lokal start | Ett startkommando öppnar den gemensamma arbetsytan. |
| Identitet | Rätt ansikte, kläder, händer och valda tatueringar genom kedjan. |
| Ankare | VILA → REDO → givning → REDO → VILA utan synligt oavsiktligt hopp. |
| Två kort | Kort ett ligger kvar när kort två kommer. Båda har avsedd plats och storlek. |
| Kontakt | Kortet följer greppet, vänds korrekt, släpps begripligt och ligger sedan still. |
| Samma scen | Samma kortplacering och uppspelning i labb och casino. |
| Riktigt motorvarv | Insats, utdelning, relevant spelarval och avräkning kommer från kärnan. |
| Dolt kort | Samma kort förblir dolt tills rätt reveal-signal. |
| Annan kamera | Samma givning till samma mål visas från minst en avsedd sidovy. Begränsningar redovisas. |
| Fortsatt spel | Meningsfulla kontrollfall för extra kort, split, skoreserv och avräkning skyddar migreringen. |

Visuell kvalitet bedöms både i full fart och bildruta för bildruta. Sätt toleranser för kontakt och skarvar utifrån vald upplösning och ett faktiskt granskat prov. Använd inte enbart ”5/5” som acceptanskriterium.

En ofärdig film får provas i labbet. Ett spelbart teknikprov kan använda tydligt märkta ersättningar. Det ska framgå vilket resultat som är tekniskt fungerande och vilket som är visuellt godkänt.

## 10. Dokumentation som hjälper nästa agent

Börja med få dokument med tydliga roller:

- **README.md:** syfte, start, vad som fungerar och karta över mapparna.
- **AGENTS.md:** korta aktuella arbetsregler och beroendegränser.
- **docs/architecture.md:** hur kärna, server, produktion, scen, labb och casino hänger ihop.
- **docs/production.md:** den aktuella vägen från referens till spelbar dealer.
- **docs/decisions.md:** viktiga beslut med datum och kort motivering.
- **docs/status.md:** vad som fungerar, kända begränsningar och nästa steg.
- **information/README.md:** vad bakgrundstexterna beskriver och vad som fortfarande är osäkert.

Tekniska värden och materialstatus ska bo i sina dataformat. Dokumentationen förklarar deras betydelse. Samma koordinat, klippval eller status ska inte behöva ändras manuellt i flera dokument.

Tester ska kontrollera relevanta beteenden: kärnans regler, dolt kort, avräkning, ordnade signaler, samma geometri och verkliga användarflöden. Undvik tester som främst låser en viss text, ett gammalt mappnamn eller implementationens exakta form.

## 11. Färdig ingångsprompt att ge den lokala agenten

*Texten nedan är ett nytt arbetsuppdrag. Anpassa bara sökvägarna till information, GLB, Dealer och Scoutgaming.*

---

# Uppdrag: bygg en sammanhängande lokal Dealer-studio

Jag vill bygga om mitt Dealer-projekt till en enklare lokal arbetsyta för att skapa och spela upp trovärdiga Blackjackdealers.

Första dealern heter **Paulina**, tidigare Pau/Paow. Slutmålet är en återanvändbar produktionsväg där en ny dealer kan börja från en bild eller beskrivning och sedan få ett godkänt materialpaket.

## Mål och avgränsning

- Bygg två huvudlägen: **Labbet** för skapande och granskning, **Casinot** för riktigt lokalt spel med testpengar.
- De ska använda samma scen, geometri, kameror, material och uppspelning.
- Bakgrund, bord och dealer ska kunna bytas. Kort, marker och sko ska kunna vara riktiga 3D-objekt.
- Börja lokalt med ett enkelt startkommando, gärna START.cmd.
- Avvakta med Vercel, publicering, lipsync, ljud, bot och operatörssystem.

## Läs mitt underlag

- Mappen information innehåller två relevanta samtal. Läs dem som bakgrund, skilj bekräftade krav från idéer och äldre antaganden.
- Mappen GLB innehåller bord, sko och marker. Bedöm kvalitet och mått; du behöver inte använda dåliga modeller.
- Granska Jakeminator123/dealer som källa till kod, material, försök och lärdomar.
- Granska relevanta spelregler och signaler i Jakeminator123/scoutgaming.
- Ange vilka versioner och lokala filer du faktiskt läst. Uppmärksamma arbete som ännu inte är incheckat.
- Mina aktuella instruktioner har företräde framför motsägande äldre projektråd.

## Återanvänd med omdöme

- Ta över den fristående Blackjackkärnan och värdefulla skydd kring sko, slump, dolt kort och avräkning.
- Börja med att kontrollera den portning som redan finns i Dealer.
- Välj en kärna och en gemensam adapter. Kopiera inte in hela Scoutgaming.
- Bevara den etablerade betydelsen av deal, reveal, turn, settle och idle. Tal kan vänta.
- Behåll användbar matematik, kortspårning, maskering, granskning och ursprungsinformation.
- Importera bara det som behövs för den första fungerande kedjan.
- Håll tidigare projekt utanför den aktiva arbetsytan. Inga repos i repos eller beroenden på gamla projektmappar.

## Gör grunden sammanhängande

- Skilj mellan spelarens plats, kortets utdelningsmål och betraktarens kamera.
- En givning till plats 4 ska fortfarande vara samma givning när kameran står vid plats 1.
- Definiera mått, axlar, kamera, sko, kortplatser och kontakt på ett ställe.
- Låt labb, beställningsbilder och casino läsa samma scenbeskrivning.
- Låt nodkartan visa samma ankare och klipp som uppspelningen använder.
- Använd en gemensam funktion för att välja referenser och bygga beställningar.
- Bevara kortidentitet och händelseordning när en sekvens repeteras eller återansluts.
- Håll spelutfall och ekonomiska effekter utanför filmproduktionen.

## Välj en realistisk visuell metod

- Börja gärna med 3D-bord, sko, kort och marker samt en fotorealistisk dealerfilm.
- Prova en enkel 3D-förlaga för att styra handens och kortets rörelse före generering.
- Var tydlig med skillnaden mellan en videoyta, flera matchande kamerafilmer och en verklig animerad 3D-dealer.
- Visa tidigt om metoden fungerar från de sidovyer jag vill använda.
- En böjd video ska inte beskrivas som att den återskapar personens osedda sidor.
- Använd gärna React Three Fiber. Återanvänd fungerande Three.js-delar när det passar.

## Paulinas identitet och material

- Utgå från mina aktuellt valda referenser för ansikte, hår, kläder, händer och tatueringar.
- Kontrollera vilka tatueringar som faktiskt ska finnas; gör inte gamla personregler till globala krav.
- Håll ankare och filmer knutna till rätt utseendeversion.
- Skilj naturlig skuggning på kroppen från skuggor som hör till ett visst bord.
- Gör hand-, armbågs- och kortkontakt trovärdig i den gemensamma scenen.
- Bevara ursprung vid import från Pau/Paow och använd Paulina som visningsnamn.
- En ny ankarruta får hämtas ur ett bra filmprov om den granskas, fryses och registreras tydligt.

## Produktion med Runway

- Läs officiell aktuell dokumentation och modellernas faktiska indata.
- Använd Runways agentstöd där det hjälper.
- Klargör om jobb går genom Developer API eller genererings-MCP och vilket konto de belastar.
- Bygg appens produktion bakom ett enkelt gemensamt gränssnitt.
- Studion ska kunna importera resultat och fungera utan en aktiv agentchatt.
- Visa exakt prompt, referenser och tillgänglig kostnadsuppskattning före produktion.
- Registrera modell, parametrar, referensversioner, task-ID och resultat.
- Håll budget och omtagningar inom min överenskomna ram.
- Lova inte pixelprecis handkontakt enbart från en textprompt; mät och granska resultatet.

## Arbetsordning

1. Beskriv först kort vad du vill skapa, vilka delar du vill återanvända och vilken visuell metod du föreslår.
2. Gör en konkret lista: ta med, bygg om, lämna kvar. Skriv ned väsentliga konflikter i underlaget.
3. Skapa en liten fungerande studio med gemensam scen och tydliga lägen.
4. Få Paulina, ett bord och en givkedja att fungera.
5. Visa två kort där det första ligger kvar, korrekt grepp och vridning samt en trovärdig retur.
6. Kör samma material via spelkärnan i Casinot.
7. Visa samma givning från en avsedd sidovy och bedöm om metoden räcker.
8. Utöka sedan till fler målplatser, extra kort, split och fler dealers.

Bygg vidare efter din korta inledning med rimliga egna beslut. Fråga när ett verkligt vägval ändrar målet, behöver saknat material eller överskrider min budget. Gör inga stora filmbeställningar innan metoden är prövad.

## Struktur och kvalitet

- Föreslå en enkel mappstruktur med tydliga ansvar.
- Börja gärna med en installation och en låsfil.
- Skriv kort aktuell dokumentation på ett ställe per ämne.
- Spara strukturerade fakta om scen, klipp och jobb i gemensamma format.
- Gör experiment lätta att prova, samtidigt som godkänt material kan skiljas från utkast.
- Verifiera migrerade spelregler och viktiga användarflöden med meningsfulla kontroller.
- Bedöm visuell kvalitet i rörelse och bildruta för bildruta.
- Rapportera tydligt vad som fungerar, vad som är uppskattat och vad som återstår.

Ge dig själv frihet i implementation och utseende. Var däremot precis om identitet, geometri, handkontakt, kameror och spelhändelser.

---

## 12. Källor

### Dealer – låsta till den granskade versionen

- **[D0]** [README och lokal körning](https://github.com/Jakeminator123/dealer/blob/2e3967c999750d27abd2517008206a5af1d7bcc0/README.md).
- **[D1]** [Spelkärna](https://github.com/Jakeminator123/dealer/blob/2e3967c999750d27abd2517008206a5af1d7bcc0/game/core.ts), [ursprung för portningen](https://github.com/Jakeminator123/dealer/blob/2e3967c999750d27abd2517008206a5af1d7bcc0/game/provenance.json) och [plats- och signalomvandling](https://github.com/Jakeminator123/dealer/blob/2e3967c999750d27abd2517008206a5af1d7bcc0/game/seats.ts).
- **[D2]** [Studions meny](https://github.com/Jakeminator123/dealer/blob/2e3967c999750d27abd2517008206a5af1d7bcc0/studio/components/shell/Rail.tsx) och [CasinoView](https://github.com/Jakeminator123/dealer/blob/2e3967c999750d27abd2517008206a5af1d7bcc0/studio/components/casino/CasinoView.tsx).
- **[D3]** [Kortplanen](https://github.com/Jakeminator123/dealer/blob/2e3967c999750d27abd2517008206a5af1d7bcc0/src/card-plan.ts) och [spelets kortplacering](https://github.com/Jakeminator123/dealer/blob/2e3967c999750d27abd2517008206a5af1d7bcc0/src/game-table.ts).
- **[D4]** [Den nya linsen](https://github.com/Jakeminator123/dealer/blob/2e3967c999750d27abd2517008206a5af1d7bcc0/src/table-lens.ts), [scenens kameror](https://github.com/Jakeminator123/dealer/blob/2e3967c999750d27abd2517008206a5af1d7bcc0/src/scene3d-view.ts) och [scenkontraktet](https://github.com/Jakeminator123/dealer/blob/2e3967c999750d27abd2517008206a5af1d7bcc0/data/scene-contract.json).
- **[D5]** [Produktionskommandot](https://github.com/Jakeminator123/dealer/blob/2e3967c999750d27abd2517008206a5af1d7bcc0/tools/produce.ts), [studions beställningsfunktioner](https://github.com/Jakeminator123/dealer/blob/2e3967c999750d27abd2517008206a5af1d7bcc0/studio/lib/bordet.ts) och [kandidatmodellen](https://github.com/Jakeminator123/dealer/blob/2e3967c999750d27abd2517008206a5af1d7bcc0/src/order-model.ts).
- **[D6]** [Promptmallar](https://github.com/Jakeminator123/dealer/blob/2e3967c999750d27abd2517008206a5af1d7bcc0/src/order-prompts.ts) och [metodregister](https://github.com/Jakeminator123/dealer/blob/2e3967c999750d27abd2517008206a5af1d7bcc0/data/order-methods.json).
- **[D7]** [Dealerstandard](https://github.com/Jakeminator123/dealer/blob/2e3967c999750d27abd2517008206a5af1d7bcc0/data/dealer-standard.json) och [dealeridentiteter](https://github.com/Jakeminator123/dealer/blob/2e3967c999750d27abd2517008206a5af1d7bcc0/data/dealers.json).
- **[D8]** [3D-värld och kalibrering](https://github.com/Jakeminator123/dealer/blob/2e3967c999750d27abd2517008206a5af1d7bcc0/dealer3d/src/world.ts) och [kortets 3D-bana](https://github.com/Jakeminator123/dealer/blob/2e3967c999750d27abd2517008206a5af1d7bcc0/dealer3d/src/deal.ts).

### Scoutgaming – låsta till den granskade versionen

- **[S1]** [Blackjackkärnan](https://github.com/Jakeminator123/scoutgaming/blob/90d6697c4850af773ee3128dfb6f79329bf86479/services/game/games/blackjack/core.mjs).
- **[S2]** [Presentationshändelser](https://github.com/Jakeminator123/scoutgaming/blob/90d6697c4850af773ee3128dfb6f79329bf86479/services/game/presentation/partner-presentation.mjs) och [maskinläsbart signalkontrakt](https://github.com/Jakeminator123/scoutgaming/blob/90d6697c4850af773ee3128dfb6f79329bf86479/packages/presentation/contracts/engine-signals.json).

### Officiell dokumentation – kontrollerad 18 november 2026

- **[W1]** [Runway Dev MCP](https://docs.dev.runwayml.com/guides/mcp/) och [Runway MCP för mediegenerering](https://help.runwayml.com/hc/en-us/articles/51931843164691-Connecting-to-Runway-MCP).
- **[W2]** [Runway Image to Video Prompting Guide](https://help.runwayml.com/hc/en-us/articles/48324313115155-Image-to-Video-Prompting-Guide).
- **[W3]** [React Three Fiber – introduktion](https://r3f.docs.pmnd.rs/getting-started/introduction).
- **[W4]** [Three.js VideoTexture](https://threejs.org/docs/pages/VideoTexture.html) och [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html).
- **[W5]** [Vite – introduktion](https://vite.dev/guide/).
- **[W6]** [Runways guide för kodagenter](https://dev.runwayml.com/learn/build-with-your-coding-agent) och [modellkatalog](https://docs.dev.runwayml.com/guides/models/).


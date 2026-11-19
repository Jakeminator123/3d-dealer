# Produktion: från en bild till en spelbar dealer

En linje, ingen annan ([beslut 2026-11-18](decisions.md)). Den är körd för Paulina ur vyn Spelaren. Det som är prövat i gamla projektet står i [underlaget](../information/underlag-inlasning-2026-11-18.md), avsnitt 4. Varje beställning, med modell, indata, text och kostnad, står i registret (`npm run reg -- sql "SELECT * FROM orders"`), och hur en fil gjordes i dess post (`npm run reg -- show <fil>`).

## Stegen

```
Scen -> Identitet -> Förlaga -> Ankare -> Film -> Granska -> Spela
```

| Steg | Vad som görs | Resultat |
| --- | --- | --- |
| Scen | Bord, sko, kortplatser och vyer väljs. | `content/scene.json` |
| Identitet | 4–6 bilder av dealern godkänns: ansikte, överkropp, händer, och en från sidan. | `assets/dealers/<dealer>/identity/` |
| Förlaga | Dockan gör cykeln i scenen, och scenen sparar den som film ur vyns närbild. | `output/forlagor/` |
| Ankare | En bildmodell sätter dealern i dockans ställning REDO, på grön skärm, med identitetsbilderna som referens. Ett ankare per vy. | `assets/dealers/<dealer>/anchors/` |
| Film | `tagning.ts forbered` gör paketet, agenten beställer genom Runways MCP-server, och `tagning.ts ta-emot` tar bort ljudet, mäter och registrerar. | Tagningar i `assets/dealers/<dealer>/clips/` |
| Granska | `ta-emot` prövar måtten mot gränsvärdena. En oberoende granskare ser tagningen i full storlek och sätter status. | `status` i registret |
| Spela | `runda.ts` spelar klippen i följd i scenen, med korten kvar på bordet. | En spelbar dealer |

Varje vy som ska visa dealern går igenom Förlaga, Ankare och Film för sig. Dockan och rörelsen är desamma, så samma giv ser ut som en rörelse ur alla vyer.

Labbets meny följer samma väg: Scen och Kortplan (Scen), Dealer (Identitet, Ankare och var serien står), Dockan (Förlaga, och en tagning förberedd), Klipp (Film mot dockan) och Granska; Spela är Casinot. Översikten säger vad som väntar på Jakob.

## Regler

- Ett kort per klipp, och varje klipp är en cykel: REDO → kortet läggs → REDO. Första och sista bilden är samma ställning, så klippen kan följa på varandra i vilken ordning som helst.
- Dockan är standarden: kortet hämtas där det står i scenens sko och läggs på platsens kortplats, kort 0 eller 1 (`content/scene.json`). Ingen bild och ingen film får flytta det.
- Förlagan styr väg, takt och vändning. Utseendet kommer ur ankaret. Blick och huvud styrs av bilderna och av textens ord om att blicken följer kortet.
- Dealern sitter intill bordet: underarmarna över filten och händerna en bit in på den.
- Händerna ska ha dockans storlek (`hand` i `content/doll.json`). Bildmodellerna ritar dem större; de krymps i efterarbetet.
- Kortet som syns i spelet är scenens 3D-kort. Filmen bär bara ett enfärgat märkkort: gult på baksidan, blått på framsidan. I luften målar scenen det som ett spelkort.
- Allt som inte är dealer, sko eller kort är en och samma gröna (`studio.colours.screen` i `content/scene.json`). Inga skuggor på det gröna. Skon finns alltså både i filmen och i scenen: sedd från platsen där filmen är gjord visas filmens sko, från andra vyer scenens.
- Kroppens egen skuggning stannar i filmen. Skuggan på bordet läggs av scenen. Aldrig båda.
- Filmen har inget ljud. Kling 4 lägger alltid på ljud; `ta-emot` tar bort det utan omkodning.
- Identiteten avgör vad som ska synas på dealern. För Paulina: tatueringar på hals, bröst och båda händerna.
- Takten står i cykelns fil i `content/moves/`. Produktionen använder `cykel-nyp-rask` (3,0 s), gjord efter en mätt verklig dealer: hon ser aldrig på skon, och vägen tillbaka är hälften så lång som vägen ut. I REDO ser dealern mot bordets mitt.

## Identitet

En dealer är en fil, `content/dealers/<id>.json`: namnet, orden om henne som texterna fylls med (hår, kläder, det som alltid ska synas, till exempel tatueringar), hennes identitetsbilder med vad var och en visar, och vyernas REDO-ankare. Formen och det som gäller när filen inte säger något (kläderna, pronomenet) står i `content/dealer.json`; ingen kod eller mall nämner en viss dealer. Var hon står: `node src/pipeline/dealer.ts <id>`, eller Labbets steg Dealer.

Vägen i ett stycke, för en ny dealer:

1. En bild av en person: `node src/pipeline/identitet.ts ny <id> "<Namn>" <bild> [<bild>] [--han]` skriver hennes fil och för in bilden som hennes källa. Skriv orden om henne i filen (`looks`) när de är kända.
2. Identitetsbilderna: `node src/pipeline/identitet.ts förbered <id>` gör beställningarna av ansikte, helkropp i dealerns kläder och händernas ovansida ur `content/identitet.json`. Agenten beställer dem i ordning genom Runways MCP-server (cirka 60 krediter), skriver `kvitto.json` och kör `node src/pipeline/identitet.ts ta-emot <paket>`. En oberoende granskare dömer dem (`npm run reg -- status`).
3. Ankaret ur Spelaren: `node src/pipeline/ankare.ts förbered <id> spelaren`, beställ de två bildstegen (cirka 30 krediter), `node src/pipeline/ankare.ts ta-emot <paket>`. En oberoende granskare dömer det, och `node src/pipeline/ankare.ts använd <id> spelaren <fil>` pekar ut det.
4. Provklipp: `node src/pipeline/tagning.ts forbered <id> spelaren 4 0`, beställ, `ta-emot`. Jakob väljer med ögat.
5. Serien (`content/dealer.json`, `series`): `tagning.ts forbered` för varje kort, ytterlägena först, och en oberoende granskare dömer varje omgång.
6. Spelbar: `node src/pipeline/runda.ts <id> spelaren --plan` säger att inget kort saknar klipp; Casinot spelar henne.

- Identitetsbilderna görs med Nano Banana Pro i 2K, i ordningen ansikte, helkropp, händer: helkroppen med ansiktet som referens och händerna med helkroppen, så att de är samma person. Inte prövat för en ny dealer.
- Texterna fungerar för en dealer utan tatueringar och för en man: det som gäller henne står som platshållare (`{handMarks?…}`, `{Her}`), fyllda ur hennes fil.

## Förlagan

- `node src/pipeline/shoot.ts <beställning.json>` sparar dockans ställningar som bilder och rörelsen som film ur en vys närbild. En webbläsare utan fönster ritar scenen, och en egen server startas på en ledig port. `tagning.ts forbered` gör det åt en tagning.
- Beställningens form står i `src/lab/shoot.ts`: vy (med `close` för närbilden), dealer, bakgrund eller ateljé, sko, kortplatser, stillbild eller klipp.
- Ateljén för ankare (`studio` i `content/scene.json`): grön skärm, bordet målat ljusare grönt och ett rutnät på filten, som visar filtens lutning för bildmodellen. Dockans händer är hudfärgade, så att bildmodellen läser dem som händer i rätt storlek.
- Filmen som rörelsereferens sparas i grå ateljé i 24 rutor/s, samma som Kling svarar i (`content/tagning.json`). Piloten, gjord med 30, hade ett ryck i takten: vart fjärde steg 1,49 gånger grannarnas (mätt; orsaken är antagen).

## Ankaret, steg för steg

Med cykeln behövs ett ankare per vy: REDO. Sista bilden är REDO med märkkortet målat på kortplatsen, och den görs av `tagning.ts`. Vägen är `src/pipeline/ankare.ts`, talen och texterna står i `content/ankare.json`, och de lokala stegen i `src/pipeline/ankarbild.ts`.

| Steg | Modell | Indata | Varför |
| --- | --- | --- | --- |
| Underlag | scenen (`ankare.ts förbered`) | dockans REDO ur vyns närbild i ateljén | Ögat och dockans punkter (grepp, kort, händer, bordskant) räknas genom det och står i paketet. |
| Ställning | Nano Banana Pro, 2K (från sidan: Nano Banana 2.1) | underlaget + identitetsbilderna (ansikte, helkropp, händer) | Håller underlagets geometri: sko, bordskant och kort inom 4 bildpunkter. Pro vände henne mot kameran i fyra försök av fyra från sidan. |
| Likhet | GPT Image 2.6 Sunburst, 2K | ställningens bild + ansiktsbilden: "ändra bara huvudet" | Nano Banana gav slätare ansikte och fel hårfärg. Har likheten flyttat sko eller bordskant läggs bara dess huvud på ställningen. |
| Lokalt | `ankare.ts ta-emot` | bildmodellernas två bilder | Händerna krymps till dockans hudyta (givhanden läggs där dockans fingrar rör kortet), bildmodellens kort tas bort och märkkortet målas där dockans står, allt grönt blir skärmens gröna, kläderna förs ned till bordskanten och det minsta lagas. Sedan mäts bilden mot underlaget. |

- `ta-emot` mäter skon, kortet, bordskanten, händernas hudyta bortom handleden mot dockans, det gröna, glipan vid bordskanten, hål i dealern och lösa fläckar mot gränserna i `content/ankare.json`, gör arket och för in ankaret (`att granska`, med ögat och skons läge), beställningarna ur `kvitto.json` och måtten. Ett mått utanför sin gräns underkänner inte ankaret, men det syns direkt.
- Prövat på råbilderna bakom `spelaren-redo-2.png` (`output/work/mall/prova-ankare-2.ts`): skon, bordskanten, det gröna, glipan och den vilande handen som i det godkända; givhandens skala 0,69 mot 0,71 för hand. Det som skiljer är lagningen, ett tredje betalt steg (Sunburst, 7 krediter) som `ta-emot` inte gör: utan den blir ärmen en klump ovanför den krympta givhanden och skon kring handen utsmetad, och måtten slår ut på skons silhuett och givhandens yta.
- När kortplanen ändras och närbilden räknas om står ögat kvar på samma plats: `node src/pipeline/ankare.ts öga <id> <vy>` för över vyns ankare till dagens öga med en homografi (mätt till 0,04 bildpunkter på dockan) och plattar skärmen, eftersom omsamplingen lämnar gröna ringar kring silhuetten (10 028 bildpunkter för `spelaren-redo-2.png`, 0 efter). Har dockans REDO ändrats, som blicken, görs huvudet om med likhetssteget (`output/work/ankare-3/`).
- Mätt 2026-11-18: Sunburst ensam flyttade bord och sko 30 bildpunkter och ritade händerna 1,2–1,3 gånger dockans, i tre försök med olika underlag. Ideogram 4.5 Precise Edit ritade om ansiktet till en annan person.
- Skriv "blonde" om håret. "Warm golden-blonde" gav orange hår i två modeller.
- Ge inte Nano Banana en identitetsbild som själv har bord och sko i bild (slaget `sida`): den kopierade den bildens uppställning i stället för underlagets. Med handnärbilden som referens har den också lagt händerna som spökbilder över bakgrunden; se efter i varje bild.
- Kavajen ska gå ned till bordskanten i ankaret. En glipa där visar rummet under kroppen i scenen.
- Tatueringar på en hand i en färdig bild: receptet står i den borttagna posten för `dealers/paulina/anchors/redo-nyp-tatuerad.png` (`npm run reg -- show`), och skripten i `output/work/nyp/`.
- Kostnad för ett ankare när receptet följs: cirka 30 krediter (20 + 9).
- En variant av ett färdigt ankare, där bara en del ändras: `node src/pipeline/ankare.ts variant <dealer> <vy> <namn>` gör paketet ur `variants` i `content/ankare.json` (text, modell, referensbilder i registret och område), och `variant-ta-emot <id> <bild> --task … --krediter … --saldo-fore … --saldo-efter …` lägger in bildmodellens bild bara inom området, med mjuk kant, plattar skärmen, mäter mot originalet (inget ändrat utanför området, skon, kortet, det gröna, glipan, den vilande handens storlek) och för in varianten som `att granska`, med `derivedFrom`. Vyns ankare pekas inte om. Området `vilande-arm` är dealerns vilande sida under axlarna; `hela` tar hela bilden. En förebild med en annan sko i bild ger Nano Banana den skon också (mätt 2026-11-19): måla bort skon i förebilden först.

## Filmen

1. `node src/pipeline/tagning.ts forbered <dealer> <vy> <plats|D> <kort> [deal|hole|flip] [--cykel <namn>] [--text <fil> | --textnamn <namn>]` gör paketet i `output/tagningar/<id>/`: första bilden (vyns REDO), sista bilden, dockans film, texten och `bestallning.json`. `D` är dealern: kort 0 är det öppna kortet, kort 1 hålkortet (`hole`, baksidan upp) som sedan vänds (`flip`).
2. Agenten laddar upp filerna och beställer med `generate_video` exakt som `bestallning.json` säger: Kling 4, 1080p, cykelns längd, `startFrame`, `endFrame` och dockans film som `referenceVideos`. Kostnaden står i registrets beställningar.
3. `node src/pipeline/tagning.ts ta-emot <id> <film> --task <taskId> --krediter <n> --saldo-fore <n> --saldo-efter <n>` tar bort ljudet, mäter klippet, gör ark och bevis i scenen, och för in klippet (`att granska`), beställningen och måtten i registret.

- Texten, gränsvärdena och bildfrekvensen står i `content/tagning.json`, och vyernas ankare och orden om dealern i `content/dealers/<id>.json`. Paketet görs genom ankarets eget öga (ankarets post i registret), så ett ankare gäller också när kortplanen har ändrats; hamnar kortplatsen utanför ankarets ruta vägrar `forbered`. Gränsvärdena är den oberoende granskarens, satta efter piloten. En cykel som med avsikt avviker från en gräns får sin egen i `content/tagning-justerad.json`, under cykelns id: originalet står kvar, och justeringen gäller bara när just den cykeln prövas (`src/pipeline/justerat.ts`).
- `ta-emot` mäter bland annat takten, skarven (klippet två gånger i rad), när och var kortet ligger (`lands`), handen utan handled mot dockans, skons rörelse och det gröna. Ett mått utanför sin gräns underkänner inte klippet, men det syns direkt.
- `node src/pipeline/tagning.ts mät-om <id>` mäter om ett mottaget klipp och gör om beviset i scenen, utan att röra filen, beställningen eller omdömet. Används när mätningen eller scenen har ändrats.
- Den vilande armen mäts i varje klipp (`src/pipeline/vila.ts`, visas utan gräns): handens tyngdpunkt och väg, fingrarnas form och armbågens kant, i bildpunkter och cm, med handen och armbågen letade i klippets första ruta.
- Rörelsens dynamik mäts för sig (`src/pipeline/rorelse.ts`), på dockans film vid `forbered` och på klippet vid `ta-emot`: hur länge hon står helt stilla, huvudets rörelse i vila, tvära stopp, knyck mot minsta ryck, att huvudet går före handen och att bålen landar efter. Kling kopierar dockans dynamik nästan exakt (mätt), så det som ska bli mjukt i filmen görs mjukt i dockan.
- `forbered … --referensklipp <klipp> [--roll referenceVideos|referenceVideo] --variant <ord> --textnamn <namn>` skickar ett godkänt klipp ur registret i stället för dockans film, som rörelsereferens eller som filmen som görs om, med en namngiven text ur `content/tagning.json` (`prompt.named`). Klippet ska göra samma kort ur samma ankare. Dockans film bakom det står kvar i paketet som `referens.mp4`, och klippet mäts mot den som förut. Varianten står i namnen, så att tagningen skiljs från serien. Prövat 2026-11-19 med båda rollerna: Kling följer ett färdigt klipp nästan ruta för ruta, så rörelsen ändras inte mätbart, och varje ny generation gör det gröna mörkare, så att skarven mot REDO blir sämre (mätt; talen står i texternas källor). Vägen till en naturligare rörelse går alltså fortfarande genom dockan.
- `forbered … --utan-referens --variant <ord>` skickar ingen film: rörelsen är filmmodellens egen, styrd av första och sista bilden och texten. Dockans film sparas ändå i paketet och klippet mäts mot den. `--sedan <plats-kort>[,…]` gör en följd, flera kort i samma tagning med REDO emellan: sista bilden har alla korten, och `ta-emot` mäter följden mot bilderna (`src/pipeline/foljd.ts`) i den ordning filmen lägger korten, som kan skilja från den givna (`order`, `lagdOrdning`): REDO mellan två läggningar mäts mot första bilden med de kort som då ligger ur sista bilden. Den klipper tagningen vid rutan närmast REDO i bitar (`bit-N.mp4`, var och en med kortet den lägger), mäter skarven när bitarna spelas i andra ordningar och rörelsen i varje bit, och spelar bitarna i scenen som klipp med var sitt kort (`i-scenen.mp4`). Ett kort som täcks eller försvinner efter att det lagts syns i dess minsta synliga andel, och ett dubblerat kort som blått utanför platserna. En följd bär sina kort i `cards` och aldrig `seat`, så att rundan inte tar den för ett kort. `--langd <s>` ger filmen en annan längd, och `--modell`, `--upplosning` och `--bilder referens` en annan modell, för en modell som inte tar första och sista bild med en referensfilm (då låser ingenting första och sista rutan). Prövat 2026-11-19; utfallet står i texternas källor (`fri`, `foljd-2`, `helfilm-8`, `tvahand-2`, `fri-referens`).
- I Labbets steg Dockan görs dockans del av det här utan terminalen: dockan gör en vald cykel till en vald plats, med kameran fri, och rörelsens värden står som reglage. En ändring sparas som en ny rörelse i `content/moves/` genom servern, som prövar den med samma läsare som resten och aldrig skriver över en rörelse som ett klipp, ett arkiverat klipp eller ett paket är gjort med. Dockans mått räknas där för värdena som de står, som `forbered` prövar dem, och Förbered tagningen kör `forbered` i servern. Ingenting beställs därifrån: paketet väntar på att agenten beställer det.
- Inför en ny rörelse, dealer eller vy görs provklipp som Jakob väljer mellan med ögat, innan en serie beställs.
- En serie beställs i omgångar: ytterlägena först, och en oberoende granskare dömer dem innan resten beställs.

## Spela

- `node src/pipeline/runda.ts <dealer> <vy> [--nara] [--plan]` tar cykelklippen ur registret i ordningen i `content/runda.json`, säger vilka kort som saknar klipp, och sparar hela given som film och ark i `output/forlagor/`.
- `runda.ts` spelar en runda som spelkärnan har delat, och `--fro <ord>` gör den möjlig att göra om. Varje kort väljer sitt klipp efter `seat`, `index` och `action`; saknas klippet läggs kortet utan dealerns rörelse, och utskriften säger vilka som saknades. En följd håller sig till klipp ur ett och samma REDO-ankare.
- Casinot, http://localhost:5310/casino/, spelar en runda mot spelkärnan i servern.
- En följd kan sluta i väntan: efter sista klippet spelas vänta-klippet (`action: "wait"`, `forbered <dealer> <vy> D 0 wait`) ett varv i taget i stället för att sista rutan hålls. Kommer ett kort mitt i ett varv går varvet klart först (högst `wait.most` i `content/runda.json`). Saknas klippet hålls sista rutan.
- I Labbet: steget Scen, där dealern "Hela given ur Spelaren" är förvald och spelar, och steget Kortplan, där bågen, dealerns rad och kortens storlek ställs med reglage. Kortet landar där handen lade det och glider sedan till sin plats i dagens plan (`card.onTable` i `content/scene.json`); var handen lägger kortet ändras bara av nya filmer.
- Uppspelningen är en följd (`src/scene/reel.ts`): klippen spelas utan glapp, scenens kort ligger kvar från att det landat, och mellan klippen hålls filmens sista ruta. `src/scene/round.ts` väljer klippen, lika för `runda.ts` och Labbet.

## Runway

- Generering går genom Runways MCP-server i agentchatten, på arbetsytan "Jakob". Regeln och ramen står i [AGENTS.md](../AGENTS.md).
- Kontots saldo delas med andra sessioner. Läs saldot direkt före och direkt efter en beställning, och gå i första hand efter verktygets kvitto. `ta-emot` för in beställningen; en beställning utanför den vägen förs in med `npm run reg -- order <beställning.json>`.
- En lokal fil laddas upp först (`init_upload`, `curl.exe` med adressen inom enkla citattecken i PowerShell, `complete_upload`) och ges som referens. Signaturen sparas inte (`origin` är publikt); en fil som behövs igen när adressen har gått ut laddas upp på nytt.
- Kontrollera modellens indata med `whoami` och verktygets beskrivning före varje ny typ av beställning.
- Verktygen svarar med hela texten och långa adresser. Beställningar görs av en underagent.

## Rörelser och underlag

- En rörelse för dockan läses ur de bästa verkliga klippen i gamla Dealer (Pamelas och Paos), som given till plats 4. Pamelas klipp till plats 1 och 7 är inte bra. local-studios "pamela" är inte gamla Dealers Pamela.
- local-studio har ingen 3D-modell av en dealer (sökt 2026-11-18, också i `Stortest.zip` och `C:\Users\jakem\Desktop\wow`). Dess "3D-dealer" är en platt film på ett nät med en bula för underarmarna, 0,46 m fram över bordet. Där finns Livs 44 klipp och Görans klipp till alla sju platser, som rörelsereferens.

## Visat och inte visat

| Fråga | Läge 2026-11-18 |
| --- | --- |
| Går filmens märkkort att ta bort så att scenens 3D-kort syns under handen? | Ja: det blå nycklas bort från den tid kortet ligger, och scenens kort syns under fingrarna. |
| Håller en cykel i ett klipp, dit och tillbaka? | Ja i piloten (plats 4, kort 0): kortet ligger stilla inom 1,2 bildpunkter, handen har ankarets bredd, och skon rör sig högst 1,29. Godkänd av oberoende granskare. |
| Går klippen att kedja? | Ja: piloten tre gånger i rad ger en skarv på 0,92 mot 1,58 mellan vanliga rutor, och kortet ligger kvar in i nästa klipp. |
| Blir händer och tatueringar rätt när ankaret görs ur scenens kamera? | Ja, efter krympning. Tatueringarna suddas i rörelseoskärpan mitt i klippet. Skuggning på bordet är inte gjord. |
| Går samma giv att göra från sidan? | Ja: cykeln till plats 4 ur Plats 7 är godkänd, med texten utökad med att högra handen ligger platt och stilla på bordskanten. Från sidan syns att skon hänger utanför bordskanten. |
| De andra platserna och andra kortet | Alla 14 ur Spelaren är godkända, i första tagningen (piloten gjordes om en gång för takten). Dealerns egna kort är inte gjorda. |
| En ny dealer genom samma kedja | Inte prövad. |
| Blir rörelsen naturligare med ett färdigt klipp som referens och en text om en van dealers kropp? | Nej (2026-11-19, två prov till plats 4): Kling kopierar klippet, handen i median 0,7 bildpunkter från originalet, och det gröna mörknar för varje generation, så första och sista rutan klarar inte gränsen mot REDO. |
| Gör modellen en egen rörelse utan referensfilm, med bara första och sista bilden? | Ja (2026-11-19): kortet landar rätt, och första och sista rutan ligger strax under gränsen mot REDO (32,7 och 32,1 dB mot 33). Två kort i en tagning landar båda rätt, men bitarna kedjar bara i filmad ordning. Om hon är mänskligare dömer Jakob. |
| Gör en text om den vilande armen att den lever? | Handen ja, armens vinkel nej (2026-11-19, fri cykel till plats 4): handen rör sig 1,5 cm mot 0,26, men armbågen ligger kvar, eftersom första och sista bilden låser den, och kortet vändes sent och det gröna gled över gränsen. Vinkeln ändras bara med ett nytt ankare (`ankare.ts variant`). |
| Går en rörelse att fånga ur film med MediaPipe Holistic? | Inte nypet och inte djupet (2026-11-19, på två egna klipp, mot gränser satta i förväg); kropp, armar och den bärande handen följer med. `output/work/mansklig-docka/prov-a/resultat.md`. |

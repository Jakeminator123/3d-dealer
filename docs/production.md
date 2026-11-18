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
- Takten står i `content/moves/cykel-nyp.json`: cykeln är 4,0 s.

## Förlagan

- `node src/pipeline/shoot.ts <beställning.json>` sparar dockans ställningar som bilder och rörelsen som film ur en vys närbild. En webbläsare utan fönster ritar scenen, och en egen server startas på en ledig port. `tagning.ts forbered` gör det åt en tagning.
- Beställningens form står i `src/lab/shoot.ts`: vy (med `close` för närbilden), dealer, bakgrund eller ateljé, sko, kortplatser, stillbild eller klipp.
- Ateljén för ankare (`studio` i `content/scene.json`): grön skärm, bordet målat ljusare grönt och ett rutnät på filten, som visar filtens lutning för bildmodellen. Dockans händer är hudfärgade, så att bildmodellen läser dem som händer i rätt storlek.
- Filmen som rörelsereferens sparas i grå ateljé i 24 rutor/s, samma som Kling svarar i (`content/tagning.json`). Piloten, gjord med 30, hade ett ryck i takten: vart fjärde steg 1,49 gånger grannarnas (mätt; orsaken är antagen).

## Ankaret, steg för steg

Med cykeln behövs ett ankare per vy: REDO. Sista bilden är REDO med märkkortet målat på kortplatsen, och den görs av `tagning.ts`.

| Steg | Modell | Indata | Varför |
| --- | --- | --- | --- |
| Ställning | Nano Banana Pro, 2K (från sidan: Nano Banana 2.1) | dockans bild + identitetsbilderna (ansikte, helkropp, händer) | Håller underlagets geometri: sko, bordskant och kort inom 4 bildpunkter. Pro vände henne mot kameran i fyra försök av fyra från sidan. |
| Likhet | GPT Image 2.6 Sunburst, 2K | förra bilden + ansiktsbilden: "ändra bara huvudet" | Nano Banana gav slätare ansikte och fel hårfärg. Från sidan klistras bara huvudet ur retuschen in. |
| Händer | lokalt, `krymp-hand.ts` | bilden | Händerna skalas 0,82 kring ärmen eller kortet. |
| Skärm | lokalt, `platta-gront.ts` | bilden | Bakgrund, bord och rutnät blir en grön. |

- Mätt 2026-11-18: Sunburst ensam flyttade bord och sko 30 bildpunkter och ritade händerna 1,2–1,3 gånger dockans, i tre försök med olika underlag. Ideogram 4.5 Precise Edit ritade om ansiktet till en annan person.
- Skriv "blonde" om håret. "Warm golden-blonde" gav orange hår i två modeller.
- Ge inte Nano Banana en identitetsbild som själv har bord och sko i bild, till exempel `identity/sida-kavaj-tatuerad.png`: den kopierade den bildens uppställning i stället för underlagets. Med handnärbilden som referens har den också lagt händerna som spökbilder över bakgrunden; se efter i varje bild.
- Kavajen ska gå ned till bordskanten i ankaret. En glipa där visar rummet under kroppen i scenen.
- De lokala skripten ligger i `output/work/giv-4/` (också `passa-ankare.ts`, som flyttar bilden så att skon hamnar där scenens sko står, och `flytta-ruta.mjs`, som flyttar en del av bilden). De hör hemma i `src/pipeline` när ett ankare görs för en dealer till.
- Tatueringar på en hand i en färdig bild: receptet står i den borttagna posten för `dealers/paulina/anchors/redo-nyp-tatuerad.png` (`npm run reg -- show`), och skripten i `output/work/nyp/`.
- Kostnad för ett ankare när receptet följs: cirka 30 krediter (20 + 9).
- Ankaret förs in med `npm run reg -- import <post.json>`, med `use: "dealerfilm"` och vyn det är gjort i, och pekas ut som vyns REDO i `content/tagning.json`.

## Filmen

1. `node src/pipeline/tagning.ts forbered <dealer> <vy> <plats|D> <kort> [deal|hole|flip] [--cykel <namn>] [--text <fil>]` gör paketet i `output/tagningar/<id>/`: första bilden (vyns REDO), sista bilden, dockans film, texten och `bestallning.json`. `D` är dealern: kort 0 är det öppna kortet, kort 1 hålkortet (`hole`, baksidan upp) som sedan vänds (`flip`).
2. Agenten laddar upp filerna och beställer med `generate_video` exakt som `bestallning.json` säger: Kling 4, 1080p, 4 s, `startFrame`, `endFrame` och dockans film som `referenceVideos`. 85 krediter (mätt).
3. `node src/pipeline/tagning.ts ta-emot <id> <film> --task <taskId> --krediter <n> --saldo-fore <n> --saldo-efter <n>` tar bort ljudet, mäter klippet, gör ark och bevis i scenen, och för in klippet (`att granska`), beställningen och måtten i registret.

- Texten, gränsvärdena, vyernas ankare och bildfrekvensen står i `content/tagning.json`. Gränsvärdena är den oberoende granskarens, satta efter piloten.
- `ta-emot` mäter bland annat takten, skarven (klippet två gånger i rad), när och var kortet ligger (`lands`), handen utan handled mot dockans, skons rörelse och det gröna. Ett mått utanför sin gräns underkänner inte klippet, men det syns direkt.
- `node src/pipeline/tagning.ts mät-om <id>` mäter om ett mottaget klipp och gör om beviset i scenen, utan att röra filen, beställningen eller omdömet. Används när mätningen eller scenen har ändrats.
- Rörelsens dynamik mäts för sig (`src/pipeline/rorelse.ts`), på dockans film vid `forbered` och på klippet vid `ta-emot`: hur länge hon står helt stilla, huvudets rörelse i vila, tvära stopp, knyck mot minsta ryck, att huvudet går före handen och att bålen landar efter. Kling kopierar dockans dynamik nästan exakt (mätt), så det som ska bli mjukt i filmen görs mjukt i dockan.
- Inför en ny rörelse, dealer eller vy görs provklipp som Jakob väljer mellan med ögat, innan en serie beställs.
- En serie beställs i omgångar: ytterlägena först, och en oberoende granskare dömer dem innan resten beställs.

## Spela

- `node src/pipeline/runda.ts <dealer> <vy> [--nara] [--plan]` tar cykelklippen ur registret i ordningen i `content/runda.json`, säger vilka kort som saknar klipp, och sparar hela given som film och ark i `output/forlagor/`.
- `runda.ts` spelar en runda som spelkärnan har delat, och `--fro <ord>` gör den möjlig att göra om. Varje kort väljer sitt klipp efter `seat`, `index` och `action`; saknas klippet läggs kortet utan dealerns rörelse, och utskriften säger vilka som saknades. En följd håller sig till klipp ur ett och samma REDO-ankare.
- Casinot, http://localhost:5310/casino/, spelar en runda mot spelkärnan i servern.
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

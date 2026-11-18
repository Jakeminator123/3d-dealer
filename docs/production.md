# Produktion: från en bild till en spelbar dealer

En linje, ingen annan ([beslut 2026-11-18](decisions.md)). Den är körd en gång: Paulinas giv till plats 4 ur vyn Spelaren. Det som är prövat i gamla projektet står i [underlaget](../information/underlag-inlasning-2026-11-18.md), avsnitt 4. Varje beställning, med modell, indata, text och kostnad, står i registret (`npm run reg -- sql "SELECT * FROM orders"`), och hur en fil gjordes i dess post (`npm run reg -- show <fil>`).

## Stegen

```
Scen -> Identitet -> Förlaga -> Ankare -> Film -> Granska -> Spela
```

| Steg | Vad som görs | Resultat |
| --- | --- | --- |
| Scen | Bord, sko, kortplatser och vyer väljs. | `content/scene.json` |
| Identitet | 4–6 bilder av dealern godkänns: ansikte, överkropp, händer, och en från sidan. | `assets/dealers/<dealer>/identity/` |
| Förlaga | Dockan gör rörelsen i scenen, och scenen sparar den ur vyns närbild: ställningarna som bilder och rörelsen som film. | `output/forlagor/` |
| Ankare | En bildmodell sätter dealern i dockans ställning, på grön skärm, med identitetsbilderna som referens. | `assets/dealers/<dealer>/anchors/` |
| Film | Filmmodellen får första bild, sista bild och dockans film som rörelsereferens. | Tagningar i `assets/dealers/<dealer>/clips/` |
| Granska | En oberoende granskare ser varje tagning i full storlek, mot dockans lägen och reglerna nedan. Måtten mot dockan tas med `output/work/giv-4/mat-ankare.ts` och förs in med `npm run reg -- measure`. | `status` i registret |
| Spela | Tagningen läggs på den vikta ytan i scenen genom vyns närbild, och scenens kort läggs på kortplatsen. | En spelbar dealer |

Varje vy som ska visa dealern går igenom Förlaga, Ankare och Film för sig. Dockan och rörelsen är desamma, så samma giv ser ut som en rörelse ur alla vyer.

## Regler

- Ett kort och en handling per klipp. Ett klipp börjar och slutar på en stillbild, aldrig på en ruta ur en annan film.
- Dockan är standarden: kortet hämtas där det står i scenens sko och läggs på platsens första kortplats (`content/scene.json`). Ingen bild och ingen film får flytta det.
- Förlagan styr väg, takt och vändning. Utseende och slutläge kommer ur ankarna. Blick och huvud styrs av första och sista bilden, och av textens ord om att blicken följer kortet.
- Dealern sitter intill bordet: underarmarna över filten och händerna en bit in på den.
- Händerna ska ha dockans storlek (`hand` i `content/doll.json`). Bildmodellerna ritar dem större; de krymps i efterarbetet.
- Kortet som syns i spelet är scenens 3D-kort. Filmen bär bara ett enfärgat märkkort: gult på baksidan, blått på framsidan.
- Allt som inte är dealer, sko eller kort är en och samma gröna (`studio.colours.screen` i `content/scene.json`). Inga skuggor på det gröna. Skon finns alltså både i filmen och i scenen; sedda ur filmens öga sammanfaller de när bilden är inpassad.
- Kroppens egen skuggning stannar i filmen. Skuggan på bordet läggs av scenen. Aldrig båda.
- Filmen har inget ljud. Kling 4 lägger alltid på ljud; det tas bort utan omkodning, och importen tar inte emot en film med ljud.
- Identiteten avgör vad som ska synas på dealern. För Paulina: tatueringar på hals, bröst och båda händerna.
- Takten: släp-givarna i gamla provet tar 4 s och ska gå dubbelt så fort (Jakob 2026-11-18). Nyp-given här är 4 s.

## Förlagan

- `node src/pipeline/shoot.ts <beställning.json>` sparar dockans REDO, LAGT och VILA som bilder i ateljén, och given som film, ur en vys närbild. En webbläsare utan fönster ritar scenen, och en egen server startas på en ledig port.
- Beställningens form står i `src/lab/shoot.ts`: vy (med `close` för närbilden), dealer, bakgrund eller ateljé, sko, kortplatser, stillbild eller klipp. `output/work/giv-4/gor-bestallning.mjs <namn> <vy>` skriver beställningarna för en vy, med ateljéns färger.
- Ateljén för ankare (`studio` i `content/scene.json`): grön skärm, bordet målat ljusare grönt och ett rutnät på filten, som visar filtens lutning för bildmodellen. Dockans händer är hudfärgade, så att bildmodellen läser dem som händer i rätt storlek.
- Filmen som rörelsereferens sparas i grå ateljé, 30 rutor/s.

## Ankaret, steg för steg

| Steg | Modell | Indata | Varför |
| --- | --- | --- | --- |
| Ställning | Nano Banana Pro, 2K | dockans bild + identitetsbilderna (ansikte, helkropp, händer) | Håller underlagets geometri: sko, bordskant och kort inom 4 bildpunkter. |
| Likhet | GPT Image 2.6 Sunburst, 2K | förra bilden + ansiktsbilden: "ändra bara huvudet" | Nano Banana gav slätare ansikte och fel hårfärg. Sunburst träffar likheten och lät geometrin vara. |
| Händer | lokalt, `krymp-hand.ts` | bilden | Händerna skalas 0,82 kring ärmen eller kortet. |
| Kort | lokalt, `mala-kort.ts` | bilden + dockans korthörn | Det lagda märkkortet målas enfärgat där dockans kort ligger. |
| Skärm | lokalt, `platta-gront.ts` | bilden | Bakgrund, bord och rutnät blir en grön. |

- Mätt 2026-11-18: Sunburst ensam flyttade bord och sko 30 bildpunkter och ritade händerna 1,2–1,3 gånger dockans, i tre försök med olika underlag. Ideogram 4.5 Precise Edit ritade om ansiktet till en annan person.
- Skriv "blonde" om håret. "Warm golden-blonde" gav orange hår i två modeller.
- Ge inte Nano Banana en identitetsbild som själv har bord och sko i bild, till exempel `identity/sida-kavaj-tatuerad.png`: den kopierade den bildens uppställning i stället för underlagets. Med handnärbilden som referens har den också lagt händerna som spökbilder över bakgrunden; se efter i varje bild.
- Har bildmodellen flyttat skon, passas bilden in: `output/work/giv-4/passa-ankare.ts` flyttar bilden så att skon hamnar där scenens sko står (dess sökning efter skon ska bytas mot den i `mat-ankare.ts`), och `flytta-ruta.mjs` flyttar en del av bilden.
- Tatueringar på en hand i en färdig bild: receptet står i den borttagna posten för `dealers/paulina/anchors/redo-nyp-tatuerad.png` (`npm run reg -- show`), och skripten i `output/work/nyp/`.
- De lokala skripten ligger tills vidare i `output/work/giv-4/`. De hör hemma i `src/pipeline` när receptet har hållit för en dealer till.
- Kostnad för ett ankare när receptet följs: cirka 30 krediter (20 + 9).
- Ankaret förs in med `npm run reg -- import <post.json>`, med `use: "dealerfilm"` och vyn det är gjort i, till exempel `"view": { "kind": "plats", "seat": 7 }`.

## Filmen

- Kling 4, 1080p, 4 s: första bild, sista bild och dockans film ur samma vys närbild som `referenceVideos`. 85 krediter (mätt).
- Texten utgår från gamla projektets bästa för nyp till plats 4, med tillägg om att blick, huvud och överkropp följer kortet. Den står i tagningens post i registret, och samma text används för nästa vy.
- Filmen kommer i 24 rutor/s. Dockans film är 30.
- Tagningen förs in som ankaret, och dess post får `"lands": { "seat": 4, "index": 0, "at": 3.0 }`: platsen, vilket av platsens kort, och tiden i filmen då kortet ligger. Från den tiden tar Labbet bort märkkortets blå och lägger scenens kort där.

## Runway

- All generering går genom Runways MCP-server i agentchatten, på arbetsytan "Jakob", aldrig genom API-nycklar. Ramen står i [AGENTS.md](../AGENTS.md).
- Kontots saldo delas med andra sessioner. Läs saldot direkt före och direkt efter en beställning; annars går kostnaden inte att skilja ut. Beställningen förs in med `npm run reg -- order <beställning.json>` (fälten står i `Order` i `src/pipeline/registry.ts`): kostnaden är mätt bara när båda saldona är givna och skillnaden är krediterna.
- En lokal fil laddas upp först (`init_upload`, `curl.exe` med adressen inom enkla citattecken i PowerShell, `complete_upload`) och ges som referens. En tidigare Runway-bild pekas ut med sitt `taskId`. Adressen förs in med `npm run reg -- upload <lokal fil> <adress> [assetId]`. Signaturen sparas inte (`origin` är publikt); en fil som behövs igen när adressen har gått ut laddas upp på nytt.
- Kontrollera modellens indata med `whoami` och verktygets beskrivning före varje ny typ av beställning.
- Verktygen svarar med hela texten och långa adresser. Upprepade beställningar görs av en underagent.

## Rörelser och underlag

- En rörelse för dockan läses ur de bästa verkliga klippen i gamla Dealer (Pamelas och Paos), som given till plats 4. Pamelas klipp till plats 1 och 7 är inte bra.
- local-studio har ingen 3D-modell av en dealer (sökt 2026-11-18, också i `Stortest.zip` och `C:\Users\jakem\Desktop\wow`). Dess "3D-dealer" är en platt film på ett nät med en bula för underarmarna, 0,46 m fram över bordet. Där finns Livs 44 klipp (VILA → REDO, REDO → REDO, REDO → VILA och VILA → VILA per plats) och Görans klipp till alla sju platser, som rörelsereferens.

## Visat och inte visat

| Fråga | Läge 2026-11-18 |
| --- | --- |
| Går filmens märkkort att ta bort så att scenens 3D-kort syns under handen? | Ja, sett ur Spelaren: det blå nycklas bort från den tid kortet ligger, och scenens kort syns under fingrarna. |
| Blir händer, tatueringar och skuggning rätt när ankaret görs ur scenens kamera? | Händer och tatueringar ja, efter krympning. Skuggning på bordet är inte gjord. |
| Hamnar kortet där scenen säger? | Ja ur Spelaren: tagningens kort ligger inom 2 bildpunkter från dockans, och i scenen inom kortplatsens kontur. |
| Håller handens tatuering genom rörelsen? | Nej: mellan cirka 1,2 och 2,7 s syns bara svaga fingertecken. |
| Går samma giv att göra från sidan? | Dockan ja. Paulinas ankare och film ur Plats 7 pågår. |
| Vägen tillbaka, de andra platserna, dealerns egna kort | Dockan lägger kort på plats 1–7. Inga ankare eller filmer gjorda. |
| En ny dealer genom samma kedja | Inte prövad. |

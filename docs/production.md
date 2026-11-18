# Produktion: från en bild till en spelbar dealer

Kedjan är körd en gång i den här studion: Paulinas giv till plats 4 ur vyn Spelaren, 2026-11-18. Vad som är visat och vad som inte är det står sist. Det som är prövat i gamla projektet står i [underlaget](../information/underlag-inlasning-2026-11-18.md), avsnitt 4.

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
| Granska | En oberoende granskare ser varje tagning i full storlek, mot dockans lägen och kraven. | `status` i registret |
| Spela | Tagningen läggs på den vikta ytan i scenen genom vyns närbild, och scenens kort läggs på kortplatsen. | En spelbar dealer |

Varje vy som ska visa dealern går igenom Förlaga, Ankare och Film för sig. Dockan och rörelsen är desamma, så samma giv ser ut som en rörelse ur alla vyer.

## Regler

- Ett kort och en handling per klipp.
- Ett klipp börjar och slutar på en stillbild, aldrig på en ruta ur en annan film.
- Dockan är standarden: kortet hämtas där det står i scenens sko och läggs på platsens första kortplats (`content/scene.json`). Ingen bild och ingen film får flytta det.
- Förlagan styr väg, takt och vändning. Utseende och slutläge kommer ur ankarna.
- Dealern sitter intill bordet: underarmarna över filten och händerna en bit in på den.
- Händerna ska ha dockans storlek (17,5 cm). Bildmodellerna ritar dem större; de krymps i efterarbetet.
- Blick och huvud styrs av första och sista bilden, och av textens ord om att blicken följer kortet.
- Kortet som syns i spelet är scenens 3D-kort. Filmen bär bara ett enfärgat märkkort: gult på baksidan, blått på framsidan.
- Allt som inte är dealer, sko eller kort är en och samma gröna (RGB 2, 182, 48). Inga skuggor på det gröna.
- Kroppens egen skuggning stannar i filmen. Skuggan på bordet läggs av scenen. Aldrig båda.
- Filmen har inget ljud. Kling 4 lägger alltid på ljud; det tas bort utan omkodning.
- Identiteten avgör vad som ska synas på dealern. För Paulina: tatueringar på hals, bröst och båda händerna.
- Takten: släp-givarna i gamla provet tar 4 s och ska gå dubbelt så fort (Jakob 2026-11-18). Nyp-given här är 4 s.

## Förlagan

| Vad | Kommando |
| --- | --- |
| Dockans REDO, LAGT och VILA som bilder i ateljén, och given som film, ur en vys närbild | `node src/pipeline/shoot.ts <beställning.json>` |

- Beställningens form står i `src/lab/shoot.ts`: vy (med `close` för närbilden), dealer, bakgrund eller ateljé, sko, kortplatser, stillbild eller klipp.
- Ateljén för ankare: skärm (2, 182, 48), bordet målat ljusare grönt, rutnät om 10 cm på filten. Rutnätet visar filtens lutning för bildmodellen.
- Filmen som rörelsereferens sparas i grå ateljé, 30 rutor/s.
- En webbläsare utan fönster ritar scenen; en egen server startas på en ledig port.

## Ankaret, steg för steg

| Steg | Modell | Indata | Varför |
| --- | --- | --- | --- |
| Ställning | Nano Banana Pro, 2K | dockans bild + identitetsbilderna (ansikte, helkropp, händer) | Håller underlagets geometri: sko, bordskant och kort inom 4 bildpunkter. |
| Likhet | GPT Image 2.6 Sunburst, 2K | förra bilden + ansiktsbilden: "ändra bara huvudet" | Nano Banana gav slätare ansikte och fel hårfärg. Sunburst träffar likheten och lät geometrin vara. |
| Händer | lokalt | bilden | Händerna skalas 0,82 kring ärmen eller kortet. |
| Kort | lokalt | bilden + dockans korthörn | Det lagda märkkortet målas enfärgat där dockans kort ligger. |
| Skärm | lokalt | bilden | Bakgrund, bord och rutnät blir en grön. |

- Mätt 2026-11-18: Sunburst ensam flyttade bord och sko 30 bildpunkter och ritade händerna 1,2–1,3 gånger dockans, i tre försök med olika underlag. Ideogram 4.5 Precise Edit ritade om ansiktet till en annan person.
- Skriv "blonde" om håret. "Warm golden-blonde" gav orange hår i två modeller.
- Ge inte Nano Banana en identitetsbild som själv har bord och sko i bild: den kopierade den bildens uppställning i stället för underlagets.
- Skripten för de lokala stegen ligger tills vidare i `output/work/giv-4/` (`mat-ankare.ts`, `krymp-hand.ts`, `mala-kort.ts`, `platta-gront.ts`). De hör hemma i `src/pipeline` när receptet har hållit för en dealer till.
- Kostnad för ett ankare när receptet följs: cirka 30 krediter (20 + 9).

## Filmen

- Kling 4, 1080p, 4 s: första bild, sista bild och dockans film som `referenceVideos`. 85 krediter (mätt).
- Texten utgår från gamla projektets bästa för nyp till plats 4, med tillägg om att blick, huvud och överkropp följer kortet. Den står i tagningens post i registret.
- Filmen kommer i 24 rutor/s. Dockans film är 30.

## Runway

- Produktionen går genom Runway MCP i agentchatten och drar på webbkontots krediter.
- Kontots saldo delas med andra sessioner. Läs saldot direkt före och direkt efter en beställning; annars går kostnaden inte att skilja ut.
- En lokal fil laddas upp först (`init_upload`, `curl`, `complete_upload`) och ges som referens. En tidigare Runway-bild pekas ut med sitt `taskId`.
- Kontrollera modellens indata med `whoami` och verktygets beskrivning före varje ny typ av beställning.
- Verktygen svarar med hela texten och långa adresser. Upprepade beställningar görs av en underagent.

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

## Helfiguren, ett sidospår

Natten till 2026-11-18 gjordes Paulina som sittande helfigur på grönt i local-studios ruta (`content/figure-frame.json`, `src/pipeline/helfigur.ts`, `anchors/vila-helfigur-bord.png`, `redo-helfigur-bord.png` och `reference/films/paulina-helfigur-vila-redo.mp4`, 104 krediter). Den går att visa i scenen men är inte förlagan: bilden är platt, så från sidan syns den som en kuliss, och i den skalan står hon 10–15 % för stor mot bordet.

# Produktion: från en bild till en spelbar dealer

Metoden är beslutad men inte körd i den här studion än. Det som är prövat är prövat i det gamla projektet; se [underlaget](../information/underlag-inlasning-2026-11-18.md), avsnitt 4.

## Stegen

```
Scen -> Identitet -> Ankare -> Förlaga -> Film -> Granska -> Spela
```

| Steg | Vad som görs | Resultat |
| --- | --- | --- |
| Scen | Bord, sko, kortplatser och kamera väljs. | En scenbeskrivning i `content/` |
| Identitet | 4–6 bilder av dealern godkänns: ansikte, överkropp, händer. | `assets/dealers/<dealer>/identity/` |
| Ankare | Scenen renderar en bild ur kameran med bord och sko på plats. En bildmodell sätter dealern i den, med identitetsbilderna som referens. | VILA och REDO i `assets/dealers/<dealer>/anchors/` |
| Förlaga | Scenen renderar en docka som gör rörelsen från skon till platsen, ur samma kamera. | En kort film per klipp |
| Film | Filmmodellen får första bild, sista bild och förlagan som referensfilm. | Tagningar |
| Granska | Varje tagning ses i full fart och ruta för ruta, bredvid förlagan. | Godkänd eller inte |
| Spela | Godkända klipp spelas i Labbet och Casinot genom samma uppspelning. | En spelbar dealer |

## Regler

- Ett kort och en handling per klipp.
- Ett klipp börjar och slutar på en stillbild, aldrig på en ruta ur en annan film.
- Förlagan styr väg, takt och vändning. Utseende, sko och slutläge kommer ur bilderna.
- Takten: släp-givarna i gamla provet tar 4 s och ska gå dubbelt så fort (Jakob 2026-11-18).
- Förlagan ska sluta som sista bilden: samma sida av handen upp, fingrarna på kortet.
- Blick och huvud styrs av första och sista bilden.
- Kortet som syns i spelet är scenens 3D-kort. Filmen bär bara ett enfärgat markörkort.
- Kroppens egen skuggning stannar i filmen. Skuggan på bordet läggs av scenen. Aldrig båda.
- Identiteten avgör vad som ska synas på dealern. För Paulina: tatueringar på hals, bröst och båda händerna.

## Runway

- Produktionen går genom Runway MCP i agentchatten och drar på webbkontots krediter.
- Studion skriver en beställning (modell, text, bilder, förlaga, kostnad). Agenten kör den efter Jakobs ja, och studion importerar resultatet.
- Studion spelar allt importerat material utan att en chatt är öppen.
- Kontots saldo delas med andra sessioner. Läs saldot direkt före och direkt efter en beställning; annars går kostnaden inte att skilja ut.
- Bilder görs med samma anslutning (`generate_image`). En lokal bild laddas upp först och ges som referens.
- Modell för givar: Kling 4, den som tar första bild, sista bild och referensfilm i samma anrop. Kontrollera modellens indata med `whoami` och verktygets beskrivning före varje ny typ av beställning.

## Att pröva först

| Prov | Fråga |
| --- | --- |
| Markörkortet | Går filmens enfärgade kort att ta bort så att scenens 3D-kort syns under handen? |
| Ankare ur scenen | Blir händer, tatueringar och skuggning rätt när bilden görs ur scenens kamera? |
| Sidoprovet | Håller vecket när samma giv ses från plats 1, eller behövs egna filmer per kameragrupp? |

Om sidoprovet, efter Jakob 2026-11-18:

- Gamla provet bad bildmodellen om "35 graders vinkel", utan koppling till en spelarplats. Här tas vinkeln ur scenens kamera för en bestämd plats, så att den blir exakt och går att göra om.
- Egna filmer från sidan kräver identitetsbilder från sidan: ansikte och kropp, stående och sittande. De finns inte än och är inte beställda.

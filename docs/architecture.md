# Arkitektur

## Grundregeln

En scen i verkliga meter är källan till allt. Bord, sko, kortplatser och kameror beskrivs en gång, i `content/`. Labbet, beställningarna och Casinot läser samma beskrivning, och pixlar räknas alltid ur den.

## Lager

```
[Bakgrund]  360-bild som ett rum med golv
[Bord]      3D: bord, sko, kort, marker
[Dealer]    film på grön skärm, gjord ur scenens kamera och vikt vid bordskanten
```

- Bakgrund, bord och dealer kan bytas var för sig.
- Kort, marker och sko är egna 3D-objekt.
- Dealern är film på grön skärm, gjord i närbilden av en vy med scenens bord framför sig. Det gröna nycklas bort, och filmen läggs tillbaka genom samma öga och viks vid bordskanten: kroppen står upprätt på kanten och händerna ligger på filten.
- Dockan är dealerns rörelse i 3D: en vit provdocka som gör given i scenens mått. Hon är lika för alla dealers och syns ur vilken vy som helst. Ur henne sparas förlagan, och efter henne görs ankare och filmer.

## Vem läser vem

```
lab ────┐
        ├──> scene ──> engine (bara signalernas typer)
casino ─┘
pipeline ──> scene
server ───> engine, pipeline
```

| Mapp | Gör | Gör inte |
| --- | --- | --- |
| `src/engine` | Regler, sko, slump, pengar, signaler | Känner inte till bild, film eller scen |
| `src/scene` | Ritar scenen och spelar upp klipp och signaler | Avgör inga kort eller utfall |
| `src/lab` | Stegen Scen, Dealer, Klipp, Granska, Spela | Har ingen egen scen eller uppspelning |
| `src/casino` | En riktig runda från vald plats | Har ingen egen scen eller uppspelning |
| `src/pipeline` | Förlaga, beställning, import, granskning | Spelar inte, avgör inget i spelet |
| `src/server` | Lokal spelsession, filer, jobb | Har ingen logik som hör till kärnan |

Pilarna är importer. Labbet och Casinot når servern över HTTP (`/api`, `/media`, `/thumb`), inte genom import. Gränserna prövas av `src/boundaries.test.ts`.

Signalernas typer och den publika vyn bor i `src/engine/seats.ts`. Webbläsarens kod läser dem bara med `import type`, så att ingenting ur kärnan laddas där; kärnan själv ska köras i servern. Ingen kod utanför `src/engine` läser kärnan än. En plats läses ur `seat` eller `target`. Fältet `family` bär gamla namn (`box<n>`) och används inte.

## Tre platser som hålls isär

| Begrepp | Betyder |
| --- | --- |
| Spelarplats | Var personen sitter och spelar (1–7) |
| Utdelningsmål | Var dealern lägger kortet |
| Kameravy | Varifrån scenen betraktas |

Att byta kamera ändrar aldrig kortets plats, rörelsen som spelas eller utfallet.

## När vyn flyttas

| Del | Vad den är | När vyn flyttas |
| --- | --- | --- |
| Bakgrund | 360-bild som ett rum med golv | Rummet förskjuts som ett rum gör. |
| Bord, sko, kort, marker | 3D-föremål i meter | Ritas om ur den nya vinkeln. Ingenting böjs. |
| Docka | 3D-figur i meter | Ritas om ur den nya vinkeln, med samma rörelse och samma kortplats. |
| Dealer | Film på en vikt yta, gjord i en viss vys närbild | Ur den vyn är filmen bilden som den är. Ur en annan vy följer händerna filten, men kroppen är platt. |

- Varje vy som ska visa dealern får därför sin egen film, gjord efter dockan sedd ur den vyn. Samma giv ser då ut som en och samma rörelse ur alla vyer, och kortet läggs på samma ställe i scenen.
- Mellan vyerna byts film. Filmer från olika vinklar vävs inte ihop: två filmer av en person i rörelse ger dubbla konturer.
- En dealer i äkta 3D är inte planen. Modellen i `glb/` saknar fingerleder och ser inte ut som film. Det som är 3D i dealern är dockan, och hon syns aldrig i spelet.

## Orden

| Ord | Betyder |
| --- | --- |
| Scen | Bord, sko, kortplatser och kameror i meter. En beskrivning. |
| Identitet | De godkända bilderna som bär en dealers likhet: ansikte, kläder, händer. Spelas aldrig. Ersätter keystone. |
| Ankare | En gjord stillbild som klipp börjar och slutar på, aldrig en ruta ur en film. Tre slag: VILA (båda händerna på filten), REDO (handen på kortet i skon) och LAGT n (handen vid plats n med kortet just lagt; n är 1–7 eller D för dealern). VILA och REDO hette A1 och A2 i gamla projektet. Ett ankare är gjort för en vy: dealern på grön skärm i vyns närbild, i dockans ställning. |
| Klipp | En film mellan två ankare som gör en sak. Det skrivs från→till: REDO→LAGT 4 är ett kort till plats 4, LAGT 4→REDO vägen tillbaka. Nyp eller släp är en egenskap hos klippet. Ett klipp finns i en tagning per vy. |
| Docka | Den vita provdockan som gör dealerns rörelser i scenen, lika för alla dealers. Hennes mått står i `content/doll.json` och rörelserna i `content/moves/`. Kortet hämtas där det står i skons mynning och läggs på platsens första kortplats: det är standarden för var kort hämtas och läggs. |
| Förlaga | En bild eller film som scenen sparar ur en vy, för att visa ställningen eller rörelsen innan den riktiga filmen görs. Förlagan för ett klipp är dockan som gör rörelsen. |
| Närbild | Samma öga som en vy, riktat mot dealern och inzoomat på hennes arbetsyta. Rutan en dealerfilm görs i, och ögat den läggs tillbaka genom. |
| Ateljé | Scenen utan rum mot enfärgad skärm, med bordet enfärgat och ett rutnät på filten: så sparas underlagen för ankare. |
| Märkkort | Kortet i filmen: enfärgat gult på baksidan och blått på framsidan, utan valör. Kortet som syns i spelet är scenens. |
| Tagning | Ett försök att göra ett klipp. En tagning granskas och blir godkänd eller inte. |
| Signal | Det spelkärnan säger har hänt: deal, reveal, turn, settle, idle. Kärnan säger också speak, dealerns repliker; den hoppas över tills ljudet tas i bruk. |
| Veck | Linjen vid bordskanten där dealerfilmen viks från upprätt till liggande. |
| Ta bort | Radera: filen finns inte kvar. |
| Arkivera | Flytta: filen finns kvar på ett annat ställe, i dag `output/work/struket/`. `node src/pipeline/import.ts stryk` arkiverar. |

Kartan över ankare och klipp ritas ur klippregistret. Den har ingen egen lista.

## Koordinater

x åt höger i bild, y uppåt, z mot kameran, filten på y = 0, allt i meter. Scenens tal står i `content/scene.json`, vart och ett märkt mätt eller antaget med sin källa. Det som går att räkna ur dem räknas i `src/scene/geometry.ts`, och dockans ställningar i `src/scene/dollPose.ts`.

## Vyerna

| Vy | Vad den är |
| --- | --- |
| Spelaren | Spelarens öga mitt för bordet (`player` i `content/scene.json`): vyn man spelar i. |
| Plats 1–7 | Samma sorts öga flyttat till platsen. Plats 4 är Spelaren. |
| Närbilden av en vy | Samma öga, inzoomat på dealern (`film.reach`). Dealerns filmer görs här. |

Gamla projektets lins (`camera` i `content/scene.json`) är ingen vy. Bordskanten och kortplatserna är mätta genom den, och spelarens öga ritar dess ruta.

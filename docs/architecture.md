# Arkitektur

## Grundregeln

En scen i verkliga meter är källan till allt. Bord, sko, kortplatser och kameror beskrivs en gång, i `content/`. Labbet, beställningarna och Casinot läser samma beskrivning, och pixlar räknas alltid ur den.

## Lager

```
[Bakgrund]  360-bild på en böjd fond
[Bord]      3D: bord, sko, kort, marker
[Dealer]    film som viks vid bordskanten
```

- Bakgrund, bord och dealer kan bytas var för sig.
- Kort, marker och sko är egna 3D-objekt.
- Dealern är film. Filmen viks vid bordskanten: kroppen står upprätt bakom kanten och händerna ligger på filten. Då följer händerna bordet när kameran flyttas.

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

Signalernas typer och den publika vyn bor i `src/engine/seats.ts`. Webbläsarens kod läser dem med `import type`, så att ingenting ur kärnan laddas där; kärnan själv körs i servern. En plats läses ur `seat` eller `target`. Fältet `family` bär gamla namn (`box<n>`) och används inte.

## Tre platser som hålls isär

| Begrepp | Betyder |
| --- | --- |
| Spelarplats | Var personen sitter och spelar (1–7) |
| Utdelningsmål | Var dealern lägger kortet |
| Kameravy | Varifrån scenen betraktas |

Att byta kamera ändrar aldrig kortets plats, rörelsen som spelas eller utfallet.

## När vyn flyttas

Planen, inte prövad än:

| Del | Vad den är | När vyn flyttas |
| --- | --- | --- |
| Bakgrund | 360-bild runt scenen | Vrids med vyn. Den ser böjd ut bara när den visas som platt bild. |
| Bord, sko, kort, marker | 3D-föremål i meter | Ritas om ur den nya vinkeln. Ingenting böjs. |
| Dealer | Film på en vikt yta | Händerna följer filten. Kroppen är platt och håller bara inom en viss vinkel. |

- Hur stor vinkeln får bli avgörs av sidoprovet i [production.md](production.md).
- Räcker inte vecket för ytterplatserna görs egna filmer per kameragrupp (till exempel vänster, mitt och höger), filmade ur scenens kamera för platsen. Mellan grupperna byts film. Filmer från olika vinklar vävs inte ihop: två filmer av en person i rörelse ger dubbla konturer.
- En dealer i äkta 3D är inte planen. Modellen i `glb/` saknar fingerleder och ser inte ut som film.

## Orden

| Ord | Betyder |
| --- | --- |
| Scen | Bord, sko, kortplatser och kameror i meter. En beskrivning. |
| Identitet | De godkända bilderna som bär en dealers likhet: ansikte, kläder, händer. Spelas aldrig. Ersätter keystone. |
| Ankare | En gjord stillbild som klipp börjar och slutar på, aldrig en ruta ur en film. Tre slag: VILA (båda händerna på filten), REDO (handen på kortet i skon) och LAGT n (handen vid plats n med kortet just lagt; n är 1–7 eller D för dealern). VILA och REDO hette A1 och A2 i gamla projektet. |
| Klipp | En film mellan två ankare som gör en sak. Det skrivs från→till: REDO→LAGT 4 är ett kort till plats 4, LAGT 4→REDO vägen tillbaka. Nyp eller släp är en egenskap hos klippet. |
| Förlaga | En film som scenen renderar med en docka, för att visa rörelsen innan den riktiga filmen görs. |
| Tagning | Ett försök att göra ett klipp. En tagning granskas och blir godkänd eller inte. |
| Signal | Det spelkärnan säger har hänt: deal, reveal, turn, settle, idle. Kärnan säger också speak, dealerns repliker; den hoppas över tills ljudet tas i bruk. |
| Veck | Linjen vid bordskanten där dealerfilmen viks från upprätt till liggande. |

Kartan över ankare och klipp ritas ur klippregistret. Den har ingen egen lista.

## Koordinater

x åt höger i bild, y uppåt, z mot kameran, filten på y = 0, allt i meter. Scenens tal står i `content/scene.json`, vart och ett märkt mätt eller antaget med sin källa. Det som går att räkna ur dem räknas i `src/scene/geometry.ts`.

# Överlämning: kedjan för plats 4

Skriven 2026-11-18 för en ny chatt. Läget i stort står i [docs/status.md](../docs/status.md); här står bara det som hör till det här delmålet.

## Mål

Det första filmprovet i den här studion: Paulina ger ett kort till plats 4 och går tillbaka, med tatuerade händer hela vägen. Ett kort och en handling per klipp. Jakob valde detta 2026-11-18 framför en film på cirka 15 s till alla sju platser (prövat i gamla projektet: 0 användbara av 7 för cirka 3 500 krediter).

Klippen, skrivna från→till. LAGT 4 är ankaret för handen vid plats 4 med kortet just lagt (beslutat 2026-11-18, se [docs/decisions.md](../docs/decisions.md)).

```
VILA -> REDO -> LAGT 4 -> REDO
                LAGT 4 -> VILA
```

## Det som finns

| Sak | Fil | Läge |
| --- | --- | --- |
| VILA, tatuerad | `assets/dealers/paulina/anchors/vila.png` | godkänd |
| REDO med nyp, tatuerad | `assets/dealers/paulina/anchors/redo-nyp-tatuerad.png` | att granska; gjord 2026-11-18, receptet står i dess post i registret |
| Dockfilmer till plats 4 (nyp) | `assets/reference/films/giv-p4-nyp-docka-1.mp4`, `-2.mp4` | Jakob: "bra" |
| Tagningar gjorda ur dem, otatuerade | `giv-p4-nyp-docka-1-tagning.mp4`, `-2-tagning.mp4` | Jakob: "jättebra", "bra" |
| Gamla filmhandboken | [filmhandbok-gamla-dealer.md](filmhandbok-gamla-dealer.md) | kopia av `tools/film-prompting.md` ur gamla Dealer vid `2d303b57` |
| Metoder och vad som höll | [underlag-inlasning-2026-11-18.md](underlag-inlasning-2026-11-18.md), avsnitt 4 och 7 | |

- Runway är inkopplat genom MCP, arbetsytan "Jakob". Saldot var 5 372 krediter 2026-11-18 efter ankaret (kontot delas med andra sessioner).
- Riktmärket är 300 krediter i timmen. Sedan 2026-11-18 beställer agenten utan att fråga och redovisar efteråt; se [AGENTS.md](../AGENTS.md).
- Jakobs ord om referensfilmerna står i registret, fältet `comment`.

## Saknas

- Slutbilden vid plats 4 med tatuerad hand. Gamla projektet har en otatuerad "sista bild" för nyp till plats 4 (sök under `assets/proofs/giv-forlagefilm-2` och `data/orders` där). Den kan föras in och få tatueringar på samma sätt som REDO med nyp fick.
- Referensfilm för vägen tillbaka (LAGT 4 → REDO och LAGT 4 → VILA). Dockfilmerna visar bara vägen dit.
- Ett klipp VILA → REDO. Gamla bankens klipp är inte införda.
- Uppspelning av klipp i scenen. Scenen byggs i en annan chatt; tagningarna kan tills vidare granskas som filmer i Labbets Granska.

## Öppet

- Om returen håller som egen film för Paulina. Den höll för Pamela och är oprövad för Paulina; faller den finns tur och retur kvar.
- Takten. Jakob vill ha släp-givarna dubbelt så snabba som gamla provets 4 s. Om nyp-givarna sa han inget.
- Om tatueringarna håller genom ett klipp när både första och sista bilden har dem. Det är provets huvudfråga.
- Vad en tagning kostar i dag. Gamla projektet mätte cirka 85 krediter per tagning med dockfilm som referens. Läs verktygets beskrivning och saldot före första beställningen.
- Ankarna är i gamla rutan (1764 × 1174 på grönt, skon inbakad). Det är samma kamera som scenen utgår från, men skon i filmen och 3D-skon i scenen blir två.

## Startprompt

```
Läs AGENTS.md, README.md, docs/status.md och information/overlamning-kedja-plats-4-2026-11-18.md.
Förbered kedjan för plats 4: ta reda på vad som saknas (slutbilden vid plats 4, vägen tillbaka, VILA till REDO),
och gör klippen ett i taget. Redovisa modell, indata och kostnad för varje beställning efteråt.
Avgör själv det som går att avgöra, och låt en oberoende granskare döma det du gör.
```

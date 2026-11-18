# Läget

Senast ändrad 2026-11-18, kväll. Ersätt det som inte längre gäller. Antal och listor står inte här: fråga registret.

## Var vi står

Den första serien finns och spelas: Paulina delar två kort till var och en av de sju platserna (14 klipp ur vyn Spelaren, godkända på mätta krav). Jakob har sett dem och sagt att korten och handlederna är bra, men att rörelsen är stel och hackig. Dockan har därför fått en mänskligare dynamik, skon står på bordet, kortplanen är en båge, och ankaret är nytt. Nästa serie görs när Jakob har valt mellan provklippen. Vilka klipp som spelas: `node src/pipeline/runda.ts paulina spelaren --plan`.

## Finns

- Produktionslinjen, körd för en hel serie: dockans cykel → REDO-ankare på grönt → Kling 4 → mätning och oberoende granskning → följd i scenen. Se [production.md](production.md).
- Dockan (`src/scene/doll.ts`, `dollPose.ts`, `content/doll.json`, `content/moves/`): cykeln REDO → kortet lagt → REDO för plats 1–7 och kort 0–2, och dealerns öppna kort, hålkort, vändning och extrakort. Hon andas, leder med blick och bål, och står aldrig frusen. Måtten på dynamiken: `src/pipeline/rorelse.ts`.
- Tagningens väg (`src/pipeline/tagning.ts`, `matning.ts`, `content/tagning.json`): `forbered`, `ta-emot` och `mät-om`, med mått mot gränsvärden och bevis i scenen.
- Spelkärnan driver uppspelningen (`src/scene/round.ts`, `reel.ts`, `src/server/game.ts`): varje utdelat kort väljer sitt klipp, och kort utan klipp läggs utan dealerns rörelse. Casinot (http://localhost:5310/casino/) spelar en runda mot spelkärnan, och `runda.ts` sparar en runda med frö som film.
- Scenen (`src/scene`, `content/scene.json`): bord, sko på bordet, kortplanen som båge, rum med golv; vyerna Spelaren, Plats 1–7 och närbilden av var och en. Kortet visar sin valör från vändningen, och korten och handen skuggar filten. Tolv rum är godkända.
- Labbet (http://localhost:5310/lab/): Scen (hela given), Kortplan (bågen, dealerns rad och kortens storlek med reglage, sparade i `content/scene.json`) och Granska (registret med omdömen, Jakobs ord och agentens svar).
- Paulina ur Spelaren: ankaret `spelaren-redo-2.png` (nya geometrin, öppna ögon, godkänt) och det äldre `spelaren-redo.png` med sina 14 klipp. Ur Plats 7: ankaret `plats-7-redo.png` och en godkänd cykel till plats 4, på den gamla geometrin.
- Registret (`content/register.db`): posterna med öga, sko och landningsplats, omdömenas historik, beställningarna med kostnad, uppladdningarna, mätningarna och det som har lämnat registret. Vägen dit är `npm run reg` (`npm run reg -- hjälp`); reglerna står i [AGENTS.md](../AGENTS.md).
- Servern (`src/server`): svarar bara på localhost och startar om sig själv när dess kod ändras. `npm start` och `npm stop` ([README.md](../README.md)).
- Spelkärnan (`src/engine`): förd över ur gamla Dealer med sju testfiler; ursprung och avvikelser står i `src/engine/provenance.json`.
- Prov: `npm test`, `npm run typecheck`, och `npm run reg -- check` för `assets/` mot registret.
- En sida för mobilen med filmer och läge, privat för Jakob: källan ligger i `output/work/mobilsida/`.

## Finns inte än

- Den nya serien: spelarnas två kort, dealerns öppna kort, hålkortet, vändningen och vänta-klippet, och sedan dealerns extrakort och spelarnas tredje kort (9 klipp). Fem provklipp finns (A, B, C, A2, D, alla plats 4 kort 0); D är filmat med den förra bågen, så dess kort glider 5,9 cm efter landningen.
- Serier ur andra vyer. Ankaret ur Plats 7 är gjort på den gamla geometrin och görs om först.
- Det som händer mellan givarna: samla in kort, betala ut, marker.
- Djup i filmen, så att kameran kan flyttas med parallax. Dockans djup kan ge det; inte prövat.
- De lokala stegen för ett ankare (krympa händer, platta det gröna) som kod i `src/pipeline`. De ligger som skript i `output/work/giv-4/`.
- Labbets steg Dealer, Klipp och Spela.

## Omdömen

Agenten dömer efter oberoende granskning, och Jakob ändrar det han vill i Labbet: http://localhost:5310/lab/#granska. Rörelsens naturlighet dömer Jakob själv, på provklipp, innan en serie beställs. Läget frågas ur registret:

- antal per grupp och status: `npm run reg -- summary`;
- det som väntar: `npm run reg -- queue`, och `npm run reg -- list <grupp> "granska igen"`;
- det produktionslinjen inte använder, och vad som föreslås för var och en: `npm run reg -- unused`;
- det som lämnades utanför, arkiverades eller togs bort, med hela posten: `npm run reg -- show <fil>` (arkiverade filer ligger i `output/work/arkiv/`).

Tre bakgrunder och fyra material har `utgår` och tas bort vid nästa arbetspass, om Jakob inte har ändrat omdömet. Identitetsbilden `original-sida-kavaj.png` har också `utgår` men står kvar så länge en annan post pekar på den som sin källa.

## Näst

1. Jakob ser provklipp D (`output/work/rorelse/provklipp-forut-a-a2-d.mp4` och `provklipp-d-tre-varv.mp4`, också på mobilsidan) och säger ja, nej eller vad som ska ändras. Mätt fryser D aldrig (2,1 % av tiden helt stilla, mot 12,4 % förut).
2. Serien med D: 17 paket ligger förberedda (`output/tagningar/paulina_spelaren_cykel-nyp-flytande_*`): spelarnas två kort utom plats 4 kort 0, dealerns öppna kort, hålkortet, vändningen och vänta-klippet. Beställ ytterlägena först och låt en oberoende granskare döma dem. När serien är godkänd arkiveras de 14 äldre klippen.
3. Mätningen för sidovyer, och ett nytt ankare och en serie ur Plats 7 på den nya geometrin.
4. Labbets steg Dealer, Klipp och Spela, och det som händer mellan givarna.

## Öppet

- Om GitHub-arkivet ska vara publikt. Där ligger privata samtal, uppgifter om Runway-kontot och en värdering av Scout Gaming, och spelkärnan är kopierad ur Scoutgaming. Ingenting pushas utan Jakobs ord; lokala `main` ligger före `origin/main`.
- Krediterna: kontot delas med Codex arbete i gamla Dealer. En hel serie på 26 klipp kostar cirka 2 200 krediter.
- Kortplanens tal och kortens storlek: valda av agenten, ställbara av Jakob i Labbets steg Kortplan.
- Skon: bakkanten vilar på bordets trälist, eftersom filten bakom korten är smalare än skon. Från filmens egen vy visas filmens sko, som saknar scenskons mässingsram.
- En film av en verklig dealer skulle ge dockan en mänsklig förlaga, och kunde prövas som drivande film i Kling 3 Motion Control. Jakob har fått frågan.
- Om `dealers/paulina/anchors/vila.png`, det sista ankaret i gamla rutan, ska stå kvar: skons passning i `content/scene.json` och dealerns kropp i `src/scene/geometry.test.ts` är mätta i den. Ingen kod läser filen.
- Om nyp eller släp blir Paulinas grepp. Cykeln här är nyp.
- Om Spelarens avstånd (`player` i `content/scene.json`) är rätt. Det är valt av agenten efter Jakobs ord om att bord och dealer ska skjutas samman. Som jämförelse står local-studios öga 1,48 m över golvet, cirka 0,68 m över filten (vårt: 0,60).
- Om bordsmodellens skala stämmer. local-studios bord är 297,0 × 141,8 × 84,5 cm; vårt är 2,10 m långt (`table.model` i `content/scene.json`).
- Att spelkärnan följer Scoutgamings kod token för token är gamla Dealers uppgift. Jämförelsen är inte körd om här.

# Överlämning 2026-11-18

Skriven för en ny agent som tar över. Läget står i [docs/status.md](../docs/status.md), besluten i [docs/decisions.md](../docs/decisions.md) och reglerna i [AGENTS.md](../AGENTS.md). Här står det som inte står där: vad som pågår, vad som är näst och varför, och fällorna.

## Vad Jakob vill, med hans ord

- "Vi måste ha en och samma typ av vinkel": dealern framifrån, rummet bakom henne, en stor del av bordsytan. "Vi kan justera bordsvinkeln något", gärna en "optisk illusion, som jag har löst bättre i till exempel Dealer".
- "Allt måste dock sitta med koordinater och hur allt delas ut."
- "jag ser ingen bordskant", och han kan inte zooma i scenen med mushjulet.
- "Varför har jag inte fått någon video eller bilder som kan ta oss framåt vad gäller 3D?" Han vill se resultat, inte frågor: "Jag vill inte behöva ta manuella beslut hela tiden."
- Skon är inget problem nu. Den får tas bort ur scenen om den stör.
- En universell vit docka som rörelseförlaga, lika för alla dealers: "På så sätt skulle vitmodellen kunna användas av vilken ny dealer som helst." Rörelsen kan läsas ur de bästa verkliga klippen per plats (Pamelas och Paos i gamla Dealer); så gjordes dockfilmerna till plats 4, som höll. Dockfilmer saknas för de andra sex platserna, dealern och vägen tillbaka. Pamelas klipp till plats 1 och 7 är inte bra.
- Bakgrunderna är "för inzoomade". Samma orsak som golvet: gamla linsens smala bildvinkel.
- Han pekade på `C:\Users\jakem\dev\super-feature-sg\local-studio` för 3D-modeller av en dealer. Mätt 05:52: där finns inga 3D-filer, varken på disk eller i `Stortest.zip`. Inte heller i `C:\Users\jakem\Desktop\wow`, som dess dokument pekar på. Det som fanns lästes av en underagent (fil och rad står i dess rapport i den gamla chatten):
  - "3D-dealern" där är en platt film på ett tätt nät med en handkalibrerad bula för underarmarna (0,46 m fram över bordet) och bortnycklat grönt. Ingen personmodell, ingen djupkarta, ingen arm med leder.
  - Deras egna dokument säger att fria sidovyer kräver en riggad 3D-modell eller ny film; filmen lovar ingen kontakt från sidan.
  - Värt att låna: underarmsbulan, så att armarna når ut över bordet; `GroundedSkybox` för rum med golv; deras mått som jämförelse (bord 297,0 × 141,8 × 84,5 cm, ögat 1,48 m över golvet, alltså cirka 0,68 m över filten).
  - Slutsats: för sidoplatserna återstår egna filmer per kameragrupp, gjorda med en docka som förlaga ur den vinkeln. En riggad docka med fingerleder finns inte någonstans; `glb/paow/` har en rigg med 24 leder utan fingrar.

## Vägvalet 05:58: gör som local-studio

Jakob pekade på `C:\Users\jakem\dev\super-feature-sg\local-studio`, och där finns den bild han vill ha (se `verification/goran-3d-salong.jpg` där):

- Dealern filmas i helfigur på grönt, framifrån, utan bord och utan sko i bilden (1920 × 1080, 6 s). Ett riktigt 3D-bord med vall står framför, så att magen hamnar under bordet och armarna syns. Rummet är byggt i 3D, kameran är spelarens öga, och man zoomar med mushjulet.
- Kortet blir ett 3D-kort i det ögonblick handen släpper det.
- Dealern Liv har 44 klipp där, ordnade som här: Plats n · VILA → REDO, REDO → REDO, REDO → VILA, VILA → VILA. Göran har klipp till alla sju platser. De är filmer, inga 3D-modeller, men de kan vara rörelsereferens för Paulina om hennes ankare görs i samma ruta.
- Jakob preciserade 06:06: helfiguren i 3D-scenen är **förlagan**, inte slutfilmen. "2D-videosarna är betydligt bättre än de här 3D-videosarna." Kedjan blir:

```
3D-scen med helfigur (Liv eller Paulina) och bord, sko, rum
  -> referensbilder och koordinater ur en vald kamera
  -> ankare för den kameran (bildmodell, identitetsbilderna som referens)
  -> referensfilm: helfigurens klipp renderat ur samma kamera
  -> vanlig film (dealern med bordet i bild), första och sista bild plus referensfilmen
  -> spelas i scenen genom samma kamera, så att korten hamnar rätt
```

- Kameror att pröva, enligt honom "möjligtvis": en ovanför henne och en lite nedanför, så att man ser upp mot henne.
- Paulinas VILA i helfigur i Livs ruta är beställd (se Pågår). Den är till för förlagan. De gamla ankarna med bordskant i bild är alltså inte bara referens; nya ankare av det slaget ska göras ur scenen.
- Lyftet av bakgrunden är fel väg, säger Jakob: kameran ska stå kvar i ögonhöjd och vinklas så att man ser in i rummet. Andra varvet på scenen gör det; sätt lyftet till 0 när den nya kameran håller.
- Namnen där (Liv, Göran, och ett "pamela" som inte är Dealers Pamela) hör inte hit. Kopiera det som behövs, registrera ursprunget, och ta inga id:n eller nycklar därifrån.
- Läs där före nästa steg: `blackjack-studio/docs/` (`SKAPARLAGE.md`, `LOKALA-STUDION.md`, `STATUS.md`), `blackjack-studio/scene/`, `blackjack-studio/experiments/avatar-pilot/` och `KALIBRERING.md`.

## Pågår när detta skrivs

| Vad | Var | När den är klar |
| --- | --- | --- |
| "Scenen, andra varvet" (punkt 1 nedan), startat 05:48. Reglaget Lyft, siktet för platsvyerna och motiveringsrutan i steget Scen är klara och sedda. | underagent i den gamla chatten, skriver i `src/scene`, `src/lab/SceneStep.tsx`, `content/scene.json` | Se efter i webbläsaren och i `output/scen-matning/`. Starta inte samma arbete en gång till. |
| Sidobilden med tatuerade händer är gjord (`identity/sida-kavaj-tatuerad.png`, 40 krediter). En granskare dömer den. | underagent i den gamla chatten | Omdömet och svaret står i registret när den är klar. |
| Paulinas VILA i helfigur på grönt, i Livs ruta (betald, högst cirka 100 krediter) | underagent i den gamla chatten, skriver `assets/dealers/paulina/anchors/vila-helfigur.png` och dess post | Låt en oberoende granskare döma den. Sedan REDO i samma ruta, och ett första klipp med ett av Livs klipp som referensfilm. |

Kontrollera med filernas ändringstid om de är klara. Rör inte samma filer medan de arbetar.

## Näst, i ordning

1. **Scenen, andra varvet: en kamera som är spelarens öga.**
   - Varför det ser fel ut i dag: scenens kamera är gamla linsen, som ser 25° nedåt genom en smal bildvinkel (28°). Rutans överkant ligger 11° under horisonten, så bakom dealern syns bara golv, och bordets hitre kant ryms inte. Dealern i ankarbilden är däremot ritad nästan framifrån.
   - Linsen är bara svaret på frågan hur de gamla ankarbilderna ska läggas på den vikta ytan. Den ska finnas kvar för det, men vara en vy man väljer, inte den man ser först.
   - Gamla Dealers spel visade scenen genom en annan kamera ("kontraktets"): 493 mm över filten, 2,5° nedåt, 67° bildvinkel, och bordsmodellen lutade 3,6°. Läs hur spelet där satte ihop rum, dealer och bord innan du väljer. Det är troligen Jakobs "optiska illusion".
   - Ett räknat utgångsläge, inte prövat i bild: ögat 0,60 m över filten, 1,84 m från dealerns bordskant, 14° nedåt, 50° bildvinkel. Då hamnar horisonten cirka 22 % ned i rutan, dealerns hjässa 15 % ned, bordskanten mot dealern 58 % ned, och filten syns från 0,74 m framför ögat.
   - Lutas bordet några grader mot spelaren kring dealerns bordskant (filt, kort, filmens liggande del och sko tillsammans) syns mer filt och händerna trycks ihop mindre. Vinkeln ska stå i `content/scene.json`.
   - Samma sorts kamera för alla sju platser. Mushjulet ska zooma och musen vrida från vilken vy som helst.
   - Kontrollen från filmkameran (99,7 % samma bildpunkter som ankaret) ska fortsatt gå igenom när bordet inte lutas.
2. **Döm bakgrunder, material och modeller i scenen** (29 poster med `att granska`). En granskare ser varje bakgrund i den nya vyn och sätter status med skäl.
3. **Ny VILA ur scenen**: rendera bord och sko ur den nya kameran, låt en bildmodell sätta Paulina i bilden med identitetsbilderna som referens. Krav från Jakob, osäkert: lägre i bild, mer av armarna, magen in under bordskanten. Det är provet "Ankare ur scenen" i [docs/production.md](../docs/production.md).
4. **Kedjan för plats 4**: se [overlamning-kedja-plats-4-2026-11-18.md](overlamning-kedja-plats-4-2026-11-18.md). Görs den med de gamla ankarna blir den i gamla rutan; avgör om den ska vänta på punkt 3.
5. **Labbets steg Dealer, Klipp och Spela.** Jakob frågar efter dem. Dealer är närmast: identitet och ankare per dealer, ur registret. Spela kräver klipp och en spelsession i servern.

## Verktyg

| Kommando | Gör |
| --- | --- |
| `npm run dev` | Servern och Labbet på http://localhost:5310/lab/. Serverkod laddas inte om: starta om efter ändringar i `src/server` eller `src/pipeline`. |
| `npm test`, `npm run typecheck` | 120 tester och typkontrollen, gröna 2026-11-18 05:25. |
| `npm run judge -- queue` | Kön av det Jakob gett `granska igen`. `status` och `reply` skriver omdöme och svar. |
| `STUDIO_DATA=<mapp>` och `PORT` | Kör servern mot en kopia. Använd det för allt som klickar eller skriver. |

- Runway går genom MCP (`user-Runway`), arbetsytan "Jakob". Saldot var 5 372 krediter 05:17. Uppladdning: `init_upload`, `curl.exe` med adressen i enkla citattecken, `complete_upload`. En tidigare Runway-bild pekas ut med `taskId` och behöver inte laddas upp.
- En OpenAI-nyckel finns i miljön. Den är inte använd, och Jakob har inte bett om det.
- Receptet för att lägga tatueringar på en hand i en färdig bild står i registret, posten `dealers/paulina/anchors/redo-nyp-tatuerad.png`. Skripten ligger i `output/work/nyp/` (utanför Git).

## Fällor

- Klicka aldrig på Labbets omdömesknappar som agent, och skriv aldrig i motiveringsrutan: det sparas med Jakobs namn i det riktiga registret.
- Jakob använder Labbet medan agenter arbetar. Registret kan ändras mellan två läsningar; läs det på nytt före varje skrivning.
- Det en agent själv har gjort ska dömas av en annan. Granskaren hittade ett tecken på tummen som jag hade missat.
- PowerShell tolkar grav accent och dollartecken i `node -e`. Skriv skript till fil.
- Gamla Dealer (`C:\Users\jakem\dev\super-feature-sg\dealer`) läses bara. En annan agent arbetar där och dess HEAD flyttar sig.
- Bordsmodellens skala stämmer troligen inte med kameran: skon hänger 4–7 cm utanför kanten mot dealern, och kortplatserna ligger inom 0,45 m från dealern på ett bord som är 1,5 m djupt. Jakob: rätta det sist.
- Git finns sedan 2026-11-18 06:10, med en första commit på grenen `main`. Inget fjärrarkiv är kopplat och inget är pushat. Media ligger utanför Git.

## Startprompt

```
Läs AGENTS.md, README.md, docs/status.md och information/overlamning-2026-11-18.md.
Ta över arbetet. Börja med "Scenen, andra varvet" om det inte redan är gjort, visa mig skärmbilder ur den nya vyn,
och gå sedan vidare i listan. Avgör själv, låt en oberoende granskare döma det du gör, och fråga mig bara om det
som bara jag kan svara på.
```

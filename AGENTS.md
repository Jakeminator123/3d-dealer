# Arbetsregler

Läs [README.md](README.md) och [docs/status.md](docs/status.md) först. Orden står i [docs/architecture.md](docs/architecture.md).

## Ett sätt, ett ställe

- En scen, en kamera, ett mått. Värden står i `content/`; ingen modul har egna koordinater.
- En väg för varje sak: en uppspelning, en beställningsbyggare, ett klippregister. Lägg inte till en parallell väg; byt ut den som finns.
- Ett faktum står på ett ställe. Värden i `content/`, förklaringar i `docs/`. Dokumenten länkar till data i stället för att upprepa dem.
- Läget skrivs i `docs/status.md` och ersätts när det ändras. Beslut läggs till i `docs/decisions.md` med datum. Inga dagböcker.

## Gränser mellan mapparna

- `src/engine` läser ingenting annat i `src/`.
- `src/scene` läser bara signalernas typer ur `src/engine`.
- `src/lab` och `src/casino` läser `src/scene` och `src/engine`, aldrig varandra.
- `src/pipeline` renderar förlagor ur `src/scene` och rör inte spelets utfall.
- Spelkärnan avgör kort och pengar. En film avgör aldrig något av det.

## Media

- `assets/`, `glb/`, `output/` och `runtime/` ligger utanför Git.
- Varje fil i `assets/` har en post i `content/assets.json` med ursprung och sha256. En fil utan post hör inte hemma där.
- Lägg inte in arbetsmaterial, rutor eller jämförelseark i `assets/`. De hör hemma i `output/`.
- Gamla projekt (Dealer, Scoutgaming) är läsreferenser. Ingenting här läser deras mappar; det som behövs kopieras in och registreras.

## Jakobs

- Betald generering får agenten beställa utan att fråga, sedan 2026-11-18 och tills han säger annat ("Just nu får du ganska fria tyglar när det gäller genereringar om det kan hjälpa oss att förbättra saker"). Riktmärket är 300 krediter i timmen. Läs saldot före och efter, och redovisa modell, indata och kostnad efteråt. En enskild beställning över 100 krediter visas för honom först.
- Samma dag 06:30: "Du får hög budget på runway/openai_api_key", och "använd bättre modell än nano banana också! Typ Kling 4". Agentens tolkning, tills han säger annat: under arbetet han bad om den natten får en enskild beställning kosta upp till 250 krediter utan att visas först, och natten som helhet högst 2 000. Film görs med Kling 4; för bilder prövas andra modeller före Nano Banana.
- Omdömen (`status` i registren) sätts av agenten, sedan 2026-11-18 ("om du säger något är bra så är det det, eller låt en automatisk extern granskare se på allt"). Det en agent själv har gjort döms av en oberoende granskare: en underagent som inte har gjort saken, ser den i full storlek och dömer den mot uttalade krav. `statusBy` säger vem som dömde och varför.
- Jakobs eget omdöme går alltid före. Han ändrar ett omdöme i Labbet när han vill.
- `granska igen` är en kö till agenten. Jakob kan skriva varför i Labbet (`comment`). En oberoende granskare ser på saken, rättar det som går att rätta utan betald generering, sätter ny status och svarar i `reply`, som syns i Labbet. Läs kön med `npm run judge -- queue` i början av varje arbetspass och när Jakob ber om det.
- En agent skriver omdömen och svar genom `npm run judge`, aldrig genom Labbets knappar: de bär Jakobs namn.
- Fråga inte Jakob om det en agent kan avgöra. Avgör, skriv vad som avgjordes och varför, och låt honom ändra det.
- En agent tar inte bort filer ur `assets/` utan hans ja, inte heller det som har fått `utgår`.
- Publicering, lipsync och ljud väntar tills han säger till.

## Hushållning med läsning

- En agent läser aldrig filmer, modeller, arkiv, `glb/`, `node_modules/` eller `package-lock.json` som text. `.cursorignore` hindrar att de öppnas som text, och `.cursorindexingignore` håller media och stora bakgrundstexter utanför indexet. Cursor låter inte en agent ändra `.cursorignore`: föreslå ändringen för Jakob.
- `content/assets.json` läses aldrig i sin helhet: använd `npm run judge`, Grep eller ett skript som skriver ut det som behövs. Samma sak för stora filer utanför repot, till exempel local-studios `project.json` och `scene3d.mjs`.
- Filmer ses som ark: `ffmpeg` gör ett fåtal rutor till en bild i `output/`, och den bilden läses. Stora bilder förminskas till högst cirka 1500 bildpunkter innan de läses.
- Utanför repot läses bara det en uppgift pekar ut. `C:\Users\jakem\dev\super-feature-sg\dealer` läses inte alls utan Jakobs ord.
- Större arbeten går till en underagent med en fullständig beställning, så att huvudchatten håller sig kort. Rapporten är högst 200 ord.

## Kod

- TypeScript. En installation och en låsfil i roten.
- Verifiera ändrat beteende med ett test eller en körning innan det kallas klart.
- Skilj det som är mätt från det som är antaget, i data och i svar.

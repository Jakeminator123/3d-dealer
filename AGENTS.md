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
- Omdömen (`status` i registren) sätts av agenten, sedan 2026-11-18 ("om du säger något är bra så är det det, eller låt en automatisk extern granskare se på allt"). Det en agent själv har gjort döms av en oberoende granskare: en underagent som inte har gjort saken, ser den i full storlek och dömer den mot uttalade krav. `statusBy` säger vem som dömde och varför.
- Jakobs eget omdöme går alltid före. Han ändrar ett omdöme i Labbet när han vill.
- `granska igen` är en kö till agenten. Jakob kan skriva varför i Labbet (`comment`). En oberoende granskare ser på saken, rättar det som går att rätta utan betald generering, sätter ny status och svarar i `reply`, som syns i Labbet. Läs kön med `npm run judge -- queue` i början av varje arbetspass och när Jakob ber om det.
- En agent skriver omdömen och svar genom `npm run judge`, aldrig genom Labbets knappar: de bär Jakobs namn.
- Fråga inte Jakob om det en agent kan avgöra. Avgör, skriv vad som avgjordes och varför, och låt honom ändra det.
- En agent tar inte bort filer ur `assets/` utan hans ja, inte heller det som har fått `utgår`.
- Publicering, lipsync och ljud väntar tills han säger till.

## Kod

- TypeScript. En installation och en låsfil i roten.
- Verifiera ändrat beteende med ett test eller en körning innan det kallas klart.
- Skilj det som är mätt från det som är antaget, i data och i svar.

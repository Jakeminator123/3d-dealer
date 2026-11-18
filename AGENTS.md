# Arbetsregler

Läs [README.md](README.md) och [docs/status.md](docs/status.md) först. Orden står i [docs/architecture.md](docs/architecture.md), receptet för en film i [docs/production.md](docs/production.md).

## Ett sätt, ett ställe

- En scen, en kamera, ett mått. Värden står i `content/`; ingen modul har egna koordinater.
- En väg för varje sak: en produktionslinje, en uppspelning, en beställningsbyggare, ett klippregister. Lägg inte till en parallell väg; byt ut den som finns, och ta bort den gamla.
- Ett faktum står på ett ställe. Värden i `content/`, förklaringar i `docs/`. Dokumenten säger kort vad som gäller och länkar till data i stället för att upprepa dem.
- Läget skrivs i `docs/status.md` och ersätts när det ändras. Beslut läggs till i `docs/decisions.md` med datum. Inga dagböcker och inga överlämningar: det som ska överleva en chatt förs till sin plats.
- **Ta bort** betyder radera: filen finns inte kvar. **Arkivera** betyder flytta: filen finns kvar på ett annat ställe. Skriv aldrig det ena om det andra.

## Gränser mellan mapparna

- `src/engine` läser ingenting annat i `src/`.
- `src/scene` läser bara signalernas typer ur `src/engine`.
- `src/lab` och `src/casino` läser `src/scene` och `src/engine`, aldrig varandra.
- `src/pipeline` renderar förlagor ur `src/scene` och rör inte spelets utfall.
- Spelkärnan avgör kort och pengar. En film avgör aldrig något av det.

## Media

- `assets/`, `glb/` och `output/` ligger utanför Git.
- Varje fil i `assets/` har en post i registret, `content/register.db`, med ursprung och sha256. En fil utan post hör inte hemma där. `npm run reg -- check` prövar det.
- Lägg inte in arbetsmaterial, rutor eller jämförelseark i `assets/`. De hör hemma i `output/`.
- Gamla projekt (Dealer, Scoutgaming) och local-studio är läsreferenser. Ingenting här läser deras mappar; det som behövs kopieras in och registreras med ursprung. Inga id:n eller nycklar tas därifrån, och local-studios "pamela" är inte gamla Dealers Pamela.

## Jakobs

- Generering beställs utan att fråga, alltid genom Runways MCP-server och aldrig genom API-nycklar. Ramen är 1 000 krediter i timmen; en enskild beställning över 100 krediter visas för honom först. Läs saldot före och efter, och för in beställningen i registret med modell, indata och kostnad (`npm run reg -- order`). Receptet står i [docs/production.md](docs/production.md).
- Det som inte används tas bort, och det som är bra behålls (Jakob 2026-11-18: "Ta bort keystones eller ankare som inte används"). `npm run reg -- unused` säger vad produktionslinjen inte använder och varför. En underkänd tagning arkiveras (`npm run reg -- arkivera <fil> "<varför>"`, till `output/work/arkiv/`), så att felet går att se på; annat oanvänt tas bort (`npm run reg -- ta-bort <fil> "<varför>"`). Båda antecknar hela posten och skälet, och vägrar så länge något pekar på filen.
- Omdömen (`status`) sätts av agenten. Det en agent själv har gjort döms av en oberoende granskare: en underagent som inte har gjort saken, ser den i full storlek och dömer den mot uttalade krav. `statusBy` säger vem som dömde och varför. Jakobs eget omdöme går alltid före; han ändrar det i Labbet.
- `granska igen` är en kö till agenten. Jakob kan skriva varför i Labbet (`comment`). En oberoende granskare ser på saken, rättar det som går att rätta utan betald generering, sätter ny status och svarar i `reply`. Läs kön med `npm run reg -- queue` i början av varje arbetspass.
- En agent skriver omdömen och svar genom `npm run reg -- status <fil> <status> "<vem och varför>"` och `npm run reg -- reply <fil> "<svar>"`, aldrig genom Labbets knappar eller motiveringsruta: de bär Jakobs namn.
- Fråga inte Jakob om det en agent kan avgöra. Avgör, skriv vad som avgjordes och varför, och låt honom ändra det.
- Underagenter körs som standard med Opus 5.5 på extra hög ansträngning.
- Gamla Dealer (`C:\Users\jakem\dev\super-feature-sg\dealer`) är Codex arbetsyta: den läses inte utan Jakobs ord, och dess grenar, arbetsträd och `D:\dealer-scratch` rörs aldrig.
- En gren eller ett arbetsträd med opushade commits tas aldrig bort utan Jakobs ja för just den grenen, och aldrig i ett annat repo än det här.
- Ingenting pushas utan hans ord. Publicering, lipsync och ljud väntar tills han säger till.

## Hushållning med läsning

- En agent läser aldrig filmer, modeller, arkiv, `glb/`, `node_modules/` eller `package-lock.json` som text. `.cursorignore` är Jakobs fil (Cursor låter inte en agent ändra den: föreslå ändringen för honom); `.cursorindexingignore` håller media och stora bakgrundstexter utanför indexet.
- Registret läses aldrig som fil: fråga det med `npm run reg -- show <fil>`, `list`, `summary` eller `sql "<select …>"` (`sql` utan fråga visar tabellerna). Stora filer utanför repot, till exempel local-studios `project.json` och `scene3d.mjs`, läses med Grep eller ett skript som skriver ut det som behövs.
- Filmer ses som ark: `ffmpeg` gör ett fåtal rutor till en bild i `output/`, och den bilden läses. Stora bilder förminskas till högst cirka 1500 bildpunkter innan de läses.
- Utanför repot läses bara det en uppgift pekar ut.
- Större arbeten går till en underagent med en fullständig beställning, så att huvudchatten håller sig kort. Rapporten är högst 200 ord.

## Kod

- TypeScript. En installation och en låsfil i roten.
- Verifiera ändrat beteende med ett test eller en körning innan det kallas klart.
- Skilj det som är mätt från det som är antaget, i data och i svar.
- `origin` (github.com/Jakeminator123/3d-dealer) är publikt. Inga nycklar, signerade adresser, personuppgifter eller privata samtal checkas in.

## Fällor

- Servern laddar inte om sin egen kod: efter en ändring i `src/server` eller `src/pipeline` startas den om. Jakobs server på port 5310 rörs inte. Prova på en egen port (`PORT`), och mot en kopia av `content/` och `assets/` (`STUDIO_DATA=<mapp>`) när något klickar eller skriver. `node src/pipeline/shoot.ts` startar sin egen server.
- Registret skrivs av Labbet och av flera agenter samtidigt. Skriv det bara genom `npm run reg` (och Labbet genom servern): varje skrivning är en transaktion, och `sql` öppnar databasen skrivskyddad. `npm run` skriver en rubrik på standard ut; `node src/pipeline/registry.ts <ord>` gör samma sak utan den.
- Skriv skript till fil, inte som `node -e` eller här-dokument: PowerShell tolkar grav accent och dollartecken, och Bash-verktyget förstör omvända snedstreck och vissa citattecken.

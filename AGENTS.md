# Arbetsregler

Läs [README.md](README.md) och [docs/status.md](docs/status.md) först. Orden står i [docs/architecture.md](docs/architecture.md#orden), receptet för en film i [docs/production.md](docs/production.md) och besluten i [docs/decisions.md](docs/decisions.md).

## Ett sätt, ett ställe

- En scen i meter. Scenens, dockans och rörelsernas värden står i `content/`; ingen modul har egna koordinater eller mått.
- En väg för varje sak. Lägg inte till en parallell väg: byt ut den som finns och ta bort den gamla.
- Ett faktum står på ett ställe: värden i `content/` och registret, förklaringar i `docs/`. Ett dokument säger kort vad som gäller och hur man frågar, i stället för att upprepa tal, antal eller listor.
- Läget står i `docs/status.md` och skrivs om när det ändras. Ett beslut är en rad med datum i `docs/decisions.md`. Inga dagböcker och inga överlämningar: det som ska överleva en chatt förs till sin plats.
- **Ta bort** betyder radera och **arkivera** betyder flytta. Skriv aldrig det ena om det andra.

## Gränser mellan mapparna

`src/boundaries.test.ts` faller när en gräns bryts.

- `src/engine` läser ingenting annat i `src/`.
- `src/scene` läser bara typer ur `src/engine`.
- `src/lab` och `src/casino` läser `src/scene`, och `src/engine` bara med `import type`; aldrig varandra. De når servern över HTTP.
- `src/pipeline` läser `src/scene` och rör inte spelets utfall.
- `src/server` läser `src/pipeline` och `src/engine`.
- Spelkärnan avgör kort och pengar. En film avgör aldrig något av det.

## Media

- `assets/`, `glb/` och `output/` ligger utanför Git.
- Varje fil i `assets/` har en post i registret (`content/register.db`) med ursprung och sha256; `npm run reg -- check` prövar det. Arbetsmaterial, rutor och jämförelseark hör hemma i `output/`.
- Gamla Dealer, Scoutgaming och local-studio är läsreferenser. Ingenting här läser deras mappar: det som behövs kopieras in och registreras med ursprung, utan id:n eller nycklar därifrån.

## Jakobs ramar

- Generering beställs utan att fråga, genom Runways MCP-server och aldrig med API-nycklar. Ramen är 1 000 krediter i timmen; en beställning över 100 krediter visas för Jakob först. Varje beställning förs in i registret med modell, indata och kostnad, som [production.md](docs/production.md#runway) beskriver.
- Det som produktionslinjen inte använder tas bort, och det som är bra behålls: `npm run reg -- unused` säger vad och varför. En underkänd tagning arkiveras (`npm run reg -- arkivera <fil> "<varför>"`), så att felet går att se på; annat tas bort (`npm run reg -- ta-bort <fil> "<varför>"`).
- Omdömen (`status`) sätts av agenten. Det en agent själv har gjort döms av en oberoende granskare: en underagent som inte har gjort saken, ser den i full storlek och dömer den mot uttalade krav. `statusBy` säger vem som dömde och varför. Jakobs omdöme går alltid före; han ändrar det i Labbet.
- `granska igen` är en kö till agenten: läs den med `npm run reg -- queue` i början av varje arbetspass. En oberoende granskare ser på saken, rättar det som går att rätta utan betald generering, sätter ny status och svarar.
- En agent skriver omdömen och svar med `npm run reg -- status <fil> <status> "<vem och varför>"` och `npm run reg -- reply <fil> "<svar>"`, aldrig med Labbets knappar eller motiveringsruta: de bär Jakobs namn.
- Fråga inte Jakob om det en agent kan avgöra. Avgör inom logiska ramar, skriv vad som avgjordes och varför, och låt honom ändra det.
- Underagenter körs med Opus 5.5 på extra hög ansträngning.
- Gamla Dealer (`C:\Users\jakem\dev\super-feature-sg\dealer`) är Codex arbetsyta: den läses inte utan Jakobs ord, och dess grenar, arbetsträd och `D:\dealer-scratch` rörs aldrig. En gren eller ett arbetsträd med opushade commits tas aldrig bort utan Jakobs ja för just den, och aldrig i ett annat repo än det här.
- Ingenting pushas utan Jakobs ord. Publicering, lipsync och ljud väntar tills han säger till.

## Hushållning med läsning

- Filmer, modeller, arkiv, `glb/`, `node_modules/`, `package-lock.json` och registret läses aldrig som text. `.cursorignore` stänger ute dem; `.cursorindexingignore` håller dessutom bilder och stora bakgrundstexter utanför indexet.
- Registret frågas med `npm run reg -- show <fil>`, `list`, `summary` eller `sql "<select …>"` (`sql` utan fråga visar tabellerna).
- Filmer ses som ark: `ffmpeg` gör ett fåtal rutor till en bild i `output/`, och den bilden läses. Stora bilder förminskas till högst cirka 1500 bildpunkter innan de läses.
- Utanför repot läses bara det en uppgift pekar ut, och en stor fil där med Grep eller ett skript som skriver ut det som behövs.
- Större arbeten går till en underagent med en fullständig beställning. Rapporten är högst 200 ord.

## Kod och prov

- TypeScript. En installation och en låsfil i roten.
- Verifiera ändrat beteende med ett test eller en körning innan det kallas klart.
- Ett test skriver bara i en tillfällig mapp och läser aldrig `assets/` eller `output/`, som inte finns i Git. Filnamn i ett test är påhittade: ett riktigt registernamn i en testfil pekar på posten och hindrar `ta-bort`.
- Skilj det som är mätt från det som är antaget, i data och i svar.
- `origin` (github.com/Jakeminator123/3d-dealer) är publikt. Inga nycklar, signerade adresser, personuppgifter eller privata samtal checkas in.

## Servern

- `npm start` startar servern dold i bakgrunden, med logg i `output/server-<port>.log`, och `npm stop` stoppar den; `npm run dev` kör den i en terminal. Porten är den i `PORT`, annars 5310.
- Servern startar om sig själv när en fil den läser ändras, och Labbets sida laddar då om sig. Den startas aldrig om för hand efter en kodändring.
- Servern på 5310 är den Jakob tittar i: stoppa den inte. Svarar den inte, läs loggen och rätta felet (den startar om när filen sparas); går den inte alls, starta den med `npm start`.
- Pröva på en egen port (`$env:PORT=5311; npm start`, och `npm stop` med samma `PORT`), och mot en kopia av `content/` och `assets/` (`STUDIO_DATA=<mapp>`) när något klickar eller skriver. `node src/pipeline/shoot.ts` startar sin egen server.

## Fällor

- Registret skrivs av Labbet och av flera agenter samtidigt. Skriv det bara genom `npm run reg` (och Labbet genom servern): varje skrivning är en transaktion, och `sql` öppnar databasen skrivskyddad. `npm run` skriver en rubrik på standard ut; `node src/pipeline/registry.ts <ord>` gör samma sak utan den.
- Skriv skript till fil, inte som `node -e` eller här-dokument: PowerShell tolkar grav accent och dollartecken, och Bash-verktyget förstör omvända snedstreck och vissa citattecken.

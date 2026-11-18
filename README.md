# 3d-dealer

Lokal studio för filmade blackjackdealers i en 3D-scen. Första dealern är Paulina.

Två lägen delar samma scen: **Labbet** (http://localhost:5310/lab/), där en dealer skapas och granskas, och **Casinot** (http://localhost:5310/casino/), där man spelar en runda mot spelkärnan: välj plats och insats, Dela, och sedan de handlingar kärnan erbjuder.

## Starta

```
npm install
npm start
```

- `npm start` startar servern dold i bakgrunden, med logg i `output/server-5310.log`, och säger till när http://localhost:5310/lab/ svarar.
- `npm stop` stoppar den.

`npm run dev` kör servern i en terminal i stället; Ctrl+C stoppar. Servern svarar bara på den här datorn och startar om sig själv när dess kod ändras, och Labbets sida laddar då om sig. `PORT` väljer en annan port. `npm test` kör testerna och `npm run typecheck` typkontrollen.

Kommandona för produktionen (`node src/pipeline/shoot.ts` för förlagor, `node src/pipeline/runda.ts` för en runda som film, `npm run reg` för registret) står i [docs/production.md](docs/production.md) och [AGENTS.md](AGENTS.md). Läget står i [docs/status.md](docs/status.md).

## Karta

| Mapp | Ansvar | I Git |
| --- | --- | --- |
| `src/engine` | Spelkärnan: regler, sko, slump och signaler. Inget gränssnitt. | ja |
| `src/scene` | Den gemensamma 3D-scenen och uppspelningen: bord, sko, kort, marker, dealerfilm, kameror. | ja |
| `src/lab` | Labbet. | ja |
| `src/casino` | Casinot: en runda mot spelkärnan i vyn Spelaren. | ja |
| `src/pipeline` | Vägen från scen till film: förlaga, rundan som film och registret. | ja |
| `src/server` | Liten lokal server: registret, filerna, förlagorna och spelsessionen (spelkärnan körs här). | ja |
| `content/` | Små data som styr allt: scen, docka, rörelser, och registret (`register.db`, en databas). | ja |
| `assets/` | Bilder, filmer och modeller. Varje fil har en post i registret. | nej |
| `docs/` | Fyra dokument, ett ämne var. | ja |
| `information/` | Bakgrund: samtal, extern granskning, underlaget från inläsningen och gamla filmhandboken. | ja |
| `glb/` | Jakobs råmaterial (tunga modeller och bilder), orört. | nej |
| `output/` | Sådant som kan göras om: förlagor, förhandsbilder, serverns logg, arbetsmaterial och arkiverade filer (`output/work/arkiv/`). | nej |

## Dokument

- [docs/architecture.md](docs/architecture.md): hur delarna hänger ihop, och vad orden betyder.
- [docs/production.md](docs/production.md): vägen från en bild till en spelbar dealer.
- [docs/decisions.md](docs/decisions.md): beslut med datum.
- [docs/status.md](docs/status.md): vad som fungerar och vad som är näst.
- [AGENTS.md](AGENTS.md): arbetsregler för agenter.

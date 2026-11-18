# 3d-dealer

Lokal studio för filmade blackjackdealers i en 3D-scen. Första dealern är Paulina.

Två lägen delar samma scen: **Labbet**, där en dealer skapas och granskas, och **Casinot**, där man spelar på riktigt mot spelkärnan.

## Starta

```
npm install
npm run dev
```

Öppna sedan http://localhost:5310/lab/. Servern svarar bara på den här datorn. `npm test` kör testerna och `npm run typecheck` typkontrollen.

## Läget

Labbet har två steg: Granska, där allt i bildregistret visas och döms, och Scen, där bord, sko, rum och dealer ses ur spelarnas vyer. Produktionskedjan är körd en gång: Paulina ger ett kort till plats 4. Spelet är inte byggt än. Se [docs/status.md](docs/status.md).

## Karta

| Mapp | Ansvar | I Git |
| --- | --- | --- |
| `src/engine` | Spelkärnan: regler, sko, slump och signaler. Inget gränssnitt. | ja |
| `src/scene` | Den gemensamma 3D-scenen och uppspelningen: bord, sko, kort, marker, dealerfilm, kameror. | ja |
| `src/lab` | Labbet. | ja |
| `src/casino` | Casinot. | ja |
| `src/pipeline` | Vägen från scen till film: förlaga, beställning, import, granskning. | ja |
| `src/server` | Liten lokal server: spelsession, filer, jobb. | ja |
| `content/` | Små data som styr allt: scen, dealers, klipp och bildregistret. | ja |
| `assets/` | Bilder, filmer och modeller. Varje fil har en post i `content/assets.json`. | nej |
| `docs/` | Fyra dokument, ett ämne var. | ja |
| `information/` | Bakgrund: samtal, extern granskning, underlaget från inläsningen, gamla filmhandboken och överlämningar. | ja |
| `glb/` | Jakobs råmaterial (tunga modeller och bilder), orört. | nej |
| `output/`, `runtime/` | Sådant som kan göras om, och pågående jobb. | nej |

## Dokument

- [docs/architecture.md](docs/architecture.md): hur delarna hänger ihop, och vad orden betyder.
- [docs/production.md](docs/production.md): vägen från en bild till en spelbar dealer.
- [docs/decisions.md](docs/decisions.md): beslut med datum.
- [docs/status.md](docs/status.md): vad som fungerar och vad som är näst.
- [AGENTS.md](AGENTS.md): arbetsregler för agenter.

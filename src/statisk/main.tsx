import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Casino } from '../casino/Casino.tsx';
import { browserGame, staticFiles } from './spel.ts';
import '../casino/casino.css';

// Casinot byggt statiskt: samma Casino som i studion, med spelkärnan i webbläsaren och filerna bredvid sidan. Sessionen
// lever tills sidan laddas om. Labbet följer inte med, och länken dit står avstängd.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Casino game={browserGame()} files={staticFiles} />
  </StrictMode>,
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { browserGame } from './spel.ts';
import { Visning } from './Visning.tsx';
import '../casino/casino.css';
import './visning.css';

// En session för hela sidan: den lever tills sidan laddas om, också när läget byts.
const game = browserGame();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Visning game={game} />
  </StrictMode>,
);

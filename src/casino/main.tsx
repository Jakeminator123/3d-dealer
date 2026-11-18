import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Casino } from './Casino.tsx';
import { serverFiles, serverGame } from './server.ts';
import './casino.css';

// Casinot i studion: spelkärnan i servern, och registret, content/ och assets/ genom den.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Casino game={serverGame} files={serverFiles} lab="/lab/" />
  </StrictMode>,
);

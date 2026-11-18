// Casinot i studion: spelkärnan i servern, och registret, content/ och assets/ genom den (server.ts).

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Casino } from './Casino.tsx';
import { loadContent, type Content } from './link.ts';
import { serverFiles, serverGame } from './server.ts';
import './casino.css';

function CasinoPage() {
  const [content, setContent] = useState<Content | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    loadContent(serverFiles).then(setContent, (error: Error) => setProblem(error.message));
  }, []);
  return (
    <div className="casino">
      <header className="casinotop">
        <div className="brand">
          3d-dealer <span>Casinot</span>
        </div>
        <a className="elsewhere" href="/lab/">
          Labbet
        </a>
      </header>
      {content ? <Casino game={serverGame} files={serverFiles} content={content} /> : <main className="notice">{problem ?? 'Läser bordet …'}</main>}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CasinoPage />
  </StrictMode>,
);

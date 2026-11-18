import { useEffect, useState } from 'react';
import type { Asset, Registry } from './registry.ts';

export type Say = (file: string, comment: string) => void;

/**
 * Jakobs egna ord om en fil, och agentens svar. Rutan visas när statusen ber om en motivering,
 * när något redan är skrivet, eller alltid (`always`). Orden sparas när man lämnar rutan.
 */
export function Words({ registry, asset, onSay, always }: { registry: Registry; asset: Asset; onSay: Say; always?: boolean }) {
  const saved = asset.comment ?? '';
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);

  const asks = registry.asksWhy?.includes(asset.status) ?? false;
  if (!always && !asks && !saved && !asset.reply) return null;

  return (
    <div className="words">
      <textarea
        value={draft}
        rows={always ? 3 : 2}
        placeholder={asks ? 'Varför? Skriv vad som ska ändras eller ses över.' : 'Dina egna ord om filen.'}
        aria-label={`Dina ord om ${asset.title}`}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft.trim() !== saved) onSay(asset.file, draft);
        }}
      />
      <div className="wordsfoot">
        {draft.trim() !== saved ? 'Sparas när du lämnar rutan' : saved ? `Sparat ${asset.commentAt ?? ''}` : ''}
      </div>
      {asset.reply && (
        <p className="reply">
          <b>Agenten svarar{asset.replyAt ? ` (${asset.replyAt})` : ''}:</b> {asset.reply}
        </p>
      )}
    </div>
  );
}

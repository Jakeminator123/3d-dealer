import type { Asset, Registry } from './registry.ts';

export const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export type Judge = (file: string, status: string) => void;

/** Jakobs omdöme om en fil. Valen är registrets egna statusar; ett klick skrivs till content/assets.json. */
export function Verdict({ registry, asset, onJudge }: { registry: Registry; asset: Asset; onJudge: Judge }) {
  return (
    <div className="verdict" role="group" aria-label="Omdöme">
      {Object.entries(registry.statuses).map(([status, meaning]) => (
        <button
          key={status}
          type="button"
          data-status={status}
          aria-pressed={asset.status === status}
          title={meaning}
          onClick={() => {
            if (asset.status !== status) onJudge(asset.file, status);
          }}
        >
          {capitalize(status)}
        </button>
      ))}
    </div>
  );
}

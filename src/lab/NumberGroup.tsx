// En grupp tal ur numbers.ts: rubriken, raderna med enhet och märket mätt eller antaget, tabellerna (som rullar i
// sidled för sig på en smal skärm), en bild ur registret, och filens egna källor att fälla ut.

import type { Group } from './numbers.ts';
import { thumbUrl } from './registry.ts';

export function NumberGroup({ group }: { group: Group }) {
  return (
    <div className="numbergroup" id={`tal-${group.id}`}>
      <h3>{group.title}</h3>
      {group.text && <p className="dim">{group.text}</p>}
      {group.picture && <img className="picture" src={thumbUrl(group.picture, 960)} alt={group.title} />}
      {group.rows && group.rows.length > 0 && (
        <div className="scroll">
          <table className="rows">
            <tbody>
              {group.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>
                    {row.value}
                    {row.basis && <span className={row.basis === 'mätt' ? 'basis measured' : 'basis'}>{row.basis}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {group.tables?.map((table, k) => (
        <div className="scroll" key={table.caption ?? k}>
          <table className={table.wrap ? 'wrap' : 'wide'}>
            {table.caption && <caption>{table.caption}</caption>}
            <thead>
              <tr>
                {table.head.map((cell) => (
                  <th key={cell}>{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {group.sources && group.sources.length > 0 && (
        <details>
          <summary>Källorna, som filen skriver dem</summary>
          {group.sources.map((one) => (
            <p key={one.what} className="source">
              <b>{one.what}:</b> {one.text}
            </p>
          ))}
        </details>
      )}
    </div>
  );
}

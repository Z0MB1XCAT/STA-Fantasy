// Decides which text each round is built from.
//
// Results saved from admin.html live in the database; the files in data/rounds/ are the fallback.
// A saved row always wins, and a round with neither is simply "not played yet".

/**
 * @param {number[]} ids        round ids, in calendar order
 * @param {(string|null)[]} fileTexts   text of data/rounds/NN.txt for each id, or null if there is no file
 * @param {Map<number, {content: string, updated_at?: string}>} dbRows   saved results by round id
 * @returns {({id: number, text: string, source: 'database'|'file', updatedAt: string|null}|null)[]}
 */
export function chooseRounds(ids, fileTexts, dbRows) {
  return ids.map((id, i) => {
    const row = dbRows.get(id);
    if (row && typeof row.content === 'string' && row.content.trim()) {
      return { id, text: row.content, source: 'database', updatedAt: row.updated_at || null };
    }
    return fileTexts[i] == null ? null : { id, text: fileTexts[i], source: 'file', updatedAt: null };
  });
}

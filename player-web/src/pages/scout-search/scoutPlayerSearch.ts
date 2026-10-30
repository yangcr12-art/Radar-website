type NameMapping = { en: string; zh: string };

export function normalizeScoutQuery(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/_/g, " ").trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildScoutNameAliases(mappings: NameMapping[]): Map<string, string[]> {
  const aliases = new Map<string, string[]>();
  for (const mapping of mappings) {
    const names = [mapping.en, mapping.zh].map(normalizeScoutQuery).filter(Boolean);
    for (const name of names) aliases.set(name, [...new Set([...(aliases.get(name) || []), ...names])]);
  }
  return aliases;
}

// Filter already-ranked results, retaining original objects, scores and rank numbers.
export function filterScoutPlayers<T extends { player: string }>(players: T[], query: string, aliases: Map<string, string[]>): T[] {
  const needle = normalizeScoutQuery(query);
  if (!needle) return players;
  return players.filter(player => {
    const name = normalizeScoutQuery(player.player);
    return [name, ...(aliases.get(name) || [])].some(alias => alias.includes(needle));
  });
}

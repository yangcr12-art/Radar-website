export const APP_PAGE_KEYS = [
  "home",
  "radar",
  "about",
  "project_mapping",
  "match_project_mapping",
  "name_mapping",
  "team_mapping",
  "match_team_data",
  "match_radar",
  "fitness_team_radar",
  "fitness_player_overlay",
  "fitness_per90",
  "opta_analysis",
  "player_data",
  "scatter_plot",
  "player_personal_radar"
] as const;

export type AppPageKey = (typeof APP_PAGE_KEYS)[number];

export function isAppPageKey(value: string): value is AppPageKey {
  return (APP_PAGE_KEYS as readonly string[]).includes(value);
}

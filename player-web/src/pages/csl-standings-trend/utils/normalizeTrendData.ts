import { numeric } from "../../../utils/number";

export type NormalizedTrendData = {
  rounds: number[];
  teams: string[];
  standingsByRound: any[];
  trendSeriesByTeam: Record<string, any[]>;
};

export function normalizeTrendData(datasetDoc: any): NormalizedTrendData {
  const roundsRaw = Array.isArray(datasetDoc?.rounds)
    ? Array.from(new Set(datasetDoc.rounds.map((item: any) => numeric(item, 0)).filter((item: number) => item >= 0))).sort((a, b) => a - b)
    : [];
  const teamsRaw = Array.isArray(datasetDoc?.teams) ? datasetDoc.teams.map((item: any) => String(item)).filter(Boolean) : [];
  const standingsByRoundRaw = Array.isArray(datasetDoc?.standingsByRound) ? datasetDoc.standingsByRound : [];
  const trendSeriesByTeamRaw = datasetDoc?.trendSeriesByTeam && typeof datasetDoc.trendSeriesByTeam === "object" ? datasetDoc.trendSeriesByTeam : {};
  const hasRound0InRounds = roundsRaw.includes(0);
  const hasRound0InStandings = standingsByRoundRaw.some((item: any) => numeric(item?.round, -1) === 0);
  const hasRound0InSeries = teamsRaw.some((team) => {
    const list = Array.isArray(trendSeriesByTeamRaw[team]) ? trendSeriesByTeamRaw[team] : [];
    return list.some((row: any) => numeric(row?.round, -1) === 0);
  });

  if (hasRound0InRounds || hasRound0InStandings || hasRound0InSeries) {
    const rounds = hasRound0InRounds ? roundsRaw : [0, ...roundsRaw.filter((r) => r !== 0)];
    return {
      rounds,
      teams: teamsRaw,
      standingsByRound: standingsByRoundRaw,
      trendSeriesByTeam: trendSeriesByTeamRaw
    };
  }

  if (teamsRaw.length === 0) {
    return {
      rounds: roundsRaw,
      teams: teamsRaw,
      standingsByRound: standingsByRoundRaw,
      trendSeriesByTeam: trendSeriesByTeamRaw
    };
  }

  const earliestSnapshot = [...standingsByRoundRaw].sort((a: any, b: any) => numeric(a?.round, 0) - numeric(b?.round, 0))[0];
  const earliestRows = Array.isArray(earliestSnapshot?.rows) ? earliestSnapshot.rows : [];
  const rowByTeam = new Map<string, any>();
  earliestRows.forEach((row: any) => {
    const team = String(row?.team || "");
    if (team) rowByTeam.set(team, row);
  });

  const deductionByTeam = new Map<string, number>();
  teamsRaw.forEach((team) => {
    const snapshotDeduction = numeric(rowByTeam.get(team)?.deduction, NaN);
    if (Number.isFinite(snapshotDeduction)) {
      deductionByTeam.set(team, snapshotDeduction);
      return;
    }
    const series = Array.isArray(trendSeriesByTeamRaw[team]) ? trendSeriesByTeamRaw[team] : [];
    const seriesDeduction = numeric(series[0]?.deduction, 0);
    deductionByTeam.set(team, seriesDeduction);
  });

  const rankRawByTeam = new Map<string, number>();
  [...teamsRaw].sort((a, b) => a.localeCompare(b)).forEach((team, idx) => rankRawByTeam.set(team, idx + 1));

  const rankNetByTeam = new Map<string, number>();
  [...teamsRaw]
    .sort((a, b) => {
      const pointsNetA = -numeric(deductionByTeam.get(a), 0);
      const pointsNetB = -numeric(deductionByTeam.get(b), 0);
      return pointsNetB - pointsNetA || a.localeCompare(b);
    })
    .forEach((team, idx) => rankNetByTeam.set(team, idx + 1));

  const round0Rows = teamsRaw.map((team) => {
    const deduction = numeric(deductionByTeam.get(team), 0);
    const rankRaw = numeric(rankRawByTeam.get(team), 0);
    const rankNet = numeric(rankNetByTeam.get(team), 0);
    return {
      team,
      played: 0,
      won: 0,
      draw: 0,
      lost: 0,
      deduction,
      pointsRaw: 0,
      pointsNet: -deduction,
      points: 0,
      rankRaw,
      rankNet,
      rank: rankRaw,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0
    };
  });

  const round0ByTeam = new Map<string, any>();
  round0Rows.forEach((row) => round0ByTeam.set(String(row.team), row));
  const trendSeriesByTeam: Record<string, any[]> = {};
  teamsRaw.forEach((team) => {
    const row = round0ByTeam.get(team);
    const baseline = {
      round: 0,
      deduction: numeric(row?.deduction, 0),
      pointsRaw: 0,
      pointsNet: numeric(row?.pointsNet, 0),
      points: 0,
      rankRaw: numeric(row?.rankRaw, 0),
      rankNet: numeric(row?.rankNet, 0),
      rank: numeric(row?.rankRaw, 0),
      goalsFor: 0,
      goalsAgainst: 0
    };
    const series = Array.isArray(trendSeriesByTeamRaw[team]) ? trendSeriesByTeamRaw[team] : [];
    trendSeriesByTeam[team] = [baseline, ...series];
  });

  return {
    rounds: [0, ...roundsRaw.filter((r) => r !== 0)],
    teams: teamsRaw,
    standingsByRound: [{ round: 0, rows: round0Rows }, ...standingsByRoundRaw],
    trendSeriesByTeam
  };
}


import React from "react";
import AboutPage from "../pages/about/AboutPage";
import HomePage from "../pages/home/HomePage";
import PlayerDataPage from "../pages/player-data/PlayerDataPage";
import ProjectMappingPage from "../pages/project-mapping/ProjectMappingPage";
import MatchProjectMappingPage from "../pages/match-project-mapping/MatchProjectMappingPage";
import NameMappingPage from "../pages/name-mapping/NameMappingPage";
import ScatterPlotPage from "../pages/scatter-plot/ScatterPlotPage";
import TeamMappingPage from "../pages/team-mapping/TeamMappingPage";
import MatchTeamDataPage from "../pages/match-team-data/MatchTeamDataPage";
import MatchRadarPage from "../pages/match-radar/MatchRadarPage";
import FitnessTeamRadarPage from "../pages/fitness-analysis/FitnessTeamRadarPage";
import FitnessPlayerOverlayPage from "../pages/fitness-analysis/FitnessPlayerOverlayPage";
import FitnessPer90Page from "../pages/fitness-analysis/FitnessPer90Page";
import OptaAnalysisPage from "../pages/opta-analysis/OptaAnalysisPage";
import CslStandingsTrendPage from "../pages/csl-standings-trend/CslStandingsTrendPage";
import PlayerPersonalRadarPage from "../pages/player-personal-radar/PlayerPersonalRadarPage";
import { type AppPageKey } from "./pageRegistry";

type RenderActivePageArgs = {
  activePage: AppPageKey;
  setActivePage: (page: AppPageKey) => void;
  radarPage: React.ReactNode;
  playerDataPageProps: any;
  scatterPageProps: any;
  playerPersonalRadarProps: any;
};

export function renderActivePage({
  activePage,
  setActivePage,
  radarPage,
  playerDataPageProps,
  scatterPageProps,
  playerPersonalRadarProps
}: RenderActivePageArgs) {
  switch (activePage) {
    case "home":
      return (
        <HomePage
          onEnterRadar={() => setActivePage("radar")}
          onEnterScatter={() => setActivePage("scatter_plot")}
          onEnterMatchRadar={() => setActivePage("match_radar")}
        />
      );
    case "radar":
      return radarPage;
    case "about":
      return <AboutPage />;
    case "project_mapping":
      return <ProjectMappingPage />;
    case "match_project_mapping":
      return <MatchProjectMappingPage />;
    case "name_mapping":
      return <NameMappingPage />;
    case "team_mapping":
      return <TeamMappingPage />;
    case "match_team_data":
      return <MatchTeamDataPage />;
    case "match_radar":
      return <MatchRadarPage />;
    case "fitness_team_radar":
      return <FitnessTeamRadarPage />;
    case "fitness_player_overlay":
      return <FitnessPlayerOverlayPage />;
    case "fitness_per90":
      return <FitnessPer90Page />;
    case "opta_analysis":
      return <OptaAnalysisPage />;
    case "csl_standings_trend":
      return <CslStandingsTrendPage />;
    case "player_data":
      return <PlayerDataPage {...playerDataPageProps} />;
    case "scatter_plot":
      return <ScatterPlotPage {...scatterPageProps} />;
    case "player_personal_radar":
      return <PlayerPersonalRadarPage {...playerPersonalRadarProps} />;
    default:
      return null;
  }
}

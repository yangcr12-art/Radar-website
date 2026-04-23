import React from "react";
import FitnessAnalysisPage from "./FitnessAnalysisPage";

function FitnessTeamRadarPage({ mappingRevision }: { mappingRevision: number }) {
  return <FitnessAnalysisPage view="team" mappingRevision={mappingRevision} />;
}

export default FitnessTeamRadarPage;

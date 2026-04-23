import React from "react";
import FitnessAnalysisPage from "./FitnessAnalysisPage";

function FitnessPlayerOverlayPage({ mappingRevision }: { mappingRevision: number }) {
  return <FitnessAnalysisPage view="player" mappingRevision={mappingRevision} />;
}

export default FitnessPlayerOverlayPage;

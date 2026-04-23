import React from "react";
import FitnessAnalysisPage from "./FitnessAnalysisPage";

function FitnessPer90Page({ mappingRevision }: { mappingRevision: number }) {
  return <FitnessAnalysisPage view="per90" mappingRevision={mappingRevision} />;
}

export default FitnessPer90Page;

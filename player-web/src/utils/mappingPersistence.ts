import { saveMappings } from "../api/storageClient";
import { getMatchProjectMappingRows } from "./matchProjectMappingStore";
import { emitMappingRemoteSyncStatus } from "./mappingRemoteSync";
import { getNameMappingRows } from "./nameMappingStore";
import { getProjectMappingRows } from "./projectMappingStore";
import { getTeamMappingRows } from "./teamMappingStore";

export function buildCurrentMappingsPayload() {
  return {
    projectMappingRows: getProjectMappingRows(),
    matchProjectMappingRows: getMatchProjectMappingRows(),
    nameMappingRows: getNameMappingRows(),
    teamMappingRows: getTeamMappingRows()
  };
}

export async function persistMappingsNow() {
  try {
    await saveMappings(buildCurrentMappingsPayload());
    emitMappingRemoteSyncStatus({ ok: true, error: "" });
    return { ok: true, error: "" };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err || "未知错误");
    emitMappingRemoteSyncStatus({ ok: false, error });
    return { ok: false, error };
  }
}

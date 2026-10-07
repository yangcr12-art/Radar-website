from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from server_core.services import user_storage
from server_core.services.mapping_state import (
    load_mapping_payload,
    recover_mapping_payload_from_backup,
    save_mapping_payload,
)
from server_core.services.state_store import build_state_doc, normalize_state_payload, write_state_doc


def _state_payload(**extra):
    return {
        "draft": None,
        "presets": [],
        "selectedPresetId": "draft",
        "playerMetricPresets": [],
        "matchMetricPresets": [],
        "selectedMatchMetricPresetByDataset": {},
        **extra,
    }


def _mapping_payload(group: str):
    return {
        "projectMappingRows": [
            {
                "en": "Goals per 90",
                "zh": "每90分钟进球",
                "group": group,
                "percentileAlgorithm": "event_positive",
                "isBuiltin": True,
            }
        ],
        "matchProjectMappingRows": [],
        "nameMappingRows": [],
        "teamMappingRows": [],
    }


class MappingPersistenceTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = TemporaryDirectory()
        temp_root = Path(self.temp_dir.name)
        self.data_patch = patch.object(user_storage, "DATA_DIR", temp_root)
        self.users_patch = patch.object(user_storage, "USERS_DIR", temp_root / "users")
        self.data_patch.start()
        self.users_patch.start()

    def tearDown(self):
        self.users_patch.stop()
        self.data_patch.stop()
        self.temp_dir.cleanup()

    def test_legacy_mapping_is_migrated_and_survives_state_autosave(self):
        username = "tester"
        original = _mapping_payload("进攻")
        write_state_doc(build_state_doc(_state_payload(**original)), username)

        migrated = load_mapping_payload(username)
        self.assertEqual(migrated["projectMappingRows"][0]["group"], "进攻")
        self.assertTrue((user_storage.USERS_DIR / username / "mappings.json").exists())

        normalized_workspace_state = normalize_state_payload(_state_payload(**original))
        self.assertNotIn("projectMappingRows", normalized_workspace_state)

        write_state_doc(build_state_doc(_state_payload(draft={"title": "later autosave"})), username)
        after_autosave = load_mapping_payload(username)
        self.assertEqual(after_autosave, migrated)

        updated = _mapping_payload("得分威胁")
        save_mapping_payload(updated, username)
        write_state_doc(build_state_doc(_state_payload(draft={"title": "another autosave"})), username)
        self.assertEqual(load_mapping_payload(username)["projectMappingRows"][0]["group"], "得分威胁")

    def test_corrupt_main_mapping_recovers_from_dedicated_backup(self):
        username = "tester"
        save_mapping_payload(_mapping_payload("第一版"), username)
        save_mapping_payload(_mapping_payload("第二版"), username)
        mapping_path = user_storage.USERS_DIR / username / "mappings.json"
        mapping_path.write_text("{broken", encoding="utf-8")

        self.assertTrue(recover_mapping_payload_from_backup(username))
        recovered = load_mapping_payload(username)
        self.assertEqual(recovered["projectMappingRows"][0]["group"], "第一版")
        self.assertIsInstance(json.loads(mapping_path.read_text(encoding="utf-8")), dict)
        backup_path = user_storage.USERS_DIR / username / "mappings.json.bak"
        self.assertIsInstance(json.loads(backup_path.read_text(encoding="utf-8")), dict)


if __name__ == "__main__":
    unittest.main()

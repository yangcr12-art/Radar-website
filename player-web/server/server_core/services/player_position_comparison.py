"""Independent report cohort; never persists or changes the full-dataset radar metrics."""
from copy import deepcopy
import re


def primary_position(player):
    raw = player.get('raw', {})
    value = next((v for k, v in raw.items() if str(k).strip().lower() == 'position'), '')
    if value is None:
        return ''
    return re.split(r'[,，/;；]', str(value).strip())[0].strip().upper()


def position_comparison_doc(doc, player_id):
    selected = next((p for p in doc.get('players', []) if p.get('id') == player_id), None)
    if selected is None:
        raise LookupError('player not found')
    position = primary_position(selected)
    if not position or position in {'-', 'N/A', 'NONE', 'NAN', 'UNKNOWN'}:
        raise ValueError('球员缺少登记位置，无法生成同位置分析。请补齐 Position 字段。')
    cohort = deepcopy(doc)
    cohort['players'] = [p for p in cohort.get('players', []) if primary_position(p) == position]
    return cohort, {'mode': 'position', 'position': position, 'playerCount': len(cohort['players']), 'rule': 'first_registered_position_exact'}

import unittest
from copy import deepcopy
from unittest.mock import patch
from flask import Flask
from server_core.routes.player_data_api import player_data_bp
from server_core.services.player_position_comparison import position_comparison_doc, primary_position

class PlayerPositionComparisonTest(unittest.TestCase):
    def setUp(self):
        self.doc = {'updatedAt':'test', 'schema': {'playerColumn':'Player','allColumns':['Player','Position','Shots per 90']}, 'players':[
            {'id':str(i),'player':str(i),'raw':{'Player':str(i),'Position':'CF, RW' if i<10 else 'GK','Shots per 90':i if i<10 else 100}} for i in range(15)]}

    def test_cohort_is_primary_position_and_does_not_modify_source(self):
        before=deepcopy(self.doc)
        doc, meta=position_comparison_doc(self.doc,'0')
        self.assertEqual(len(doc['players']),10)
        self.assertEqual(meta['position'],'CF')
        doc['players'][0]['raw']['Shots per 90']=500
        self.assertEqual(self.doc,before)
        self.assertEqual(primary_position({'raw':{'Position':' cf / rw '}}),'CF')
        self.assertEqual(primary_position({'raw':{'Position':'RCF'}}),'RCF')

    def test_missing_position_never_falls_back_to_mixed_cohort(self):
        self.doc['players'][0]['raw']['Position']=''
        with self.assertRaises(ValueError): position_comparison_doc(self.doc,'0')
        with self.assertRaises(LookupError): position_comparison_doc(self.doc,'missing')

    def test_endpoint_recalculates_only_requested_report(self):
        app=Flask(__name__); app.register_blueprint(player_data_bp)
        with patch('server_core.routes.player_data_api.load_player_index',return_value={}), patch('server_core.routes.player_data_api.resolve_dataset',side_effect=lambda *a: ('d',deepcopy(self.doc))):
            full=app.test_client().get('/api/player-data/player/9?datasetId=d').get_json()
            report=app.test_client().get('/api/player-data/player/9?datasetId=d&comparison=position').get_json()
        full_row=next(r for r in full['player']['columns'] if r['column']=='Shots per 90')
        report_row=next(r for r in report['player']['columns'] if r['column']=='Shots per 90')
        self.assertEqual(full_row['comparisonCount'],15)
        self.assertEqual(report_row['comparisonCount'],10)
        self.assertAlmostEqual(full_row['rawPercentile'],63.33)
        self.assertEqual(report_row['rawPercentile'],95)
        self.assertEqual(report['player']['comparison']['mode'],'position')
        self.assertEqual(full['player']['comparison']['mode'],'dataset')

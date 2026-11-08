import base64
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'local-ai'))
import server
import reconstruct
from test_server import image_data


class ReconstructionContract(unittest.TestCase):
    def test_standalone_3d_payload_is_validated_and_stripped(self):
        data = server.validate_payload({'kind':'3d', 'image':image_data(), 'token':'not-copied', 'url':'https://evil.test'})
        self.assertEqual(set(data), {'kind', 'image'})
        with self.assertRaises(ValueError): server.validate_payload({'kind':'3d','image':'https://evil.test/photo'})
        with self.assertRaises(ValueError): server.validate_payload({'kind':'unexpected'})

    def test_tryon_3d_option_must_be_boolean(self):
        p = {'person':image_data(),'garment':image_data(),'category':'tops','photo_type':'model','steps':20,'seed':0,'output3d':True}
        self.assertTrue(server.validate_payload(p)['output3d'])
        p['output3d'] = 'yes'
        with self.assertRaises(ValueError): server.validate_payload(p)

    def test_3d_worker_returns_mesh_contract(self):
        # Explicit worker fixture; no claim that this performs GPU inference.
        messages=[]
        stub=SimpleNamespace(inspect_3d=lambda:{'ready':True},build_mesh=lambda image, progress:b'fixture mesh')
        with patch.dict(sys.modules, {'reconstruct':stub}):
            server.run_inference(SimpleNamespace(put=messages.append), {'kind':'3d','image':image_data()})
        self.assertEqual(messages[-1]['status'],'done')
        self.assertEqual(base64.b64decode(messages[-1]['glb'].split(',')[1]),b'fixture mesh')

    def test_uninstalled_3d_reports_setup_instead_of_fake_result(self):
        messages=[]
        stub=SimpleNamespace(inspect_3d=lambda:{'ready':False,'message':'Install 3D first'},build_mesh=lambda *args:None)
        with patch.dict(sys.modules, {'reconstruct':stub}):
            server.run_inference(SimpleNamespace(put=messages.append), {'kind':'3d','image':image_data()})
        self.assertEqual(messages[-1],{'status':'error','error':'Install 3D first'})


if __name__ == '__main__': unittest.main()

import base64
import http.client
import io
import json
from pathlib import Path
import sys
import threading
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'local-ai'))
import server
from PIL import Image

def image_data():
    output = io.BytesIO()
    Image.new('RGBA', (12, 20), (255, 0, 0, 128)).save(output, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(output.getvalue()).decode()

class FakeJobs:
    """API contract fixture. Never used by the application or published UI."""
    def __init__(self): self.last = None
    def runtime_check(self): return {'ready': True, 'gpu': 'TEST FIXTURE'}
    def start(self, payload): self.last=payload; return {'id': 'a'*32}
    def get(self, identifier):
        if identifier != 'a'*32: raise KeyError(identifier)
        return {'id':identifier,'status':'done','image':image_data()}
    def cancel(self, identifier): return {'status':'cancelled'}

class LocalAPITest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.jobs=FakeJobs();cls.http=server.LocalServer(('127.0.0.1',0),'test-token',cls.jobs)
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown();cls.http.server_close();cls.thread.join()
    def request(self,path,method='GET',body=None,headers=None):
        h={'Authorization':'Bearer test-token','Origin':'https://mkj5956.github.io'}
        if body is not None:h['Content-Type']='application/json';body=json.dumps(body)
        if headers:h.update(headers)
        conn=http.client.HTTPConnection('127.0.0.1',self.http.server_port,timeout=10)
        conn.request(method,path,body,h);response=conn.getresponse();raw=response.read()
        result=(response.status,dict(response.getheaders()),raw);conn.close();return result
    def payload(self):return {'person':image_data(),'garment':image_data(),'category':'tops','photo_type':'flat-lay','steps':30,'seed':42}
    def test_health_requires_token(self):
        status,_,_=self.request('/api/health',headers={'Authorization':''});self.assertEqual(status,401)
        status,headers,raw=self.request('/api/health');self.assertEqual(status,200);self.assertTrue(json.loads(raw)['ready']);self.assertEqual(headers['Access-Control-Allow-Origin'],'https://mkj5956.github.io')
    def test_unknown_origin_and_rebinding_blocked(self):
        status,headers,_=self.request('/api/health',headers={'Origin':'https://evil.test'});self.assertEqual(status,403);self.assertNotIn('Access-Control-Allow-Origin',headers)
        status,_,_=self.request('/api/health',headers={'Host':'evil.test'});self.assertEqual(status,403)
    def test_preflight_allows_authorized_origin(self):
        status,headers,_=self.request('/api/jobs','OPTIONS',headers={'Access-Control-Request-Method':'POST'});self.assertEqual(status,204);self.assertEqual(headers['Access-Control-Allow-Private-Network'],'true')
    def test_upload_poll_and_cancel_contract(self):
        status,_,raw=self.request('/api/jobs','POST',self.payload());self.assertEqual(status,202)
        job=json.loads(raw)['id'];self.assertEqual(self.jobs.last['photo_type'],'flat-lay')
        status,_,raw=self.request('/api/jobs/'+job);self.assertEqual(json.loads(raw)['status'],'done')
        status,_,raw=self.request('/api/jobs/'+job+'/cancel','POST',{});self.assertEqual(json.loads(raw)['status'],'cancelled')
    def test_invalid_payload_and_image_are_rejected(self):
        p=self.payload();p['person']='https://evil.test/person.jpg';self.assertEqual(self.request('/api/jobs','POST',p)[0],400)
        p=self.payload();p['category']='unknown';self.assertEqual(self.request('/api/jobs','POST',p)[0],400)
        p=self.payload();p['seed']=True;self.assertEqual(self.request('/api/jobs','POST',p)[0],400)
    def test_content_type_and_size_guard(self):
        self.assertEqual(self.request('/api/jobs','POST',{},headers={'Content-Type':'text/plain'})[0],415)
        self.assertEqual(self.request('/api/jobs','POST',{},headers={'Content-Length':str(server.MAX_BODY+1)})[0],413)
    def test_static_does_not_serve_private_paths(self):
        self.assertEqual(self.request('/')[0],200)
        for path in ['/../server.py','/weights/model.safetensors','/.ready.json','/data/private.png']:
            self.assertEqual(self.request(path)[0],404)
    def test_decode_composites_transparency_on_white(self):
        img=server.decode_image(image_data());self.assertEqual(img.mode,'RGB');r,g,b=img.getpixel((0,0));self.assertEqual(r,255);self.assertGreater(g,100);self.assertGreater(b,100)
    def test_unknown_job(self):
        self.assertEqual(self.request('/api/jobs/'+'b'*32)[0],404)
    def test_3d_requests_are_authenticated_and_keep_only_photo(self):
        payload={'kind':'3d','image':image_data(),'url':'https://evil.test'}
        self.assertEqual(self.request('/api/jobs','POST',payload,headers={'Authorization':''})[0],401)
        self.assertEqual(self.request('/api/jobs','POST',payload)[0],202)
        self.assertEqual(set(self.jobs.last),{'kind','image'})
    def test_new_static_files_and_binary_models_are_served(self):
        for path in ['/admin.html','/catalog-core.js','/vendor/model-viewer.min.js','/demo/catalog.json','/demo/look-1.glb']:
            self.assertEqual(self.request(path)[0],200)

if __name__=='__main__':unittest.main()

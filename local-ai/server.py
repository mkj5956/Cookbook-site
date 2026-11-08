"""Local-only virtual try-on bridge. Images are never sent to an online AI service."""
from __future__ import annotations

import argparse
import base64
import importlib.util
import io
import json
import multiprocessing as mp
import os
from pathlib import Path
import queue
import re
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, quote
import webbrowser

ROOT = Path(__file__).resolve().parent
WEB_ROOT = ROOT.parent / 'web'
PAGES_URL = 'https://mkj5956.github.io/Cookbook-site/'
MAX_BODY = 28 * 1024 * 1024
MAX_IMAGE = 10 * 1024 * 1024
CATEGORIES = {'tops', 'bottoms', 'one-pieces'}
ALLOWED_ORIGINS = {'https://mkj5956.github.io', 'http://127.0.0.1:8765', 'http://localhost:8765'}
os.environ['HF_HOME'] = str(ROOT / 'cache' / 'huggingface')
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['DO_NOT_TRACK'] = '1'


def decode_image(value):
    from PIL import Image, ImageOps
    if not isinstance(value, str) or len(value) > MAX_IMAGE * 4 // 3 + 200:
        raise ValueError('사진 크기가 너무 큽니다.')
    match = re.fullmatch(r'data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})', value)
    if not match:
        raise ValueError('JPG, PNG, WebP 이미지가 필요합니다.')
    try:
        raw = base64.b64decode(match.group(2), validate=True)
        if len(raw) > MAX_IMAGE:
            raise ValueError('사진 크기가 너무 큽니다.')
        image = Image.open(io.BytesIO(raw))
        if image.format not in {'JPEG', 'PNG', 'WEBP'} or image.width * image.height > 60_000_000:
            raise ValueError('지원하지 않는 이미지입니다.')
        image = ImageOps.exif_transpose(image)
        image.thumbnail((1600, 1600))
        if image.mode == 'RGBA' or 'transparency' in image.info:
            rgba = image.convert('RGBA')
            white = Image.new('RGB', rgba.size, 'white')
            white.paste(rgba, mask=rgba.getchannel('A'))
            return white
        return image.convert('RGB')
    except (OSError, base64.binascii.Error, Image.DecompressionBombError) as exc:
        raise ValueError('이미지를 읽을 수 없습니다.') from exc


def validate_payload(payload):
    if not isinstance(payload, dict):
        raise ValueError('올바른 요청이 아닙니다.')
    if payload.get('kind') == '3d':
        decode_image(payload.get('image'))
        return {'kind': '3d', 'image': payload['image']}
    if payload.get('kind') not in {None, 'tryon'}:
        raise ValueError('지원하지 않는 AI 작업입니다.')
    if 'output3d' in payload and type(payload['output3d']) is not bool:
        raise ValueError('3D 생성 옵션이 올바르지 않습니다.')
    if payload.get('category') not in CATEGORIES:
        raise ValueError('옷 종류를 선택해주세요.')
    if payload.get('photo_type') not in {'model', 'flat-lay'}:
        raise ValueError('사진 형태를 선택해주세요.')
    if type(payload.get('steps')) is not int or payload['steps'] not in {20, 30, 50}:
        raise ValueError('합성 품질 값이 올바르지 않습니다.')
    if type(payload.get('seed')) is not int or not 0 <= payload['seed'] <= 2147483647:
        raise ValueError('시드 값이 올바르지 않습니다.')
    decode_image(payload.get('person'))
    decode_image(payload.get('garment'))
    result = {key: payload[key] for key in ('person', 'garment', 'category', 'photo_type', 'steps', 'seed')}
    result['output3d'] = payload.get('output3d', False)
    return result


def inspect_runtime():
    missing = [name for name in ('torch', 'fashn_vton', 'onnxruntime', 'fashn_human_parser', 'PIL') if importlib.util.find_spec(name) is None]
    if missing:
        return {'ready': False, 'message': 'AI 프로그램 설치가 필요합니다. 1_INSTALL.bat를 먼저 실행해주세요.'}
    paths = [ROOT / 'weights' / 'model.safetensors', ROOT / 'weights' / 'dwpose' / 'yolox_l.onnx', ROOT / 'weights' / 'dwpose' / 'dw-ll_ucoco_384.onnx', ROOT / '.ready.json']
    if not all(path.exists() for path in paths):
        return {'ready': False, 'message': 'AI 파일 다운로드 또는 준비 검사가 완료되지 않았습니다. 1_INSTALL.bat를 다시 실행해주세요.'}
    try:
        import torch
        if not torch.cuda.is_available():
            return {'ready': False, 'message': 'NVIDIA 그래픽카드를 사용할 수 없습니다. 드라이버와 0_CHECK_PC.bat 결과를 확인해주세요.'}
        info = torch.cuda.get_device_properties(0)
        vram = round(info.total_memory / 1024**3, 1)
        if info.major < 8:
            return {'ready': False, 'gpu': info.name, 'vram_gb': vram, 'message': '이 구성은 RTX 30 시리즈 이상의 NVIDIA GPU를 대상으로 합니다. 현재 그래픽카드용 설정이 필요합니다.'}
        if vram < 7.5:
            return {'ready': False, 'gpu': info.name, 'vram_gb': vram, 'message': 'VRAM이 8GB보다 작습니다. 이 AI 모델을 실행할 메모리가 부족할 수 있어 실행을 중단했습니다.'}
        return {'ready': True, 'gpu': info.name, 'vram_gb': vram, 'message': 'AI 준비 완료. 약 8GB VRAM이 필요하며 다른 GPU 프로그램은 종료해주세요.'}
    except Exception:
        return {'ready': False, 'message': 'GPU 초기화에 실패했습니다. 최신 NVIDIA 드라이버 설치 후 PC를 다시 시작해주세요.'}


def run_inference(output, payload):
    try:
        if payload.get('kind') == '3d':
            from reconstruct import build_mesh, inspect_3d
            health = inspect_3d()
            if not health['ready']:
                output.put({'status': 'error', 'error': health['message']})
                return
            mesh = build_mesh(decode_image(payload['image']), lambda message: output.put({'status': 'running', 'message': message}))
            output.put({'status': 'done', 'glb': 'data:model/gltf-binary;base64,' + base64.b64encode(mesh).decode('ascii')})
            return
        output.put({'status': 'running', 'message': '내 PC에서 AI 모델을 불러오고 있습니다. 첫 단계는 시간이 걸릴 수 있어요.'})
        import torch  # Loads CUDA runtime DLLs before ONNX Runtime on Windows.
        import onnxruntime as ort
        if hasattr(ort, 'preload_dlls'):
            ort.preload_dlls()
        from fashn_vton import TryOnPipeline
        person, garment = decode_image(payload['person']), decode_image(payload['garment'])
        pipeline = TryOnPipeline(weights_dir=str(ROOT / 'weights'), device='cuda')
        output.put({'status': 'running', 'message': '1/2 · 체형과 옷을 분석해 가상착용 사진을 만들고 있습니다.'})
        result = pipeline(person_image=person, garment_image=garment, category=payload['category'], garment_photo_type=payload['photo_type'], num_samples=1, num_timesteps=payload['steps'], seed=payload['seed'], segmentation_free=True)
        buffer = io.BytesIO()
        result.images[0].save(buffer, format='PNG')
        fitted = result.images[0].copy()
        response = {'status': 'done', 'message': '완료', 'image': 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode('ascii')}
        if payload.get('output3d'):
            # Free try-on weights before loading reconstruction: GPUs need not
            # hold both models simultaneously. Keep the 2D result on 3D failure.
            del pipeline, result, person, garment
            import gc
            gc.collect()
            torch.cuda.empty_cache()
            try:
                from reconstruct import build_mesh, inspect_3d
                health = inspect_3d()
                if not health['ready']:
                    raise ValueError(health['message'])
                mesh = build_mesh(fitted, lambda message: output.put({'status': 'running', 'message': message}))
                response['glb'] = 'data:model/gltf-binary;base64,' + base64.b64encode(mesh).decode('ascii')
            except Exception as exc:
                print(f'3D error: {type(exc).__name__}: {exc}', flush=True)
                response['three_d_error'] = str(exc)[:300] or '3D 생성 실패. PC 실행 창을 확인해주세요.'
        output.put(response)
    except Exception as exc:
        detail = str(exc)
        print(f'AI error: {type(exc).__name__}: {detail}', flush=True)
        if 'out of memory' in detail.lower():
            message = '그래픽카드 메모리가 부족합니다. 게임·다른 AI 프로그램을 종료한 뒤 다시 시도해주세요. 8GB 카드에서는 실행이 어려울 수 있습니다.'
        elif 'offline' in detail.lower() or 'not found' in detail.lower() or 'cache' in detail.lower():
            message = '필요한 AI 파일을 찾지 못했습니다. 인터넷에 연결한 뒤 1_INSTALL.bat를 다시 실행해주세요.'
        else:
            message = 'AI 합성에 실패했습니다. 사진에 인물과 옷이 잘 보이는지 확인하고, PC 실행 창의 오류를 확인해주세요.'
        output.put({'status': 'error', 'error': message})


class JobManager:
    def __init__(self, runtime_check=inspect_runtime, worker=run_inference):
        self.lock = threading.RLock()
        self.jobs = {}
        self.active = None
        self.process = None
        self.runtime_check = runtime_check
        self.worker = worker

    def start(self, payload):
        with self.lock:
            if self.active:
                raise RuntimeError('이미 다른 AI 작업이 진행 중입니다. 완료 후 다시 선택해주세요.')
            health = self.runtime_check()
            if not health['ready']:
                raise ValueError(health['message'])
            now = time.time()
            self.jobs = {k: v for k, v in self.jobs.items() if now - v['created'] < 1800}
            while len(self.jobs) >= 5:
                self.jobs.pop(next(iter(self.jobs)))
            job_id = secrets.token_hex(16)
            self.jobs[job_id] = {'id': job_id, 'status': 'running', 'message': 'AI 시작 중', 'created': now}
            self.active = job_id
            context = mp.get_context('spawn')
            output = context.Queue()
            self.process = context.Process(target=self.worker, args=(output, payload), daemon=True)
            try:
                self.process.start()
            except Exception:
                self.active = None
                self.process = None
                self.jobs.pop(job_id, None)
                output.close()
                raise
            threading.Thread(target=self._monitor, args=(job_id, self.process, output), daemon=True).start()
            return {'id': job_id}

    def _monitor(self, job_id, process, output):
        began = time.monotonic()
        try:
            while True:
                try:
                    update = output.get(timeout=0.4)
                    with self.lock:
                        if self.jobs[job_id]['status'] == 'cancelled':
                            break
                        self.jobs[job_id].update(update)
                    if update['status'] in {'done', 'error'}:
                        break
                except queue.Empty:
                    with self.lock:
                        if self.jobs[job_id]['status'] == 'cancelled':
                            break
                    if not process.is_alive():
                        with self.lock:
                            self.jobs[job_id].update(status='error', error='AI 프로세스가 종료됐습니다. PC 실행 창을 확인해주세요.')
                        break
                    if time.monotonic() - began > 1800:
                        with self.lock:
                            self.jobs[job_id].update(status='error', error='30분 내에 완료되지 않아 작업을 중단했습니다. GPU 상태를 확인해주세요.')
                        break
        finally:
            process.join(timeout=2)
            if process.is_alive():
                process.terminate()
                process.join(timeout=5)
            output.close()
            with self.lock:
                if self.active == job_id:
                    self.active = None
                    self.process = None

    def get(self, job_id):
        with self.lock:
            if job_id not in self.jobs:
                raise KeyError(job_id)
            return dict(self.jobs[job_id])

    def cancel(self, job_id):
        with self.lock:
            job = self.jobs.get(job_id)
            if job is None:
                raise KeyError(job_id)
            if job['status'] == 'running':
                job.update(status='cancelled', message='취소됨')
                if self.active == job_id and self.process and self.process.is_alive():
                    self.process.terminate()
            return {'status': job['status']}

    def close(self):
        with self.lock:
            if self.active:
                self.cancel(self.active)


class LocalServer(ThreadingHTTPServer):
    daemon_threads = True
    def __init__(self, address, token, jobs=None):
        super().__init__(address, Handler)
        self.token = token
        self.jobs = jobs or JobManager()


class Handler(BaseHTTPRequestHandler):
    server_version = 'LookbookLocal/1.0'
    def log_message(self, fmt, *args):
        # Do not log URLs, headers, tokens, filenames, or photo bodies.
        pass

    def setup(self):
        super().setup()
        self.connection.settimeout(60)

    def _origin(self):
        return self.headers.get('Origin')

    def _trusted(self):
        host = self.headers.get('Host', '')
        allowed_hosts = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
        if host not in allowed_hosts:
            self._json(403, {'error': '허용되지 않은 호스트입니다.'})
            return False
        origin = self._origin()
        local = {f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}'}
        if origin and origin not in ALLOWED_ORIGINS | local:
            self._json(403, {'error': '허용되지 않은 사이트입니다.'})
            return False
        return True

    def _auth(self):
        if not self._trusted():
            return False
        authorization = self.headers.get('Authorization', '')
        if not secrets.compare_digest(authorization.encode('utf-8'), f'Bearer {self.server.token}'.encode('utf-8')):
            self._json(401, {'error': '연결 코드가 맞지 않습니다. 2_START.bat가 연 새 페이지를 사용해주세요.'})
            return False
        return True

    def _headers(self, status, mime, length):
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(length))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        origin = self._origin()
        local = {f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}'}
        if origin in ALLOWED_ORIGINS | local:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.end_headers()

    def _json(self, status, payload):
        raw = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self._headers(status, 'application/json; charset=utf-8', len(raw))
        try:
            self.wfile.write(raw)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_OPTIONS(self):
        if not self._trusted():
            return
        if self.headers.get('Access-Control-Request-Method') not in {'GET', 'POST'}:
            return self._json(405, {'error': '허용되지 않은 요청입니다.'})
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', self._origin() or '')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Access-Control-Max-Age', '600')
        self.send_header('Vary', 'Origin')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith('/api/'):
            if not self._auth():
                return
            if path == '/api/health':
                from reconstruct import inspect_3d
                return self._json(200, {**self.server.jobs.runtime_check(), 'three_d': inspect_3d()})
            match = re.fullmatch(r'/api/jobs/([a-f0-9]{32})', path)
            if match:
                try:
                    return self._json(200, self.server.jobs.get(match.group(1)))
                except KeyError:
                    return self._json(404, {'error': '작업을 찾지 못했습니다. AI가 재시작되었을 수 있습니다.'})
            return self._json(404, {'error': '주소를 찾을 수 없습니다.'})
        if not self._trusted():
            return
        # Only these public files may be served. Never expose model weights or data.
        static = {'/': ('index.html', 'text/html'), '/index.html': ('index.html', 'text/html'), '/admin.html': ('admin.html', 'text/html'), '/favicon.svg': ('favicon.svg', 'image/svg+xml'), '/catalog.json': ('catalog.json', 'application/json'), '/vendor/model-viewer.min.js': ('vendor/model-viewer.min.js', 'text/javascript')}
        for name in ('styles.css', 'showroom.css'):
            static['/' + name] = (name, 'text/css')
        for name in ('app.js', 'core.js', 'catalog-core.js', 'viewer.js', 'admin-auth.js', 'github-publisher.js'):
            static['/' + name] = (name, 'text/javascript')
        if path == '/demo/catalog.json':
            static[path] = ('demo/catalog.json', 'application/json')
        if re.fullmatch(r'/demo/(look-[1-6]\.glb|item-[1-6]\.svg)', path) or re.fullmatch(r'/media/[a-f0-9]{64}\.(glb|jpg|png|webp)', path):
            import mimetypes
            static[path] = (path[1:], 'model/gltf-binary' if path.endswith('.glb') else mimetypes.guess_type(path)[0] or 'application/octet-stream')
        if path not in static:
            return self._json(404, {'error': '주소를 찾을 수 없습니다.'})
        name, mime = static[path]
        try:
            raw = (WEB_ROOT / name).read_bytes()
        except OSError:
            return self._json(404, {'error': '화면 파일이 없습니다. 전체 ZIP을 다시 내려받아 압축을 풀어주세요.'})
        self._headers(200, mime + '; charset=utf-8', len(raw))
        self.wfile.write(raw)

    def do_POST(self):
        if not self._auth():
            return
        if self.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json':
            return self._json(415, {'error': 'JSON 요청만 지원합니다.'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > MAX_BODY:
                return self._json(413, {'error': '요청 크기가 너무 큽니다.'})
            body = json.loads(self.rfile.read(length))
            path = urlparse(self.path).path
            if path == '/api/jobs':
                payload = validate_payload(body)
                return self._json(202, self.server.jobs.start(payload))
            match = re.fullmatch(r'/api/jobs/([a-f0-9]{32})/cancel', path)
            if match:
                return self._json(200, self.server.jobs.cancel(match.group(1)))
            return self._json(404, {'error': '주소를 찾을 수 없습니다.'})
        except (ValueError, UnicodeDecodeError) as exc:
            return self._json(400, {'error': str(exc)[:300]})
        except KeyError:
            return self._json(404, {'error': '작업을 찾을 수 없습니다.'})
        except RuntimeError as exc:
            return self._json(409, {'error': str(exc)[:300]})
        except Exception as exc:
            print(f'Local server error: {type(exc).__name__}: {exc}', flush=True)
            return self._json(500, {'error': 'PC에서 요청 처리에 실패했습니다. 실행 창을 확인해주세요.'})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--local-page', action='store_true', help='Open the bundled offline page instead of GitHub Pages.')
    args = parser.parse_args()
    token = secrets.token_urlsafe(32)
    try:
        server = LocalServer(('127.0.0.1', 8765), token)
    except OSError:
        print('8765 포트를 사용할 수 없습니다. 이미 실행 중인 AI 창을 확인해주세요.', flush=True)
        return 1
    print('\n룩북 PC AI를 시작했습니다. 이 창을 열어두세요. 종료: Ctrl+C', flush=True)
    print(f'연결 코드: {token}', flush=True)
    target = 'http://127.0.0.1:8765/admin.html' if args.local_page else PAGES_URL + 'admin.html'
    url = target + '#local-token=' + quote(token)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever(poll_interval=.3)
    except KeyboardInterrupt:
        pass
    finally:
        server.jobs.close()
        server.server_close()
    return 0


if __name__ == '__main__':
    mp.freeze_support()
    raise SystemExit(main())

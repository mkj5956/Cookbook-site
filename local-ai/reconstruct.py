"""Offline photo -> colored 3D mesh. Not a scan, rig or cloth simulator."""
from pathlib import Path
import importlib.util
import os
import sys

ROOT = Path(__file__).resolve().parent
WEIGHTS = ROOT / 'weights' / 'triposr'


def configure():
    os.environ['HF_HOME'] = str(ROOT / 'cache' / 'huggingface')
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    os.environ['U2NET_HOME'] = str(ROOT / 'weights' / 'rembg')
    os.environ['LOOKBOOK_DINO_CONFIG'] = str(WEIGHTS / 'dino-config.json')
    vendor = str(ROOT / 'third_party' / 'triposr')
    if vendor not in sys.path:
        sys.path.insert(0, vendor)


def inspect_3d():
    packages = ('torch', 'transformers', 'omegaconf', 'trimesh', 'skimage', 'rembg', 'imageio')
    if any(importlib.util.find_spec(name) is None for name in packages):
        return {'ready': False, 'message': '3D 프로그램 설치가 필요합니다. 최신 ZIP의 4_INSTALL_3D.bat를 실행해주세요.'}
    paths = [WEIGHTS / 'model.ckpt', WEIGHTS / 'config.yaml', WEIGHTS / 'dino-config.json', ROOT / 'weights/rembg/u2net_human_seg.onnx', ROOT / '.ready3d.json']
    if not all(p.is_file() for p in paths):
        return {'ready': False, 'message': '3D AI 파일 준비가 끝나지 않았습니다. 4_INSTALL_3D.bat를 실행해주세요.'}
    return {'ready': True, 'message': '3D AI 준비 완료'}


def build_mesh(image, progress=lambda message: None):
    configure()
    # No implicit network downloads: all four model/config files must exist.
    required = [WEIGHTS / 'model.ckpt', WEIGHTS / 'config.yaml', WEIGHTS / 'dino-config.json', ROOT / 'weights/rembg/u2net_human_seg.onnx']
    if not all(p.is_file() for p in required):
        raise ValueError('3D 모델 파일이 없습니다. 4_INSTALL_3D.bat를 실행해주세요.')
    import numpy as np
    import torch
    from PIL import Image
    import rembg
    from tsr.system import TSR
    from tsr.utils import resize_foreground

    if not torch.cuda.is_available():
        raise ValueError('3D 생성에 사용할 NVIDIA GPU를 찾지 못했습니다.')
    progress('2/2 · 배경을 분리하고 3D 캐릭터를 준비합니다.')
    session = rembg.new_session('u2net_human_seg', providers=['CPUExecutionProvider'])
    rgba = rembg.remove(image.convert('RGB'), session=session).convert('RGBA')
    del session
    # Remove faint alpha noise before cropping; fail clearly on empty masks.
    alpha = np.array(rgba.getchannel('A'))
    alpha[alpha < 16] = 0
    if np.count_nonzero(alpha) < 100:
        raise ValueError('사람을 찾지 못했습니다. 몸 전체가 보이는 사진으로 시도해주세요.')
    rgba.putalpha(Image.fromarray(alpha))
    rgba = resize_foreground(rgba, .85)
    array = np.asarray(rgba, dtype=np.float32) / 255.0
    rgb = array[:, :, :3] * array[:, :, 3:4] + (1 - array[:, :, 3:4]) * .5
    input_image = Image.fromarray((rgb * 255).astype(np.uint8))
    progress('2/2 · 사진의 입체 형태를 추정합니다. 등과 옆모습은 실제와 다를 수 있어요.')
    model = TSR.from_pretrained(str(WEIGHTS), config_name='config.yaml', weight_name='model.ckpt')
    model.eval().to('cuda')
    model.renderer.set_chunk_size(4096)
    with torch.inference_mode():
        codes = model([input_image], device='cuda')
        progress('2/2 · 표면과 색을 추출해 회전 가능한 3D 파일을 만듭니다.')
        mesh = model.extract_mesh(codes, has_vertex_color=True, resolution=192)[0]
    if len(mesh.faces) < 10:
        raise ValueError('3D 형태를 만들지 못했습니다. 다른 전신 사진으로 다시 시도해주세요.')
    mesh.fix_normals()
    # TripoSR uses z-up; glTF/model-viewer uses y-up. Preserve a consistent
    # initial angle; users can freely orbit all generated sides.
    mesh.apply_transform(np.array([[1, 0, 0, 0], [0, 0, 1, 0], [0, -1, 0, 0], [0, 0, 0, 1]], dtype=float))
    raw = mesh.export(file_type='glb')
    if len(raw) > 20 * 1024 * 1024:
        raise ValueError('3D 파일이 20MB를 넘었습니다. 더 단순한 배경으로 다시 생성해주세요.')
    return raw

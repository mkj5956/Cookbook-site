"""Install-time download and offline load check for the photo-to-3D model."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
TRIPOSR_REVISION = '5b521936b01fbe1890f6f9baed0254ab6351c04a'
DINO_REVISION = 'f205d5d8e640a89a2b8ef0369670dfc37cc07fc2'


def main():
    os.environ['HF_HOME'] = str(ROOT / 'cache' / 'huggingface')
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    os.environ['U2NET_HOME'] = str(ROOT / 'weights' / 'rembg')
    os.environ.pop('HF_HUB_OFFLINE', None)
    os.environ.pop('TRANSFORMERS_OFFLINE', None)
    from huggingface_hub import hf_hub_download
    weights = ROOT / 'weights' / 'triposr'
    weights.mkdir(parents=True, exist_ok=True)
    for filename in ('config.yaml', 'model.ckpt'):
        print(f'Downloading TripoSR {filename}...', flush=True)
        hf_hub_download(repo_id='stabilityai/TripoSR', filename=filename, revision=TRIPOSR_REVISION, local_dir=str(weights))
    dino = hf_hub_download(repo_id='facebook/dino-vitb16', filename='config.json', revision=DINO_REVISION)
    (weights / 'dino-config.json').write_bytes(Path(dino).read_bytes())
    print('Preparing offline person-background removal...', flush=True)
    import rembg
    session = rembg.new_session('u2net_human_seg', providers=['CPUExecutionProvider'])
    del session
    print('Checking offline 3D model loading (this needs RAM)...', flush=True)
    result = subprocess.run([sys.executable, str(ROOT / 'verify_3d.py')], cwd=ROOT)
    if result.returncode:
        raise SystemExit(result.returncode)
    (ROOT / '.ready3d.json').write_text(json.dumps({'prepared_at': time.time(), 'model': 'TripoSR', 'revision': TRIPOSR_REVISION}), encoding='utf-8')
    print('3D ready. Run 2_START.bat, sign in as the owner, and select a garment.', flush=True)


if __name__ == '__main__':
    main()

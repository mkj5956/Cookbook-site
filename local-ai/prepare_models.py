"""Install-time downloads only; server.py runs offline afterwards."""
import json
import os
from pathlib import Path
import time

ROOT = Path(__file__).resolve().parent
os.environ['HF_HOME'] = str(ROOT / 'cache' / 'huggingface')
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['DO_NOT_TRACK'] = '1'
os.environ.pop('HF_HUB_OFFLINE', None)
os.environ.pop('TRANSFORMERS_OFFLINE', None)

def main():
    from huggingface_hub import hf_hub_download
    weights = ROOT / 'weights'
    for repo, filename, directory in [
        ('fashn-ai/fashn-vton-1.5', 'model.safetensors', weights),
        ('fashn-ai/DWPose', 'yolox_l.onnx', weights / 'dwpose'),
        ('fashn-ai/DWPose', 'dw-ll_ucoco_384.onnx', weights / 'dwpose'),
    ]:
        print(f'Downloading: {repo}/{filename}', flush=True)
        hf_hub_download(repo_id=repo, filename=filename, local_dir=str(directory))
    print('Preparing the human parser...', flush=True)
    from fashn_human_parser import FashnHumanParser
    parser = FashnHumanParser(device='cpu')
    del parser
    print('Checking offline model loading...', flush=True)
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    import subprocess, sys
    result = subprocess.run([sys.executable, str(ROOT / 'verify_ai.py')], cwd=ROOT)
    if result.returncode:
        raise SystemExit(result.returncode)
    (ROOT / '.ready.json').write_text(json.dumps({'prepared_at':time.time(), 'model':'fashn-vton-1.5', 'code_commit':'7c0f10af3f91ad4048fe9729c470a13ef905d25a'}), encoding='utf-8')
    print('Ready. You can now run 2_START.bat.', flush=True)

if __name__ == '__main__':
    main()

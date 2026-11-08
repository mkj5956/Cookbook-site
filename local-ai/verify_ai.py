"""Checks actual local model initialization, not image generation."""
import os
from pathlib import Path
ROOT = Path(__file__).resolve().parent
os.environ['HF_HOME'] = str(ROOT / 'cache' / 'huggingface')
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'

if __name__ == '__main__':
    import torch
    if not torch.cuda.is_available():
        raise SystemExit('NVIDIA CUDA GPU is unavailable. Update your NVIDIA driver and restart Windows.')
    device = torch.cuda.get_device_properties(0)
    if device.major < 8 or device.total_memory < 7.5 * 1024**3:
        raise SystemExit('This package targets NVIDIA RTX 30 series or newer, with at least 8 GB VRAM (12 GB recommended).')
    import onnxruntime as ort
    if hasattr(ort, 'preload_dlls'):
        ort.preload_dlls()
    from fashn_vton import TryOnPipeline
    pipeline = TryOnPipeline(weights_dir=str(ROOT / 'weights'), device='cuda')
    print(f'Offline model loading passed: {device.name}', flush=True)
    print('This checks model loading; the first try-on still needs to be verified on your PC.', flush=True)

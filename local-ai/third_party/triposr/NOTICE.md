# TripoSR integration

Source: https://github.com/VAST-AI-Research/TripoSR

Pinned commit: `107cefdc244c39106fa830359024f6a2f1c78871`.
The original MIT license is included in `LICENSE`; individual upstream file notices are retained.

Local modifications:

- `models/isosurface.py` uses our `cpu_marching_cubes.py` adapter backed by scikit-image. This avoids compiling torchmcubes/CUDA extensions on Windows. Reconstruction and color queries still run on the GPU.
- `system.py` explicitly loads tensor-only checkpoints with `weights_only=True`.
- `models/tokenizers/image.py` accepts a predownloaded `LOOKBOOK_DINO_CONFIG` file. No network request is needed during generation.

This is single-image reconstruction, not a clothing simulation or a body scan. Faces, hands, backs and garment details may be inaccurate. Output meshes have vertex colors and no animation rig.

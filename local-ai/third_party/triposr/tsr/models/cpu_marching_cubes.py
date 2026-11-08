"""CPU isosurface adapter matching torchmcubes' coordinate convention."""
def marching_cubes(volume, threshold):
    import numpy as np
    import torch
    from skimage.measure import marching_cubes as extract
    array = volume.detach().cpu().float().numpy()
    if not float(array.min()) < threshold < float(array.max()):
        raise ValueError('3D 표면을 찾지 못했습니다. 배경이 단순한 전신 사진으로 다시 시도해주세요.')
    vertices, faces, _, _ = extract(array, level=threshold, allow_degenerate=False)
    # Upstream MarchingCubeHelper swaps x/z on return. Supply its expected order.
    return torch.from_numpy(np.ascontiguousarray(vertices[:, [2, 1, 0]])), torch.from_numpy(np.ascontiguousarray(faces.astype(np.int64)))

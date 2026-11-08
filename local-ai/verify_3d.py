"""Validate offline loading; this does not claim a successful GPU inference."""
from reconstruct import configure, WEIGHTS

def main():
    configure()
    from tsr.system import TSR
    import rembg
    model = TSR.from_pretrained(str(WEIGHTS), config_name='config.yaml', weight_name='model.ckpt')
    del model
    session = rembg.new_session('u2net_human_seg', providers=['CPUExecutionProvider'])
    del session
    print('Offline 3D model loading passed. GPU inference will run from the admin page.', flush=True)

if __name__ == '__main__':
    main()

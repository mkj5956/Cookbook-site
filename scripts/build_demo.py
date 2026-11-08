"""Generate original, clearly-labelled geometric 3D samples. No user photos."""
import json
import math
from pathlib import Path
import struct

OUT = Path(__file__).resolve().parents[1] / 'web' / 'demo'


class GLB:
    def __init__(self):
        self.binary = bytearray()
        self.doc = {'asset': {'version': '2.0', 'generator': 'Lookbook original geometric demonstration'}, 'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [], 'materials': [], 'bufferViews': [], 'accessors': []}

    def accessor(self, rows, kind, component=5126):
        while len(self.binary) % 4:
            self.binary.append(0)
        offset = len(self.binary)
        values = [v for row in rows for v in row]
        self.binary.extend(struct.pack('<' + ('f' if component == 5126 else 'I') * len(values), *values))
        index = len(self.doc['bufferViews'])
        self.doc['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(self.binary) - offset})
        entry = {'bufferView': index, 'componentType': component, 'count': len(rows), 'type': kind}
        if kind == 'VEC3':
            entry.update(min=[min(r[i] for r in rows) for i in range(3)], max=[max(r[i] for r in rows) for i in range(3)])
        self.doc['accessors'].append(entry)
        return len(self.doc['accessors']) - 1

    def mesh(self, vertices, normals, faces, color):
        rgb = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        # glTF baseColorFactor is linear, while our palette is sRGB.
        rgb = [((c + .055) / 1.055) ** 2.4 if c > .04045 else c / 12.92 for c in rgb]
        material = len(self.doc['materials'])
        self.doc['materials'].append({'pbrMetallicRoughness': {'baseColorFactor': rgb + [1], 'metallicFactor': 0, 'roughnessFactor': .85}, 'doubleSided': True})
        self.doc['meshes'].append({'primitives': [{'attributes': {'POSITION': self.accessor(vertices, 'VEC3'), 'NORMAL': self.accessor(normals, 'VEC3')}, 'indices': self.accessor([(v,) for face in faces for v in face], 'SCALAR', 5125), 'material': material}]})
        self.doc['nodes'].append({'mesh': len(self.doc['meshes']) - 1})
        self.doc['scenes'][0]['nodes'].append(len(self.doc['nodes']) - 1)

    def oval(self, center, scale, color, angle=0, rings=12, sides=20):
        vertices, normals, faces = [], [], []
        for a in range(rings + 1):
            phi = math.pi * a / rings
            for b in range(sides + 1):
                theta = 2 * math.pi * b / sides
                unit = (math.sin(phi) * math.cos(theta), math.cos(phi), math.sin(phi) * math.sin(theta))
                p = [unit[i] * scale[i] for i in range(3)]
                n = [unit[i] / scale[i] for i in range(3)]
                length = math.sqrt(sum(v * v for v in n)); n = [v / length for v in n]
                def rotate(v): return [v[0] * math.cos(angle) - v[1] * math.sin(angle), v[0] * math.sin(angle) + v[1] * math.cos(angle), v[2]]
                p, n = rotate(p), rotate(n)
                vertices.append([p[i] + center[i] for i in range(3)]); normals.append(n)
        for a in range(rings):
            for b in range(sides):
                i = a * (sides + 1) + b
                faces.extend([(i, i + sides + 1, i + 1), (i + 1, i + sides + 1, i + sides + 2)])
        self.mesh(vertices, normals, faces, color)

    def garment(self, levels, color):
        vertices, normals, faces = [], [], []
        sides = 32
        for y, rx, rz in levels:
            for b in range(sides):
                t = 2 * math.pi * b / sides
                vertices.append([rx * math.cos(t), y, rz * math.sin(t)])
                n = [math.cos(t) / rx, 0, math.sin(t) / rz]; length = math.sqrt(sum(v * v for v in n)); normals.append([v / length for v in n])
        for a in range(len(levels) - 1):
            for b in range(sides):
                i = a * sides + b; j = a * sides + (b + 1) % sides
                faces.extend([(i, j, i + sides), (j, j + sides, i + sides)])
        for first in [0, len(vertices) - sides]:
            for b in range(1, sides - 1): faces.append((first, first + b, first + b + 1))
        self.mesh(vertices, normals, faces, color)

    def save(self, path):
        while len(self.binary) % 4: self.binary.append(0)
        self.doc['buffers'] = [{'byteLength': len(self.binary)}]
        data = json.dumps(self.doc, separators=(',', ':')).encode()
        data += b' ' * (-len(data) % 4)
        body = struct.pack('<II', len(data), 0x4e4f534a) + data + struct.pack('<II', len(self.binary), 0x004e4942) + self.binary
        path.write_bytes(struct.pack('<III', 0x46546c67, 2, len(body) + 12) + body)


PALETTES = [
    ('아이보리 티셔츠', '#d6cfbc', '#454c48', 'tops'),
    ('세이지 니트', '#87977d', '#dbd9cd', 'tops'),
    ('네이비 셔츠', '#3f5366', '#b6aa8e', 'tops'),
    ('브라운 재킷', '#91765f', '#3b433e', 'tops'),
    ('테라코타 원피스', '#ab715d', '#b69c86', 'one-pieces'),
    ('그레이 롱 코트', '#93978e', '#637989', 'tops'),
]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    items = []
    for index, (name, top, bottom, category) in enumerate(PALETTES):
        m = GLB(); skin = '#c8ad95'; hair = '#44483e'
        for side in [-1, 1]:
            m.oval((side * .10, .53, 0), (.089, .45, .10), bottom)
            m.oval((side * .10, .065, .045), (.094, .065, .15), '#40473e')
            m.oval((side * .29, 1.15, 0), (.063, .32, .068), skin, side * .16)
            m.oval((side * .33, .84, .015), (.051, .085, .042), skin, side * .16)
        m.oval((0, 1.47, 0), (.075, .09, .07), skin)
        m.oval((0, 1.68, 0), (.135, .182, .127), skin)
        m.oval((0, 1.80, -.015), (.14, .092, .133), hair)
        for side in [-1, 1]:
            m.oval((side * .14, 1.67, 0), (.025, .044, .03), skin)
            m.oval((side * .042, 1.70, .121), (.009, .012, .006), hair, rings=6, sides=8)
        m.oval((0, 1.652, .13), (.018, .025, .019), skin, rings=6, sides=8)
        hem = .88 if index < 3 else .79 if index == 3 else .91 if index == 4 else .62
        m.garment([(hem, .215, .13), (1.12, .20, .12), (1.38, .245, .123), (1.43, .10, .07)], top)
        for side in [-1, 1]:
            m.oval((side * .259, 1.29 if index == 0 else 1.14, 0), (.080, .15 if index == 0 else .28, .084), top, side * .17)
        if index == 4:
            m.garment([(.47, .30, .18), (.75, .26, .16), (.98, .19, .125)], top)
            m.garment([(.96, .198, .129), (.985, .198, .129)], '#805143')
        if index in [2, 3, 5]:
            for y in [1.28, 1.15, 1.02, .89]: m.oval((0, y, .135), (.014, .014, .007), '#d4cdbd', rings=6, sides=8)
        m.save(OUT / f'look-{index + 1}.glb')
        path = 'M55 25 77 16 90 28 103 16 125 25 149 59 128 74 118 58 118 137 62 137 62 58 52 74 31 59Z'
        if category == 'one-pieces': path = 'M66 19 78 17Q90 34 102 17L114 19 121 50 108 75 143 145H37L72 75 59 50Z'
        if index == 5: path = 'M60 24 79 17 90 33 101 17 120 24 143 131 123 136 113 62 120 147H60L67 62 57 136 37 131Z'
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 165"><path d="{path}" fill="{top}" stroke="#6a725f" stroke-opacity=".3" stroke-width="1.5" stroke-linejoin="round"/><path d="M79 18Q90 39 101 18" fill="none" stroke="#68725c" stroke-opacity=".45" stroke-width="2"/></svg>'
        (OUT / f'item-{index + 1}.svg').write_text(svg)
        thumb = f'demo/item-{index + 1}.svg'
        items.append({'slot': index, 'name': name, 'category': category, 'thumbnail': thumb, 'poster': '', 'model': f'demo/look-{index + 1}.glb', 'source': 'demo', 'products': [{'name': name, 'image': thumb, 'link': ''}]})
    (OUT / 'catalog.json').write_text(json.dumps({'version': 1, 'demo': True, 'publishedAt': '', 'items': items}, ensure_ascii=False, indent=2))
    print('Built 6 original demo outfits. These are not AI-generated user photos.')


if __name__ == '__main__': main()

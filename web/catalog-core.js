(function (root) {
  'use strict';
  const MAX_GLB = 20 * 1024 * 1024;
  const cleanName = value => String(value || '아이템').slice(0, 80);
  function asset(value, kind) {
    const pattern = kind === 'model' ? /^(media|demo)\/[a-zA-Z0-9_-]+\.glb$/ : /^(media|demo)\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|svg)$/;
    if (typeof value !== 'string' || !pattern.test(value)) throw new Error('등록된 파일 주소가 올바르지 않습니다.');
    return value;
  }
  function normalizeCatalog(raw) {
    if (!raw || raw.version !== 1 || !Array.isArray(raw.items) || raw.items.length !== 6) throw new Error('공개 룩북 형식이 올바르지 않습니다.');
    const core = root.LookbookCore || require('./core.js');
    return { version: 1, publishedAt: String(raw.publishedAt || '').slice(0, 40), demo: raw.demo === true, items: raw.items.map((v, i) => {
      if (!v) return null;
      if (!core.CATEGORIES[v.category] || !Array.isArray(v.products) || !v.products.length || v.products.length > 6) throw new Error('상품 정보가 올바르지 않습니다.');
      return { slot: i, name: cleanName(v.name), category: v.category, thumbnail: asset(v.thumbnail, 'image'), poster: v.poster ? asset(v.poster, 'image') : '', model: asset(v.model, 'model'), source: v.source === 'uploaded' ? 'uploaded' : v.source === 'demo' ? 'demo' : 'ai', products: v.products.map(p => ({ name: cleanName(p.name), image: asset(p.image, 'image'), link: core.coupangURL(p.link) })) };
    }) };
  }
  function validateGLB(buffer) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 28 || buffer.byteLength > MAX_GLB) throw new Error('GLB 파일은 20MB 이하로 등록해주세요.');
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength || view.getUint32(16, true) !== 0x4e4f534a) throw new Error('glTF 2.0 형식의 GLB 파일을 선택해주세요.');
    const size = view.getUint32(12, true);
    if (size > 4 * 1024 * 1024 || size + 20 > buffer.byteLength) throw new Error('3D 파일의 구조를 읽을 수 없습니다.');
    let doc;
    try { doc = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, size))); } catch (_) { throw new Error('3D 파일 정보가 손상되었습니다.'); }
    if (doc.asset?.version !== '2.0' || !doc.meshes?.length || !doc.scenes?.length) throw new Error('3D 메시가 포함된 GLB 파일이 필요합니다.');
    if ([...(doc.extensionsRequired || []), ...(doc.extensionsUsed || [])].some(v => !['KHR_materials_unlit'].includes(v))) throw new Error('추가 확장이나 압축 없이 기본 GLB 파일로 내보내주세요.');
    if ((doc.buffers || []).some(v => v.uri) || (doc.images || []).some(v => v.uri)) throw new Error('텍스처까지 하나로 포함한 GLB 파일이 필요합니다. 외부 파일은 지원하지 않습니다.');
    return true;
  }
  function modelData(value) {
    if (typeof value !== 'string' || value.length > Math.ceil(MAX_GLB / 3) * 4 + 100 || !/^data:model\/gltf-binary;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('올바른 3D 파일 데이터가 아닙니다.');
    const text = value.split(',')[1], bytes = typeof atob === 'function' ? Uint8Array.from(atob(text), c => c.charCodeAt(0)) : new Uint8Array(Buffer.from(text, 'base64'));
    validateGLB(bytes.buffer);
    return value;
  }
  const api = { MAX_GLB, asset, normalizeCatalog, validateGLB, modelData };
  root.LookbookCatalog = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

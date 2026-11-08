(function (root) {
  'use strict';
  const CATEGORIES = { tops: '상의 · 아우터', bottoms: '하의 · 스커트', 'one-pieces': '원피스 · 점프수트' };
  function coupangURL(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    let url;
    try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); }
    catch (_) { throw new Error('올바른 쿠팡 상품 주소를 입력해주세요.'); }
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !(url.hostname === 'coupang.com' || url.hostname.endsWith('.coupang.com'))) throw new Error('쿠팡의 https 상품 주소 또는 공유 링크를 입력해주세요.');
    return url.href;
  }
  function imageData(value) {
    if (typeof value !== 'string' || value.length > 12 * 1024 * 1024 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('올바른 이미지 파일이 아닙니다. JPG, PNG, WebP 사진을 사용해주세요.');
    return value;
  }
  function item(value, index) {
    if (!value) return null;
    if (typeof value !== 'object' || !CATEGORIES[value.category] || !['model', 'flat-lay'].includes(value.photoType)) throw new Error('옷 정보의 형식이 올바르지 않습니다.');
    return { id: `slot-${index}`, name: String(value.name || `아이템 ${index + 1}`).slice(0, 80), category: value.category, photoType: value.photoType, image: imageData(value.image), link: coupangURL(value.link) };
  }
  function products(items) {
    if (!Array.isArray(items) || items.length > 6 || items.some(v => !v || typeof v !== 'object')) throw new Error('상품 정보가 올바르지 않습니다.');
    return items.map((v, i) => item(v, /^slot-[0-5]$/.test(v?.id) ? Number(v.id.slice(5)) : i));
  }
  function normalizeProject(value) {
    if (!value || value.type !== 'lookbook-studio' || value.version !== 1 || !Array.isArray(value.garments) || value.garments.length !== 6) throw new Error('이 룩북에서 저장한 프로젝트 파일을 선택해주세요.');
    const model = value.model ? { image: imageData(value.model.image), name: String(value.model.name || '내 모델').slice(0, 80) } : null;
    const current = value.current && model ? { image: imageData(value.current.image), items: products(value.current.items), created: Number(value.current.created) || Date.now() } : null;
    const history = (Array.isArray(value.history) ? value.history : []).slice(0, 20).map((v, i) => ({ id: String(v.id || i).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80), image: imageData(v.image), items: products(v.items), created: Number(v.created) || Date.now(), original: v.original ? imageData(v.original) : (model?.image || null) }));
    const garments = value.garments.map(item);
    const prepared = Array.from({length: 6}, (_, i) => {
      const p = value.prepared?.[i];
      if (!p || !garments[i] || !model) return null;
      const catalog = root.LookbookCatalog || require('./catalog-core.js');
      return { image: imageData(p.image), glb: catalog.modelData(p.glb), items: products(p.items), source: p.source === 'uploaded' ? 'uploaded' : 'ai', created: Number(p.created) || Date.now() };
    });
    return { type: 'lookbook-studio', version: 1, model, garments, current, history, prepared, quality: [20, 30, 50].includes(Number(value.quality)) ? Number(value.quality) : 30, layerMode: Boolean(value.layerMode) };
  }
  function mergeOutfit(previous, garment, layering) {
    if (!layering || garment.category === 'one-pieces') return [{ ...garment }];
    return [...previous.filter(v => v.category !== garment.category && v.category !== 'one-pieces'), { ...garment }];
  }
  function emptyProject() { return { type: 'lookbook-studio', version: 1, model: null, garments: Array(6).fill(null), current: null, history: [], prepared: Array(6).fill(null), quality: 30, layerMode: false }; }
  const api = { CATEGORIES, coupangURL, imageData, normalizeProject, mergeOutfit, emptyProject };
  root.LookbookCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

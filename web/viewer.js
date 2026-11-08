'use strict';
// Public page: no upload, local-AI connection, GitHub credential or write API.
(() => {
  const $ = id => document.getElementById(id);
  const create = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls || ''; if (text !== undefined) n.textContent = text; return n; };
  let catalog, selected = -1, loadTimer, supported = false, software = null, selectionVersion = 0;
  const viewer = $('outfitViewer');
  function status(text, error = false) { $('viewerStatus').textContent = text; $('viewerStatus').classList.toggle('error', error); }
  function renderCards() {
    $('leftSlots').replaceChildren(); $('rightSlots').replaceChildren();
    catalog.items.forEach((item, i) => {
      const button = create('button', `visitor-card${i === selected ? ' active' : ''}`);
      button.disabled = !item; button.setAttribute('aria-pressed', String(i === selected));
      button.setAttribute('aria-label', item ? `${item.name} 입히기` : `${i + 1}번 옷 준비 중`);
      const visual = create('span', 'visitor-card-image'); visual.append(create('span', 'item-number', String(i + 1).padStart(2, '0')));
      if (item) { const image = create('img'); image.src = item.thumbnail; image.alt = ''; visual.append(image); }
      else visual.append(create('span', 'empty-hanger', '＋'));
      const text = create('span', 'visitor-card-caption'); text.append(create('strong', '', item?.name || '곧 만나요'), create('small', '', item ? (i === selected ? '지금 입은 옷' : '눌러서 입혀보기') : '등록 예정'));
      button.append(visual, text); button.onclick = () => select(i); $(i < 3 ? 'leftSlots' : 'rightSlots').append(button);
    });
  }
  async function select(i) {
    const item = catalog.items[i]; if (!item) return;
    const version = ++selectionVersion;
    selected = i; renderCards(); clearTimeout(loadTimer); $('viewerError').hidden = true;
    $('lookIndex').textContent = `LOOK ${String(i + 1).padStart(2, '0')}`;
    $('selectedName').textContent = item.name;
    status(supported ? '3D 착용 모습을 불러오고 있어요…' : '사진 미리보기 · 이 브라우저는 3D를 지원하지 않습니다.');
    $('fallbackImage').src = item.poster || item.thumbnail;
    $('fallbackImage').alt = item.poster ? `${item.name} 착용 사진` : `${item.name} 상품 사진`;
    $('fallbackImage').hidden = supported;
    $('softwareViewer').hidden = true;
    $('supportNote').hidden = supported; $('supportNote').textContent = Lookbook3D.message;
    viewer.hidden = !supported;
    viewer.removeAttribute('src'); viewer.removeAttribute('poster');
    if (item.poster) viewer.setAttribute('poster', item.poster);
    if (supported) viewer.setAttribute('src', item.model);
    viewer.setAttribute('alt', `${item.name} 착용 3D 캐릭터. 좌우로 끌어 회전하세요.`);
    viewer.setAttribute('camera-orbit', '0deg 80deg auto');
    $('sourceNote').textContent = catalog.demo ? '시연용 3D 캐릭터입니다. 관리자 사진을 게시하면 교체됩니다.' : item.source === 'ai' ? '사진으로 생성한 3D입니다. 보이지 않는 면과 디테일은 실제 상품과 다를 수 있습니다.' : '관리자가 등록한 3D 착용 모습입니다.';
    $('productList').replaceChildren();
    item.products.forEach(p => {
      const row = create('div', 'product-row'), image = create('img'); image.src = p.image; image.alt = '';
      const name = create('div'); name.append(create('strong', '', p.name), create('small', '', catalog.demo ? '시연용 아이템' : '선택한 착장의 상품'));
      row.append(image, name);
      if (p.link && !catalog.demo) { const a = create('a', 'coupang-link', '쿠팡에서 보기 ↗'); a.href = p.link; a.target = '_blank'; a.rel = 'noopener noreferrer sponsored'; row.append(a); }
      else row.append(create('span', 'no-link', '상품 링크 준비 중'));
      $('productList').append(row);
    });
    if(supported) loadTimer = setTimeout(() => { if (!viewer.loaded) { status('3D를 불러오지 못했습니다. 다시 시도해주세요.', true); $('viewerError').hidden = false; $('fallbackImage').hidden = false; } }, 45000);
    else if (software) {
      status('기본 3D 화면을 준비하고 있어요…');
      try {
        if(!await software.load(item.model)||version!==selectionVersion)return;
        $('softwareViewer').hidden=false;software.draw();$('fallbackImage').hidden=true;
        $('rotateBtn').disabled=false;$('frontBtn').disabled=false;
        $('supportNote').textContent='기본 3D 모드로 표시합니다. 좌우로 끌어 회전하고 휠로 확대할 수 있습니다.';
        status('좌우로 끌어 360° 회전 · 휠로 확대');
      } catch(e) {if(version!==selectionVersion)return;$('rotateBtn').disabled=true;$('frontBtn').disabled=true;$('supportNote').textContent=Lookbook3D.message+' '+e.message;status('사진 미리보기');}
    }
  }
  viewer.addEventListener('load', () => { clearTimeout(loadTimer); $('viewerError').hidden = true; status('좌우로 끌어 360° 회전 · 두 손가락으로 확대'); });
  viewer.addEventListener('error', () => { clearTimeout(loadTimer); status('이 기기에서 3D를 표시하지 못했습니다.', true); $('viewerError').hidden = false; $('fallbackImage').hidden = false; });
  $('retryViewer').onclick = () => select(selected);
  $('softwareViewer').addEventListener('manual-rotate',()=>{$('rotateBtn').setAttribute('aria-pressed','false');$('rotateBtn').textContent='자동 회전';});
  $('rotateBtn').onclick = () => { const on = $('rotateBtn').getAttribute('aria-pressed') !== 'true'; if(supported)viewer.toggleAttribute('auto-rotate', on);else software?.rotate(on);$('rotateBtn').setAttribute('aria-pressed', String(on)); $('rotateBtn').textContent = on ? '자동 회전 멈춤' : '자동 회전'; };
  $('frontBtn').onclick = () => { if(!supported){software?.reset();return;}viewer.setAttribute('camera-orbit', '0deg 80deg auto'); viewer.setAttribute('camera-target', 'auto auto auto'); viewer.jumpCameraToGoal(); };
  async function init() {
    try {
      const response = await fetch('./catalog.json', { cache: 'no-cache', credentials: 'omit' });
      if (!response.ok) throw new Error('공개 룩북을 불러오지 못했습니다.');
      catalog = LookbookCatalog.normalizeCatalog(await response.json());
      if (!catalog.items.some(Boolean)) {
        const demo = await fetch('./demo/catalog.json', { cache: 'no-cache' });
        if (!demo.ok) throw new Error('아직 공개된 의상이 없습니다.');
        catalog = LookbookCatalog.normalizeCatalog(await demo.json());
      }
      $('demoBanner').hidden = !catalog.demo;
      $('collectionCount').textContent = `${String(catalog.items.filter(Boolean).length).padStart(2, '0')} PIECES`;
      renderCards(); supported = await Lookbook3D.ready;
      if(!supported)try{software=new LookbookSoftware3D.Viewer($('softwareViewer'));}catch(_){/* Photo fallback remains available. */}
      $('rotateBtn').disabled = !supported; $('frontBtn').disabled = !supported;
      select(catalog.items.findIndex(Boolean));
    } catch (e) { status(e.message, true); $('catalogError').hidden = false; $('catalogErrorText').textContent = e.message; }
  }
  init();
})();

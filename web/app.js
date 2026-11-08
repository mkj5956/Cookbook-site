'use strict';
if (!window.LookbookAdmin?.authenticated) throw new Error('관리자 인증 후 사용할 수 있습니다.');
const Core = window.LookbookCore;
const $ = id => document.getElementById(id);
const API = 'http://127.0.0.1:8765';
const ICONS = {
  hanger: '<path d="M9 7a3 3 0 1 1 5 2c-1 1-2 1-2 3L3 18q-2 2 1 2h16q3 0 1-2l-9-6"/>',
  'arrow-up-right': '<path d="M6 18 18 6M6 6h12v12"/>',
  'arrow-right': '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  folder: '<path d="M3 7V4h7l3 3h8v13H3z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  edit: '<path d="m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 15z"/>',
  link: '<path d="m9 15 6-6M9 7l2-2a5 5 0 0 1 7 7l-2 2M8 10l-2 2a5 5 0 0 0 7 7l2-2"/>',
  compare: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16m-6-5 3-3-3-3m12 0-3 3 3 3"/>',
  reset: '<path d="M4 10a8 8 0 1 1 2 8M4 4v6h6"/>',
  bag: '<path d="M5 7h14l1 14H4zm3 1V6a4 4 0 0 1 8 0v2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  heart: '<path d="M12 20 4 12C-3 4 8-1 12 6 16-1 27 4 20 12z"/>'
};
function icon(name) { return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.plus}</svg>`; }
document.querySelectorAll('[data-icon]').forEach(node => node.innerHTML = icon(node.dataset.icon));
function element(tag, className, text) { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; }
let state = Core.emptyProject(), db = null, saveQueue = Promise.resolve(), busy = false, selected = -1;
let draft = null, editing = -1, currentJob = null, cancelRequested = false, showingOriginal = false, connected = false;
let toastTimer, timer, restoreTimer, token = '';
let previewGLB = '', previewURL = '', publishing = false, adminSoftware = null, softwareSource = '';
try { token = sessionStorage.getItem('lookbook-local-token') || ''; } catch (_) { /* Session-only fallback. */ }
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 5500); }
function feedback(message = '') { $('feedback').textContent = message; $('feedback').hidden = !message; }
function dialog(id) { if (!$(id).open) $(id).showModal(); }
document.querySelectorAll('.dialog-close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', event => { if (event.target === d) { const r = d.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) d.close(); } }));

async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('lookbook-studio-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('project');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function persist() {
  const snapshot = structuredClone(state);
  $('saveStatus').textContent = '저장 중…';
  saveQueue = saveQueue.catch(() => {}).then(() => new Promise((resolve, reject) => {
    if (!db) return reject(new Error('브라우저 저장 기능을 사용할 수 없습니다.'));
    const tx = db.transaction('project', 'readwrite');
    tx.objectStore('project').put(snapshot, 'current');
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  })).then(() => $('saveStatus').textContent = '이 브라우저에 저장됨').catch(() => {
    $('saveStatus').textContent = '자동 저장 불가 · 백업 필요';
    feedback('브라우저에 저장하지 못했습니다. ‘프로젝트 저장’으로 파일을 내려받아 보관해주세요.');
  });
}
function clothingSVG(index) {
  const paths = [
    '<path d="m30 24 16-7q14 13 28 0l16 7 20 25-18 13-10-13v62H38V49L28 62 10 49z"/><path d="M46 17q14 26 28 0M41 94h38"/>',
    '<path d="m42 19 18 7 18-7 16 10 15 75-18 4-9-55v60H38V53l-9 55-18-4 15-75z"/><path d="m42 19 18 20 18-20M60 39v74M44 72h8m16 0h8"/>',
    '<path d="m35 26 16-8q9 13 18 0l16 8 18 29-18 10-8-14v60H43V51l-8 14-18-10z"/><path d="M48 25q12 18 24 0M44 91h32m-32 7h32"/>',
    '<path d="M35 16h50l4 99H66l-6-67-6 67H31z"/><path d="M35 29h50M60 16v27M39 29q0 14-6 14m48-14q0 14 6 14"/>',
    '<path d="M41 20h38l22 95H19z"/><path d="M41 32h38M46 34l-8 76m17-76-2 76m12-76 2 76m7-76 8 76"/>',
    '<path d="m44 15 8 1q8 13 16 0l8-1 7 30-10 20 27 50H20l27-50-10-20z"/><path d="M47 65h26M51 73l-12 34m30-34 12 34"/>'
  ];
  return `<svg class="garment-line" viewBox="0 0 120 130" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">${paths[index]}</svg>`;
}
function renderSlots() {
  $('leftSlots').replaceChildren(); $('rightSlots').replaceChildren();
  state.garments.forEach((item, i) => {
    const worn = state.current?.items.some(v => v.id === `slot-${i}` && v.image === item?.image);
    const card = element('article', `garment-card${selected === i ? ' selected' : ''}${worn ? ' worn' : ''}`);
    const pick = element('button', 'garment-pick'); pick.type = 'button'; pick.disabled = busy; pick.dataset.choose = i;
    pick.setAttribute('aria-label', item ? `${item.name} 입어보기` : `${i + 1}번 옷 등록하기`);
    const visual = element('span', 'garment-visual'); visual.append(element('span', 'item-number', String(i + 1).padStart(2, '0')));
    if (item) { const image = element('img'); image.src = item.image; image.alt = item.name; visual.append(image); }
    else visual.insertAdjacentHTML('beforeend', clothingSVG(i));
    const plus = element('span', 'item-plus'); plus.innerHTML = icon(item ? 'arrow-up-right' : 'plus'); visual.append(plus);
    const caption = element('span', 'item-caption'); caption.append(element('strong', '', item ? item.name : '새로운 옷 추가'), element('small', '', item ? Core.CATEGORIES[item.category] : '사진과 상품 링크 등록'));
    pick.append(visual, caption); card.append(pick);
    if (item) { const edit = element('button', 'icon-button edit-item'); edit.dataset.edit = i; edit.disabled = busy; edit.setAttribute('aria-label', `${item.name} 정보 수정`); edit.innerHTML = icon('edit'); card.append(edit); }
    $(i < 3 ? 'leftSlots' : 'rightSlots').append(card);
  });
}
function renderProducts(container, items) {
  container.replaceChildren();
  if (!items.length) { container.append(element('p', 'muted', '옷을 입히면 쿠팡 상품 링크가 여기에 표시됩니다.')); return; }
  items.forEach(item => {
    const row = element('div', 'product-row'), image = element('img'); image.src = item.image; image.alt = item.name;
    const name = element('div'); name.append(element('strong', '', item.name), element('small', '', Core.CATEGORIES[item.category])); row.append(image, name);
    if (item.link) { const a = element('a', 'coupang-link', '쿠팡에서 보기'); a.href = Core.coupangURL(item.link); a.target = '_blank'; a.rel = 'noopener noreferrer'; a.insertAdjacentHTML('beforeend', icon('arrow-up-right')); row.append(a); }
    else row.append(element('span', 'no-link', '링크 미등록'));
    container.append(row);
  });
}
function renderModel() {
  $('emptyModel').hidden = Boolean(state.model); $('modelImage').hidden = !state.model;
  if (state.model) { $('modelImage').src = showingOriginal || !state.current ? state.model.image : state.current.image; $('modelImage').alt = state.current && !showingOriginal ? 'AI가 선택한 의상을 입힌 모델' : '업로드한 모델 원본'; }
  else $('modelImage').removeAttribute('src');
  $('modelLabel').textContent = state.model ? state.model.name : 'MY MODEL';
  $('modelUploadLabel').textContent = state.model ? '사진 변경' : '모델 사진';
  $('resultBadge').hidden = !state.current || showingOriginal;
  $('originalBtn').disabled = !state.current || busy; $('resetBtn').disabled = !state.current || busy; $('downloadBtn').disabled = !state.current || busy;
  $('originalBtn').innerHTML = `${icon('compare')}${showingOriginal ? '합성 결과 보기' : '원본 보기'}`;
  $('modelUploadBtn').disabled = busy; $('quality').disabled = busy; $('layerMode').disabled = busy;
  $('importBtn').disabled = busy;
  $('quality').value = state.quality; $('layerMode').checked = state.layerMode;
  $('lookNumber').textContent = String(state.history.length || 1).padStart(2, '0');
  $('productTitle').textContent = state.current ? '착용한 상품' : '착용 아이템';
  renderProducts($('productList'), state.current?.items || []);
  $('looksCount').textContent = state.history.length;
}
function renderGallery() {
  const gallery = $('lookGallery'); gallery.replaceChildren();
  if (!state.history.length) { const empty = element('div', 'gallery-empty'); empty.innerHTML = `${icon('heart')}<h3>첫 번째 룩을 기다리고 있어요.</h3><p>AI 피팅을 완성하면 사진과 상품 링크가 함께 모입니다.</p>`; gallery.append(empty); return; }
  state.history.forEach((look, index) => {
    const card = element('article', 'look-card'); const open = element('button'); open.dataset.look = index; open.setAttribute('aria-label', `${index + 1}번 룩 열기`);
    const image = element('img'); image.src = look.image; image.alt = `완성한 룩 ${index + 1}`; image.loading = 'lazy'; open.append(image);
    const content = element('div', 'look-card-content'); content.append(element('strong', '', `LOOK ${String(state.history.length - index).padStart(2, '0')}`), element('small', '', new Date(look.created).toLocaleString('ko-KR')));
    const products = element('div'); renderProducts(products, look.items); content.append(products);
    const actions = element('div', 'look-card-actions'); const download = element('button', 'text-button', '이미지 저장'); download.dataset.downloadLook = index; const remove = element('button', 'text-button danger', '삭제'); remove.dataset.deleteLook = index; actions.append(download, remove); content.append(actions); card.append(open, content); gallery.append(card);
  });
}
function render3D() {
  const prepared = state.prepared[selected];
  const hasItem = selected >= 0 && Boolean(state.garments[selected]);
  $('adminViewer').hidden = !prepared || !window.Lookbook3D?.available;
  if ((prepared?.glb || '') !== previewGLB) {
    previewGLB = prepared?.glb || '';
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = '';
    if (previewGLB) {
      const bytes = Uint8Array.from(atob(previewGLB.split(',')[1]), c => c.charCodeAt(0));
      previewURL = URL.createObjectURL(new Blob([bytes], {type:'model/gltf-binary'}));
      $('adminViewer').setAttribute('src', previewURL);
    } else $('adminViewer').removeAttribute('src');
  }
  $('adminSoftwareViewer').hidden = !prepared || Boolean(window.Lookbook3D?.available) || !adminSoftware;
  if(prepared && adminSoftware && softwareSource!==previewURL){
    softwareSource=previewURL;
    adminSoftware.load(previewURL).then(ok=>{if(ok){$('adminSoftwareViewer').hidden=false;adminSoftware.draw();$('threeDHint').hidden=true;}}).catch(e=>{$('adminSoftwareViewer').hidden=true;$('threeDHint').hidden=false;$('threeDHint').textContent=e.message;});
  }
  $('threeDState').textContent = prepared ? '공개 준비 완료' : hasItem ? '3D 준비 필요' : '의상을 선택해주세요';
  $('threeDHint').hidden = Boolean(prepared);
  if (prepared && !window.Lookbook3D?.available) { $('threeDHint').hidden = false; $('threeDHint').textContent = Lookbook3D.message || '3D 표시 준비 중…'; }
  $('generate3DBtn').disabled = busy || publishing || !hasItem || !state.current;
  $('importGLBBtn').disabled = busy || publishing || !hasItem || !state.model;
  $('publishBtn').disabled = busy || publishing;
  $('preparedCount').textContent = `준비된 의상 ${state.prepared.filter(Boolean).length} / ${state.garments.filter(Boolean).length}`;
}
function render() { renderSlots(); renderModel(); renderGallery(); render3D(); }
function selectTab(looks) {
  $('studioPanel').hidden = looks; $('looksPanel').hidden = !looks;
  $('studioTab').classList.toggle('active', !looks); $('looksTab').classList.toggle('active', looks);
  $('studioTab').setAttribute('aria-selected', String(!looks)); $('looksTab').setAttribute('aria-selected', String(looks));
}
async function readImage(file) {
  if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('JPG, PNG, WebP 사진을 선택해주세요. HEIC는 JPG로 변환해주세요.');
  if (file.size > 15 * 1024 * 1024) throw new Error('사진 한 장은 15MB 이하로 올려주세요.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 60e6) throw new Error('사진의 해상도가 너무 큽니다. 크기를 줄여주세요.');
    const ratio = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(img.naturalWidth * ratio); canvas.height = Math.round(img.naturalHeight * ratio);
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return Core.imageData(canvas.toDataURL('image/jpeg',.92));
  } catch (error) { throw new Error(error.message || '사진을 읽지 못했습니다. 다른 파일을 선택해주세요.'); }
  finally { URL.revokeObjectURL(url); }
}
async function uploadModel(file) {
  if (busy || publishing) return;
  try { const data = await readImage(file); state.model = {image:data, name:file.name.replace(/\.[^.]+$/, '').slice(0,80)}; state.current = null; state.prepared = Array(6).fill(null); showingOriginal = false; selected = -1; feedback(); render(); persist(); toast('모델 사진을 추가했습니다. 양옆의 옷을 선택해보세요.'); } catch (e) { toast(e.message); }
}
function editGarment(index) {
  if (busy) return;
  editing = index; draft = state.garments[index] ? {...state.garments[index]} : {image:'',name:'',category:index < 3 ? 'tops' : index === 5 ? 'one-pieces' : 'bottoms',photoType:'flat-lay',link:''};
  $('slotEyebrow').textContent = `WARDROBE ${String(index+1).padStart(2,'0')}`;
  $('garmentName').value = draft.name; $('garmentCategory').value = draft.category; $('garmentPhotoType').value = draft.photoType; $('garmentLink').value = draft.link;
  $('garmentError').hidden = true; $('deleteGarmentBtn').hidden = !state.garments[index]; showDraft(); dialog('garmentDialog');
}
function showDraft() { $('garmentPreview').hidden = !draft?.image; $('garmentPlaceholder').hidden = Boolean(draft?.image); if (draft?.image) $('garmentPreview').src = draft.image; else $('garmentPreview').removeAttribute('src'); }
async function uploadGarment(file) {
  const draftRef = draft;
  try { const data = await readImage(file); if (draft !== draftRef) return; draft.image = data; if (!$('garmentName').value.trim()) $('garmentName').value = file.name.replace(/\.[^.]+$/, '').slice(0,80); showDraft(); $('garmentError').hidden = true; }
  catch (e) { $('garmentError').textContent = e.message; $('garmentError').hidden = false; }
}
function saveGarment(event) {
  event.preventDefault();
  try {
    if (!draft?.image) throw new Error('먼저 옷 사진을 선택해주세요.');
    const old = state.garments[editing];
    const item = {id:`slot-${editing}`, image:draft.image, name:$('garmentName').value.trim() || `아이템 ${editing+1}`,category:$('garmentCategory').value,photoType:$('garmentPhotoType').value,link:Core.coupangURL($('garmentLink').value)};
    state.garments[editing] = item;
    const changed = !old || old.image !== item.image || old.category !== item.category || old.photoType !== item.photoType;
    state.prepared = state.prepared.map((p, i) => {
      if (!p) return null;
      if (changed && (i === editing || p.items.some(v => v.id === item.id))) return null;
      return {...p, items:p.items.map(v => v.id === item.id ? {...item} : v)};
    });
    if (state.current && old?.image === item.image) state.current.items = state.current.items.map(v => v.id === item.id && v.image === item.image ? {...item} : v);
    $('garmentDialog').close(); render(); persist(); toast('옷과 상품 정보를 저장했습니다. 옷을 클릭하면 입어볼 수 있어요.');
  } catch (e) { $('garmentError').textContent = e.message; $('garmentError').hidden = false; }
}
async function api(path, body, timeout = 15000) {
  const controller = new AbortController(), deadline = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(API + path, {method:body === undefined ? 'GET' : 'POST',headers:{'Authorization':`Bearer ${token}`, ...(body === undefined ? {} : {'Content-Type':'application/json'})}, body:body === undefined ? undefined : JSON.stringify(body), signal:controller.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'AI 요청을 처리하지 못했습니다.'); return data;
  } catch (e) { if (e instanceof TypeError || e.name === 'AbortError') throw new Error('PC AI에 연결할 수 없습니다. 2_START.bat 실행과 브라우저의 로컬 네트워크 접근 허용을 확인해주세요.'); throw e; }
  finally { clearTimeout(deadline); }
}
function connectionState(ready, label) { connected = ready; $('connectBtn').classList.toggle('ready',ready); $('connectionLabel').textContent = label || (ready ? '내 PC AI 연결됨' : '내 PC AI 연결'); }
async function checkConnection(showMessage = true) {
  if (!token) { connectionState(false); if (showMessage) { $('connectionMessage').textContent='2_START.bat를 실행하거나 실행 창의 연결 코드를 입력해주세요.'; $('connectionMessage').hidden=false; } return false; }
  connectionState(false,'연결 확인 중');
  try {
    const health = await api('/api/health'); connectionState(Boolean(health.ready),health.ready ? '내 PC AI 연결됨' : 'AI 설치 확인 필요');
    if (!health.ready) throw new Error(health.message || 'AI 설치를 먼저 완료해주세요.');
    $('connectionMessage').hidden=true;
    if (showMessage) { toast(`AI 연결을 확인했습니다${health.gpu ? ' · ' + health.gpu : ''}.`); $('connectDialog').close(); }
    return true;
  } catch (e) { connectionState(false); if(showMessage){$('connectionMessage').textContent=e.message; $('connectionMessage').hidden=false;} return false; }
}
function setToken(value) { token = String(value || '').trim(); try { if(token) sessionStorage.setItem('lookbook-local-token',token); else sessionStorage.removeItem('lookbook-local-token'); } catch (_) {} }
function updateBusy(value) { busy = value; $('processing').hidden = !value; renderSlots(); renderModel(); render3D(); }
async function applyGarment(index) {
  if (busy || publishing) return;
  if (!state.garments[index]) return editGarment(index);
  selected=index; renderSlots(); render3D();
  if (state.prepared[index] && !state.layerMode) {
    const p = state.prepared[index]; state.current = {image:p.image, items:structuredClone(p.items), created:p.created}; showingOriginal=false; render(); return;
  }
  if (!state.model) { toast('가운데에 모델 사진을 먼저 올려주세요.'); return; }
  if (!token || !connected) { dialog('connectDialog'); return; }
  const garment = structuredClone(state.garments[index]), model = state.model.image;
  const base = state.layerMode && state.current ? state.current.image : model;
  const items = Core.mergeOutfit(state.current?.items || [], garment, state.layerMode);
  const began=Date.now(); cancelRequested=false; currentJob=null; feedback(); updateBusy(true);
  $('cancelBtn').disabled=false; $('cancelBtn').textContent='작업 취소'; $('processingTitle').textContent='옷을 입혀보고 있어요'; $('processingText').textContent='PC에서 AI를 준비합니다. 첫 실행은 더 오래 걸릴 수 있어요.';
  $('elapsed').textContent='0초'; timer=setInterval(() => $('elapsed').textContent=`${Math.floor((Date.now()-began)/1000)}초`,1000);
  try {
    const result=await api('/api/jobs',{person:base,garment:garment.image,category:garment.category,photo_type:garment.photoType,steps:state.quality,seed:Math.floor(Math.random()*2147483647),output3d:true},45000);
    currentJob=result.id;
    if(cancelRequested) await api(`/api/jobs/${currentJob}/cancel`,{});
    let fails=0;
    while(true){
      await new Promise(resolve=>setTimeout(resolve,1200));
      let job;
      try { job=await api(`/api/jobs/${currentJob}`); fails=0; } catch(e){ if(++fails>=3) throw e; continue; }
      $('processingText').textContent=job.message || '내 PC에서 AI가 작업 중입니다.';
      if(job.status==='cancelled') {toast('AI 작업을 취소했습니다.'); break;}
      if(job.status==='error') throw new Error(job.error || '합성하지 못했습니다. PC 실행 창을 확인해주세요.');
      if(job.status==='done') {
        if(cancelRequested){toast('취소한 작업의 결과를 적용하지 않았습니다.');break;}
        const image=Core.imageData(job.image), created=Date.now();
        state.current={image,items,created}; showingOriginal=false;
        state.prepared[index] = job.glb ? {image,items:structuredClone(items),created,glb:LookbookCatalog.modelData(job.glb),source:'ai'} : null;
        state.history.unshift({id:crypto.randomUUID(),image,items:structuredClone(items),created,original:model});state.history=state.history.slice(0,20);
        persist();
        if(job.three_d_error) { feedback(`착용 사진은 완성됐지만 3D 생성은 실패했습니다. ${job.three_d_error}`); toast('3D 생성 실패 · 사진은 저장했습니다.'); }
        else toast('3D 룩이 완성됐습니다. 회전해서 확인한 뒤 공개해주세요.'); break;
      }
    }
  } catch(e) { feedback(e.message); toast(e.message); }
  finally { clearInterval(timer); currentJob=null; updateBusy(false); renderGallery(); }
}
async function cancelJob(){
  if(!busy)return; cancelRequested=true; $('cancelBtn').disabled=true; $('cancelBtn').textContent='취소 중…';
  if(currentJob)try{await api(`/api/jobs/${currentJob}/cancel`,{});}catch(e){feedback(e.message);$('cancelBtn').disabled=false;}
}
async function generate3D() {
  if (busy || publishing || selected < 0 || !state.current) return;
  if (!token || !connected) { dialog('connectDialog'); return; }
  const index = selected, image = state.current.image, items = structuredClone(state.current.items), began = Date.now();
  cancelRequested = false; currentJob = null; updateBusy(true); feedback();
  $('cancelBtn').disabled = false; $('cancelBtn').textContent = '작업 취소';
  $('processingTitle').textContent = '사진을 3D로 만들고 있어요'; $('processingText').textContent = '3D AI를 불러옵니다.';
  $('elapsed').textContent='0초'; timer=setInterval(()=>$('elapsed').textContent=`${Math.floor((Date.now()-began)/1000)}초`,1000);
  try {
    const started = await api('/api/jobs', {kind:'3d',image}, 45000); currentJob = started.id;
    if (cancelRequested) await api(`/api/jobs/${currentJob}/cancel`, {});
    let failures = 0;
    while (true) {
      await new Promise(resolve => setTimeout(resolve,1200));
      let job; try { job = await api(`/api/jobs/${currentJob}`); failures = 0; } catch(e) { if (++failures >= 3) throw e; continue; }
      $('processingText').textContent = job.message || '3D 생성 중';
      if (job.status === 'cancelled') { toast('3D 생성을 취소했습니다.'); break; }
      if (job.status === 'error') throw new Error(job.error || '3D 생성에 실패했습니다.');
      if (job.status === 'done') {
        if (cancelRequested) break;
        state.prepared[index] = {image,items,created:Date.now(),glb:LookbookCatalog.modelData(job.glb),source:'ai'};
        persist(); toast('3D 착용 모습을 준비했습니다. 회전해서 확인해주세요.'); break;
      }
    }
  } catch(e) {feedback(e.message);toast(e.message);} finally {clearInterval(timer);currentJob=null;updateBusy(false);}
}
async function importGLB(file) {
  if (!file || busy || publishing || selected < 0 || !state.garments[selected] || !state.model) return;
  try {
    if(file.size > LookbookCatalog.MAX_GLB) throw new Error('GLB 파일은 20MB 이하로 등록해주세요.');
    const data = await file.arrayBuffer(); LookbookCatalog.validateGLB(data);
    const bytes = new Uint8Array(data); let binary = '';
    for(let i=0;i<bytes.length;i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
    const glb = 'data:model/gltf-binary;base64,' + btoa(binary);
    const matches = state.current?.items.some(v=>v.id===state.garments[selected].id && v.image===state.garments[selected].image);
    const image = matches ? state.current.image : state.model.image;
    const items = matches ? structuredClone(state.current.items) : [structuredClone(state.garments[selected])];
    state.prepared[selected] = {image,items,glb,created:Date.now(),source:'uploaded'};
    state.current = {image,items,created:Date.now()};showingOriginal=false;render();persist();toast('3D 파일을 등록했습니다. 의상과 일치하는지 확인해주세요.');
  } catch(e) { toast(e.message); }
}
function previewPublish() {
  if(busy || publishing) return;
  $('publishList').replaceChildren();$('publishStatus').hidden=true;$('publishedLink').hidden=true;
  let count=0, complete=true;
  state.garments.forEach((item,i)=>{
    if(!item)return;count++;
    const row=element('div','publish-row'),img=element('img');img.src=item.image;img.alt='';
    const content=element('div');content.append(element('strong','',item.name));
    const ready=Boolean(state.prepared[i]);if(!ready)complete=false;
    content.append(element('small',ready?'':'not-ready',ready?`3D 준비 완료 · ${item.link?'쿠팡 링크 등록됨':'쿠팡 링크 없음'}`:'3D를 먼저 생성하거나 등록해주세요.'));
    row.append(img,content);$('publishList').append(row);
  });
  if(!count)$('publishList').append(element('p','muted','공개할 의상을 먼저 등록해주세요.'));
  $('publishConfirm').disabled=!count||!complete;$('publishConfirm').textContent='위 내용으로 공개하기';dialog('publishDialog');
}
function downloadURL(url,name){const a=element('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();}
function exportProject(){const blob=new Blob([JSON.stringify(state)],{type:'application/json'});const url=URL.createObjectURL(blob);downloadURL(url,`my-lookbook-${new Date().toISOString().slice(0,10)}.lookbook.json`);setTimeout(()=>URL.revokeObjectURL(url),10000);toast('사진·옷·상품 링크를 프로젝트 파일에 저장했습니다.');}
async function importProject(file){if(!file||busy||publishing)return;try{if(file.size>250*1024*1024)throw new Error('프로젝트 파일은 250MB 이하만 열 수 있습니다.');const next=Core.normalizeProject(JSON.parse(await file.text()));if((state.model||state.garments.some(Boolean))&&!confirm('현재 작업을 이 프로젝트로 바꿀까요? 필요한 작업은 먼저 프로젝트 저장으로 보관해주세요.'))return;state=next;selected=-1;showingOriginal=false;feedback();render();persist();toast('프로젝트를 불러왔습니다.');}catch(e){toast(e instanceof SyntaxError?'프로젝트 파일을 읽을 수 없습니다.':e.message);}}
function attachDrop(target,handler){target.addEventListener('dragover',e=>{e.preventDefault();target.classList.add('dragover');});target.addEventListener('dragleave',()=>target.classList.remove('dragover'));target.addEventListener('drop',e=>{e.preventDefault();target.classList.remove('dragover');const file=e.dataTransfer.files[0];if(file)handler(file);});}

function bind(){
  $('generate3DBtn').onclick=generate3D;$('importGLBBtn').onclick=()=>$('glbFile').click();
  $('glbFile').onchange=async e=>{const file=e.target.files[0];e.target.value='';await importGLB(file);};
  $('adminViewer').addEventListener('error',()=>{ $('threeDHint').hidden=false;$('threeDHint').textContent='3D 파일을 표시하지 못했습니다. 다른 GLB 파일로 교체하거나 3D를 다시 생성해주세요.'; });
  $('publishBtn').onclick=previewPublish;
  $('publishConfirm').onclick=()=>window.dispatchEvent(new CustomEvent('lookbook-publish',{detail:structuredClone(state)}));
  window.addEventListener('lookbook-publish-state', e=>{publishing=e.detail;$('studioPanel').inert=publishing;$('looksPanel').inert=publishing;$('importBtn').disabled=publishing;render3D();});
  document.addEventListener('click',e=>{const edit=e.target.closest('[data-edit]'),pick=e.target.closest('[data-choose]');if(edit)editGarment(Number(edit.dataset.edit));else if(pick)applyGarment(Number(pick.dataset.choose));});
  $('studioTab').onclick=()=>selectTab(false);$('looksTab').onclick=()=>selectTab(true);
  $('helpBtn').onclick=()=>dialog('helpDialog');$('connectBtn').onclick=()=>dialog('connectDialog');
  $('modelUploadBtn').onclick=$('emptyUploadBtn').onclick=()=>$('modelFile').click();
  $('modelFile').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(file)await uploadModel(file);};
  $('garmentImageBtn').onclick=()=>$('garmentFile').click();$('garmentFile').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(file)await uploadGarment(file);};
  $('garmentForm').onsubmit=saveGarment;
  $('deleteGarmentBtn').onclick=()=>{if(confirm('이 옷을 옷장에서 삭제할까요? 완성한 룩북은 보존됩니다.')){const id=`slot-${editing}`;state.prepared=state.prepared.map((p,i)=>i===editing||p?.items.some(v=>v.id===id)?null:p);state.garments[editing]=null;$('garmentDialog').close();render();persist();}};
  $('quality').onchange=()=>{state.quality=Number($('quality').value);persist();};$('layerMode').onchange=()=>{state.layerMode=$('layerMode').checked;persist();};
  $('originalBtn').onclick=()=>{showingOriginal=!showingOriginal;renderModel();};$('resetBtn').onclick=()=>{if(!busy){state.current=null;selected=-1;showingOriginal=false;render();persist();}};
  $('downloadBtn').onclick=()=>{if(state.current)downloadURL(state.current.image,'my-look.png');};
  $('cancelBtn').onclick=cancelJob;$('exportBtn').onclick=exportProject;$('importBtn').onclick=()=>$('projectFile').click();
  $('projectFile').onchange=async e=>{const file=e.target.files[0];e.target.value='';await importProject(file);};
  $('manualConnectBtn').onclick=()=>{setToken($('connectionToken').value);$('connectionToken').value='';checkConnection();};$('testConnectionBtn').onclick=()=>checkConnection();
  $('disconnectBtn').onclick=()=>{if(busy){toast('AI 작업을 끝내거나 취소한 후 연결을 해제해주세요.');return;}setToken('');connectionState(false);$('connectDialog').close();toast('PC AI 연결을 해제했습니다.');};
  $('lookGallery').onclick=e=>{
    const open=e.target.closest('[data-look]'),download=e.target.closest('[data-download-look]'),remove=e.target.closest('[data-delete-look]');
    if(open){if(busy){toast('현재 AI 작업이 끝난 뒤 룩을 열어주세요.');return;}const look=state.history[Number(open.dataset.look)];if(state.model?.image!==(look.original||look.image))state.prepared=Array(6).fill(null);state.model={image:look.original||look.image,name:'룩북 모델'};state.current={image:look.image,items:structuredClone(look.items),created:look.created};showingOriginal=false;selected=-1;render();selectTab(false);persist();window.scrollTo({top:180,behavior:'smooth'});}
    if(download)downloadURL(state.history[Number(download.dataset.downloadLook)].image,'my-look.png');
    if(remove&&confirm('이 룩을 보관함에서 삭제할까요?')){state.history.splice(Number(remove.dataset.deleteLook),1);renderGallery();$('looksCount').textContent=state.history.length;persist();}
  };
  attachDrop($('modelStage'),uploadModel);attachDrop($('garmentImageBtn'),uploadGarment);
  window.addEventListener('beforeunload',e=>{if(busy||publishing){e.preventDefault();e.returnValue='';}});
}
async function init(){
  try {db=await openDB();const saved=await new Promise((resolve,reject)=>{const r=db.transaction('project').objectStore('project').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});if(saved)state=Core.normalizeProject(saved);}catch(e){feedback('브라우저 자동 저장을 사용할 수 없거나 이전 데이터를 읽지 못했습니다. ‘프로젝트 저장’으로 작업을 보관해주세요.');}
  bind();render();
  Lookbook3D.ready.then(ready=>{if(!ready)try{adminSoftware=new LookbookSoftware3D.Viewer($('adminSoftwareViewer'));}catch(_){}render3D();});
  const params=new URLSearchParams(location.hash.slice(1)),incoming=params.get('local-token');
  if(incoming){setToken(incoming);history.replaceState(null,'',location.pathname+location.search);}
  if(token){const ok=await checkConnection(Boolean(incoming));if(incoming&&!ok)dialog('connectDialog');}
}
init();

'use strict';
// Load the renderer only when the browser can create its required WebGL2
// context. Loading a GLB is not proof that pixels can be rendered.
(() => {
  const support = { available: false, message: '', ready: null };
  support.ready = new Promise(resolve => {
    let gl;
    try { gl = document.createElement('canvas').getContext('webgl2', {failIfMajorPerformanceCaveat:false}); } catch (_) { /* Unsupported device. */ }
    if (!gl) {
      support.message = '이 브라우저에서는 3D를 표시할 수 없어 사진으로 보여드립니다. 그래픽 가속을 지원하는 Chrome 또는 Edge에서 다시 열어주세요.';
      resolve(false); return;
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    const script = document.createElement('script'); script.type = 'module'; script.src = './vendor/model-viewer.min.js?v=20261108-3d-3';
    const timer = setTimeout(() => {support.message = '3D 화면을 준비하지 못했습니다. 페이지를 새로고침해주세요.';resolve(false);},30000);
    script.onload = () => {clearTimeout(timer);support.available = Boolean(customElements.get('model-viewer'));resolve(support.available);};
    script.onerror = () => {clearTimeout(timer);support.message = '3D 프로그램을 불러오지 못했습니다. 연결을 확인하고 새로고침해주세요.';resolve(false);};
    document.head.append(script);
  });
  window.Lookbook3D = support;
})();

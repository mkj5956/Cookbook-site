'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let publisher = null, uploading = false;
  // Credentials exist only in this closure until reload/logout. They are never
  // included in IndexedDB, project export, catalog JSON or a URL.
  $('adminLogin').onsubmit = async event => {
    event.preventDefault(); const token = $('githubToken').value.trim(); $('githubToken').value = '';
    $('loginError').hidden = true; $('loginButton').disabled = true;
    try {
      if (!token) throw new Error('GitHub에서 만든 관리자 인증 코드를 입력해주세요.');
      publisher = new LookbookPublisher(token); await publisher.authenticate();
      $('loginPanel').hidden = true; $('adminWorkspace').hidden = false;
      window.LookbookAdmin = Object.freeze({ authenticated: true, isPublishing: () => uploading });
      const script = document.createElement('script'); script.src = './app.js'; document.head.append(script);
      $('adminAccount').textContent = 'mkj5956 · 관리자';
    } catch (e) { publisher?.logout(); publisher = null; $('loginError').textContent = e.message; $('loginError').hidden = false; }
    finally { $('loginButton').disabled = false; }
  };
  $('logoutBtn').onclick = () => { if (uploading) return; publisher?.logout(); location.reload(); };
  window.addEventListener('lookbook-publish', async event => {
    if (uploading || !publisher) return;
    uploading = true; $('publishConfirm').disabled = true; $('logoutBtn').disabled = true;
    const status = text => { $('publishStatus').textContent = text; $('publishStatus').hidden = false; };
    window.dispatchEvent(new CustomEvent('lookbook-publish-state', { detail: true }));
    try {
      const result = await publisher.publish(event.detail, status);
      status(`옷 ${result.count}개의 3D 룩북을 GitHub에 저장했습니다. 사이트 반영까지 보통 1~3분 걸립니다.`);
      $('publishedLink').hidden = false; $('publishConfirm').textContent = '공개 요청 완료';
    } catch (e) { status(e.message); $('publishConfirm').disabled = false; }
    finally { uploading = false; $('logoutBtn').disabled = false; window.dispatchEvent(new CustomEvent('lookbook-publish-state', { detail: false })); }
  });
})();

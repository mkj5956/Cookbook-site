(function (root) {
  'use strict';
  const REPO = 'mkj5956/Cookbook-site', OWNER = 'mkj5956', BASE = 'https://api.github.com';
  const toBase64 = bytes => { let text = ''; for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(text); };
  class GitHubPublisher {
    #token; #fetch; #catalogSHA = null;
    constructor(token, fetcher = root.fetch.bind(root)) { this.#token = token; this.#fetch = fetcher; }
    logout() { this.#token = ''; }
    async request(path, body, method) {
      if (!this.#token) throw new Error('관리자 인증이 필요합니다.');
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 90000);
      try {
        const r = await this.#fetch(BASE + path, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.#token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(body === undefined ? {} : {'Content-Type': 'application/json'}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' });
        if (!r.ok) {
          if (r.status === 401) throw new Error('인증 코드가 올바르지 않거나 만료됐습니다. 다시 로그인해주세요.');
          if (r.status === 403) throw new Error('GitHub 쓰기 권한이 없거나 요청 한도에 도달했습니다. Cookbook-site의 Contents 읽기·쓰기 권한을 확인해주세요.');
          if ([409, 422].includes(r.status)) throw new Error('다른 변경이 먼저 저장됐습니다. 최신 공개 내용을 확인한 후 다시 로그인해주세요.');
          throw new Error(`GitHub 요청을 완료하지 못했습니다 (${r.status}).`);
        }
        return await r.json();
      } catch (e) {
        if (e.name === 'AbortError' || e instanceof TypeError) throw new Error('GitHub 연결이 중단됐습니다. 공개 결과를 먼저 확인한 뒤 다시 시도해주세요.');
        throw e;
      } finally { clearTimeout(timer); }
    }
    async authenticate() {
      const user = await this.request('/user');
      if (String(user.login).toLowerCase() !== OWNER) { this.logout(); throw new Error('mkj5956 계정만 관리자 화면을 사용할 수 있습니다.'); }
      const repo = await this.request(`/repos/${REPO}`);
      if (repo.full_name?.toLowerCase() !== REPO.toLowerCase() || !repo.permissions?.push) { this.logout(); throw new Error('이 저장소를 수정할 권한이 없습니다.'); }
      const file = await this.request(`/repos/${REPO}/contents/web/catalog.json?ref=main`);
      this.#catalogSHA = file.sha;
      return { login: user.login };
    }
    async publish(project, onProgress = () => {}) {
      const Core = root.LookbookCore || require('./core.js'), Catalog = root.LookbookCatalog || require('./catalog-core.js');
      if (!project?.garments?.some(Boolean)) throw new Error('공개할 옷을 먼저 등록해주세요.');
      const media = new Map();
      async function collect(data, kind) {
        if (kind === 'model') Catalog.modelData(data); else Core.imageData(data);
        const bytes = Uint8Array.from(atob(data.split(',')[1]), c => c.charCodeAt(0));
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
        const ext = kind === 'model' ? 'glb' : data.startsWith('data:image/png;') ? 'png' : data.startsWith('data:image/webp;') ? 'webp' : 'jpg';
        const path = `media/${hash}.${ext}`; media.set(path, bytes); return path;
      }
      const items = [];
      for (let i = 0; i < 6; i++) {
        const item = project.garments[i], prepared = project.prepared?.[i];
        if (!item) { items.push(null); continue; }
        if (!prepared?.glb || !prepared.image) throw new Error(`${item.name}: 3D 착용 모습을 생성하거나 GLB 파일을 등록해주세요.`);
        if (!prepared.items?.length) throw new Error('착용 상품 정보가 없습니다. 3D를 다시 생성해주세요.');
        const products = [];
        for (const p of prepared.items) products.push({ name: p.name, link: Core.coupangURL(p.link), image: await collect(p.image, 'image') });
        items.push({ slot: i, name: item.name, category: item.category, thumbnail: await collect(item.image, 'image'), poster: await collect(prepared.image, 'image'), model: await collect(prepared.glb, 'model'), source: prepared.source === 'uploaded' ? 'uploaded' : 'ai', products });
      }
      const catalog = Catalog.normalizeCatalog({ version: 1, publishedAt: new Date().toISOString(), items });
      onProgress('GitHub의 최신 내용을 확인합니다…');
      const previous = await this.request(`/repos/${REPO}/contents/web/catalog.json?ref=main`);
      if (previous.sha !== this.#catalogSHA) throw new Error('로그인 이후 공개 룩북이 변경됐습니다. 새로 로그인한 뒤 최신 내용을 확인해주세요.');
      const head = await this.request(`/repos/${REPO}/git/ref/heads/main`);
      const commit = await this.request(`/repos/${REPO}/git/commits/${head.object.sha}`);
      const tree = await this.request(`/repos/${REPO}/git/trees/${commit.tree.sha}?recursive=1`);
      const existing = new Set(tree.truncated ? [] : tree.tree.filter(e => e.type === 'blob').map(e => e.path));
      const entries = []; let i = 0;
      for (const [path, bytes] of media) {
        onProgress(`공개 파일 준비 중 ${++i}/${media.size}`);
        if (existing.has('web/' + path)) continue;
        const blob = await this.request(`/repos/${REPO}/git/blobs`, { content: toBase64(bytes), encoding: 'base64' });
        entries.push({ path: 'web/' + path, mode: '100644', type: 'blob', sha: blob.sha });
      }
      entries.push({ path: 'web/catalog.json', mode: '100644', type: 'blob', content: JSON.stringify(catalog) });
      const nextTree = await this.request(`/repos/${REPO}/git/trees`, { base_tree: commit.tree.sha, tree: entries });
      const nextCommit = await this.request(`/repos/${REPO}/git/commits`, { message: 'Publish owner-approved 3D lookbook', tree: nextTree.sha, parents: [head.object.sha] });
      const fresh = await this.request(`/repos/${REPO}/git/ref/heads/main`);
      if (fresh.object.sha !== head.object.sha) throw new Error('공개 도중 저장소가 변경됐습니다. 새로 로그인하고 다시 공개해주세요.');
      await this.request(`/repos/${REPO}/git/refs/heads/main`, { sha: nextCommit.sha, force: false }, 'PATCH');
      // Updating the ref is the publication boundary. Do not report an upload
      // failure just because an optional follow-up read fails after this point.
      this.#catalogSHA = null;
      try { const now = await this.request(`/repos/${REPO}/contents/web/catalog.json?ref=main`); this.#catalogSHA = now.sha; } catch (_) { /* A fresh login will reload the baseline. */ }
      return { sha: nextCommit.sha, url: 'https://mkj5956.github.io/Cookbook-site/', count: items.filter(Boolean).length };
    }
  }
  root.LookbookPublisher = GitHubPublisher;
  if (typeof module !== 'undefined') module.exports = GitHubPublisher;
})(typeof window !== 'undefined' ? window : globalThis);

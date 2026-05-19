export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let targetHost = '';

    // ================= 核心：多合一动态路由分发 =================
    if (url.pathname.startsWith('/bot')) {
      targetHost = 'api.telegram.org';
    } else if (url.pathname.startsWith('/repos/') || url.pathname.startsWith('/user/')) {
      targetHost = 'api.github.com';
    } else if (url.pathname.includes('/raw/')) {
      targetHost = 'raw.githubusercontent.com';
    } else {
      targetHost = 'github.com';
    }
    // ============================================================

    const targetUrl = 'https://' + targetHost + url.pathname + url.search;

    // 1. 深度清洗 Headers，剥离可能导致阻断和死锁的旧 Content-Length 和 Host
    const newHeaders = new Headers();
    for (const [key, value] of request.headers.entries()) {
      if (key.toLowerCase() !== 'host' && key.toLowerCase() !== 'content-length') {
        newHeaders.set(key, value);
      }
    }
    newHeaders.set('Host', targetHost);
    newHeaders.set('Referer', `https://${targetHost}`);
    
    if (targetHost === 'api.github.com') {
      newHeaders.set('Accept', 'application/vnd.github+json');
      newHeaders.set('X-GitHub-Api-Version', '2022-11-28');
    }

    // 2. 【核心修复】：彻底放弃脆弱的 stream 直通，改用 blob 内存全装载
    // 确保数据在 Worker 内部是一个完整的死块，绝不给大网抖动扯断流的机会
    let requestBody = null;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      requestBody = await request.blob(); 
    }

    try {
      // 3. 发起官方 Fetch
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: newHeaders,
        body: requestBody,
        redirect: 'follow'
      });

      // 4. 强制装载回执，哪怕是报错也必须完整抓下来，绝不漏掉任何标准 JSON
      const responseBody = await response.blob();

      const modifiedResponse = new Response(responseBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });

      // 注入跨域头
      modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
      modifiedResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      modifiedResponse.headers.set('Access-Control-Allow-Headers', '*');

      return modifiedResponse;

    } catch (e) {
      return new Response(JSON.stringify({ error: "Worker 转发遭遇致命崩溃", details: e.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
}

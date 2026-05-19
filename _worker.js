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

    // 1. 深度清洗并重构 Headers，干掉可能导致 CF 误判的旧 Content-Length
    const newHeaders = new Headers();
    for (const [key, value] of request.headers.entries()) {
      // 核心：强制放行身份校验、类型和 UA，让 CF 自动计算大网长度，防止死锁
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

    // 2. 彻底放弃脆弱的 stream 直通，改用 text/blob 载入，安全隔离
    let requestBody = null;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      requestBody = await request.blob(); 
    }

    try {
      // 3. 核心 Fetch 动作
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: newHeaders,
        body: requestBody,
        redirect: 'follow'
      });

      // 4. 读取回执内容，确保即便是报错也能完整吐回给本地脚本，绝不流失
      const responseBody = await response.blob();

      const modifiedResponse = new Response(responseBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });

      // 注入跨域，确保双向通畅
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // 1. 自动路由逻辑
    let targetHost = 'github.com';
    if (url.pathname.startsWith('/repos/') || url.pathname.startsWith('/user/')) {
      targetHost = 'api.github.com';
    } else if (url.pathname.includes('/raw/')) {
      targetHost = 'raw.githubusercontent.com';
    }

    const targetUrl = 'https://' + targetHost + url.pathname + url.search;

    // 2. 深度克隆并强制校准头部
    const newHeaders = new Headers(request.headers);
    newHeaders.set('Host', targetHost);
    newHeaders.set('Referer', `https://${targetHost}`);
    newHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // 针对 API 请求的特殊加固
    if (targetHost === 'api.github.com') {
      newHeaders.set('Accept', 'application/vnd.github+json');
      newHeaders.set('X-GitHub-Api-Version', '2022-11-28');
    }

    // 3. 【防爆核心优化】：移除 arrayBuffer 预装载，改用纯流式直通
    let body = null;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = request.body; // 直接转接 ReadableStream
    }

    try {
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: newHeaders,
        body: body,
        redirect: 'follow'
      });

      // 4. 返回响应并注入跨域头
      const modifiedResponse = new Response(response.body, response);
      modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
      modifiedResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      modifiedResponse.headers.set('Access-Control-Allow-Headers', '*');
      
      return modifiedResponse;

    } catch (e) {
      return new Response(`❌ Worker Proxy 故障: ${e.message}`, { status: 500 });
    }
  }
};

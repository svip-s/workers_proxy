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
      // 必须指定返回 JSON，否则有些 GET 请求可能拿不到预期的 sha
      newHeaders.set('Accept', 'application/vnd.github+json');
      // 显式指定 GitHub API 版本（官方推荐做法）
      newHeaders.set('X-GitHub-Api-Version', '2022-11-28');
    }

    // 3. 处理请求体：使用预装载模式确保 PUT 数据完整
    let body = null;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = await request.arrayBuffer();
    }

    try {
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: newHeaders,
        body: body,
        redirect: 'follow'
      });

      // 4. 返回响应并注入跨域头
      // 使用 new Response 重新构造以确保 Headers 可写
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

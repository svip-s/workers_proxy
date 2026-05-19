export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let targetHost = '';

    // ================= 核心：多合一动态路由分发 =================
    if (url.pathname.startsWith('/bot')) {
      // 1. 如果路径是以 /bot 开头，说明是本地发来的 Telegram 推送
      targetHost = 'api.telegram.org';
    } else if (url.pathname.startsWith('/repos/') || url.pathname.startsWith('/user/')) {
      // 2. 如果是 GitHub API 路径
      targetHost = 'api.github.com';
    } else if (url.pathname.includes('/raw/')) {
      // 3. 如果是 GitHub Raw 原始文件路径
      targetHost = 'raw.githubusercontent.com';
    } else {
      // 4. 默认其余全部归属 GitHub 主站
      targetHost = 'github.com';
    }
    // ============================================================

    // 拼装出真正的官方最终请求地址
    const targetUrl = 'https://' + targetHost + url.pathname + url.search;

    // 深度克隆并强制校准头部，彻底清洗来源干扰
    const newHeaders = new Headers(request.headers);
    newHeaders.set('Host', targetHost);
    newHeaders.set('Referer', `https://${targetHost}`);
    newHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // 针对 GitHub API 请求的特殊特权加固
    if (targetHost === 'api.github.com') {
      newHeaders.set('Accept', 'application/vnd.github+json');
      newHeaders.set('X-GitHub-Api-Version', '2022-11-28');
    }

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

      // 吐回响应并注入跨域头
      const modifiedResponse = new Response(response.body, response);
      modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
      modifiedResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      return modifiedResponse;

    } catch (e) {
      return new Response(`❌ 融合路由分发异常: ${e.message}`, { status: 502 });
    }
  }
};

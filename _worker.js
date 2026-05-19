export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let targetHost = '';

    // ================= 1. 多合一动态路由分发 =================
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

    // 2. 克隆并重构请求头
    const newHeaders = new Headers();
    for (const [key, value] of request.headers.entries()) {
      const k = key.toLowerCase();
      if (!['host', 'content-length', 'accept-encoding', 'connection', 'keep-alive'].includes(k)) {
        newHeaders.set(key, value);
      }
    }
    
    newHeaders.set('Host', targetHost);
    newHeaders.set('Referer', `https://${targetHost}`);
    newHeaders.set('Connection', 'close'); // 显式宣告短连接，防止大网多命令连发长连接串线
    newHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    if (targetHost === 'api.github.com') {
      newHeaders.set('Accept', 'application/vnd.github+json');
      newHeaders.set('X-GitHub-Api-Version', '2022-11-28');
    }

    let requestBody = null;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      requestBody = await request.arrayBuffer();
    }

    try {
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: newHeaders,
        body: requestBody,
        redirect: 'follow'
      });

      // 【核心加固逻辑】：如果是 API 请求，彻底放弃流直通，实施云端全量文本装载
      if (targetHost === 'api.github.com' || targetHost === 'api.telegram.org') {
        const responseText = await response.text();
        
        // 精准清洗：剔除原厂可能引发本地 curl 传输截断、混乱的编码头
        const responseHeaders = new Headers();
        for (const [key, value] of response.headers.entries()) {
          const k = key.toLowerCase();
          if (!['content-encoding', 'transfer-encoding', 'content-length', 'connection'].includes(k)) {
            responseHeaders.set(key, value);
          }
        }
        
        responseHeaders.set('Connection', 'close');
        responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
        responseHeaders.set('Access-Control-Allow-Origin', '*');

        return new Response(responseText, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders
        });
      }

      // 正常的非 API 大文件路由，继续保持最高效的流直通
      const modifiedResponse = new Response(response.body, response);
      modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
      return modifiedResponse;

    } catch (e) {
      return new Response(JSON.stringify({ error: "Proxy Exception", details: e.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
}

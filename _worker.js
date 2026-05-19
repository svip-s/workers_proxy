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

    // 1. 深度清洗请求头，剥离可能引发阻断和压缩冲突的头部
    const newHeaders = new Headers();
    for (const [key, value] of request.headers.entries()) {
      if (!['host', 'content-length', 'accept-encoding'].includes(key.toLowerCase())) {
        newHeaders.set(key, value);
      }
    }
    newHeaders.set('Host', targetHost);
    newHeaders.set('Referer', `https://${targetHost}`);
    newHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    if (targetHost === 'api.github.com') {
      newHeaders.set('Accept', 'application/vnd.github+json');
      newHeaders.set('X-GitHub-Api-Version', '2022-11-28');
    }

    // 2. 彻底放弃脆弱的 stream 直通，改用 Blob 内存全装载锁死数据块
    let requestBody = null;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      requestBody = await request.blob();
    }

    try {
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: newHeaders,
        body: requestBody,
        redirect: 'follow'
      });

      // 3. 【核心修复】：强制在云端将响应流全量装载。
      // 这一步会逼迫 Worker 核心自动完成对 upstream 响应（如 GZIP 压缩）的透明解压！
      const responseData = await response.blob();

      // 4. 【核心修复】：清洗返回头，剔除可能导致本地 curl 乱码或断流的特殊编码头
      const responseHeaders = new Headers();
      for (const [key, value] of response.headers.entries()) {
        const k = key.toLowerCase();
        if (!['content-encoding', 'transfer-encoding', 'content-length', 'content-security-policy'].includes(k)) {
          responseHeaders.set(key, value);
        }
      }

      // 注入通用跨域头，确保双向通畅
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', '*');

      return new Response(responseData, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });

    } catch (e) {
      return new Response(JSON.stringify({ error: "Worker 转发遭遇致命崩溃", details: e.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
}

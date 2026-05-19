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

    // 1. 强力清洗并重构请求头
    const newHeaders = new Headers();
    for (const [key, value] of request.headers.entries()) {
      const k = key.toLowerCase();
      // 剥离可能导致阻断、压缩乱码、或强制保持长连接的旧头部
      if (!['host', 'content-length', 'accept-encoding', 'connection', 'keep-alive'].includes(k)) {
        newHeaders.set(key, value);
      }
    }
    
    // 强制每次请求独立，杜绝大网环境下的 Keep-Alive 连接串线污染
    newHeaders.set('Host', targetHost);
    newHeaders.set('Referer', `https://${targetHost}`);
    newHeaders.set('Connection', 'close');
    newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    newHeaders.set('Pragma', 'no-cache');
    newHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    if (targetHost === 'api.github.com') {
      newHeaders.set('Accept', 'application/vnd.github+json');
      newHeaders.set('X-GitHub-Api-Version', '2022-11-28');
    }

    // 2. 放弃流直通，PUT/POST 大文件全装载，确保发往 GitHub 的数据极其完整
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

      // 3. 【核心修复】：强行在云端将 GitHub 回执转换为全量文本装载（解压并锁死）
      // 这样可以彻底剥离原始的 chunked 分块传输干扰
      const responseText = await response.text();

      // 4. 清洗并重构返回头，剔除干扰本地 curl 的编码头
      const responseHeaders = new Headers();
      for (const [key, value] of response.headers.entries()) {
        const k = key.toLowerCase();
        if (!['content-encoding', 'transfer-encoding', 'content-length', 'connection'].includes(k)) {
          responseHeaders.set(key, value);
        }
      }

      // 强制返回头也宣告连接关闭，并注入通用跨域
      responseHeaders.set('Connection', 'close');
      responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', '*');

      return new Response(responseText, {
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

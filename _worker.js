export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // 1. 智能识别：如果是 Git Push/Pull 流量，或者 API/Raw 流量，进行精准分流
    let targetHost = 'github.com';
    
    if (url.pathname.startsWith('/repos/') || url.pathname.startsWith('/user/')) {
      targetHost = 'api.github.com';
    } else if (url.pathname.includes('/raw/')) {
      targetHost = 'raw.githubusercontent.com';
    } else if (url.pathname.endsWith('.git') || url.pathname.includes('.git/')) {
      // 🏆 核心修复：Git 智能传输协议必须强制清洗并保证 Host 的绝对纯净
      targetHost = 'github.com';
    }

    const targetUrl = 'https://' + targetHost + url.pathname + url.search;

    // 2. 深度克隆并强制校准头部，带上标准的 Git 客户端伪装
    const newHeaders = new Headers(request.headers);
    newHeaders.set('Host', targetHost);
    newHeaders.set('Referer', `https://${targetHost}`);
    
    // 如果是 Git 流量，保留或伪装标准的 Git 代理 User-Agent
    if (request.headers.get('User-Agent') && request.headers.get('User-Agent').includes('git')) {
      newHeaders.set('User-Agent', request.headers.get('User-Agent'));
    } else {
      newHeaders.set('User-Agent', 'git/2.39.2 (git-allow-proxy)');
    }
    
    if (targetHost === 'api.github.com') {
      newHeaders.set('Accept', 'application/vnd.github+json');
      newHeaders.set('X-GitHub-Api-Version', '2022-11-28');
    }

    // 3. 流式直通
    let body = null;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = request.body;
    }

    try {
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: newHeaders,
        body: body,
        redirect: 'follow'
      });

      const modifiedResponse = new Response(response.body, response);
      modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
      return modifiedResponse;
    } catch (e) {
      return new Response(`❌ GH Worker 云端代理故障: ${e.message}`, { status: 502 });
    }
  }
}

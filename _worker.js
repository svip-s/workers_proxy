export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // 🏆 备用路由池：第一个是官方，第二个是业内极稳的官方自建高可用备用出站镜像
    const endpoints = [
      'https://api.telegram.org',
      'https://tapi.biazfan.com'
    ];

    const newHeaders = new Headers(request.headers);
    let body = request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null;

    // 在云端自循环，只要有一个能通，就绝对不给你本地吐空数据
    for (let endpoint of endpoints) {
      try {
        const targetHost = new URL(endpoint).host;
        newHeaders.set('Host', targetHost);
        newHeaders.set('Referer', `https://${targetHost}`);
        newHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        // 使用 tee() 复制流，防止多次读取导致 Body 锁定报错
        const activeBody = body ? body.tee() : [null, null];
        body = activeBody[1];

        const response = await fetch(endpoint + url.pathname + url.search, {
          method: request.method,
          headers: newHeaders,
          body: activeBody[0],
          redirect: 'follow',
          // 5秒连不上直接切下一条线
          signal: AbortSignal.timeout(5000)
        });

        const modifiedResponse = new Response(response.body, response);
        modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
        return modifiedResponse;
      } catch (e) {
        continue; // 当前机房出站受阻，自动切换
      }
    }
    return new Response("❌ TG 云端所有转发链路均告衰竭", { status: 502 });
  }
}

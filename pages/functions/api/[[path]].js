// Cloudflare Pages Functions 反向代理
// 用途：绕开 *.workers.dev 在国内的 DNS 投毒。
// 链路：国内客户端 → moviefind-search.pages.dev/api/* → 上游 Worker（服务端解析，走 CF 自家 DNS）
// Worker 侧零改动、Pages 侧零绑定，纯转发。

const UPSTREAM_HOST = 'moviefind-search.17721266011.workers.dev';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400',
};

export async function onRequest(ctx) {
  const req = ctx.request;
  const url = new URL(req.url);

  // CORS 预检
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  // WebSocket 升级：手动双向中继（虽然当前 Worker 不用 WS，但保留通用性）
  if ((req.headers.get('Upgrade') || '').toLowerCase() === 'websocket') {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const up = new WebSocket('wss://' + UPSTREAM_HOST + url.pathname + url.search);
    let upOpen = false;
    let closed = false;
    const queue = [];

    const closeBoth = () => {
      if (closed) return;
      closed = true;
      try { server.close(1000); } catch (e) {}
      try { up.close(); } catch (e) {}
    };

    up.addEventListener('open', () => {
      upOpen = true;
      while (queue.length) { try { up.send(queue.shift()); } catch (e) { closeBoth(); return; } }
    });
    up.addEventListener('message', (e) => { try { server.send(e.data); } catch (e) { closeBoth(); } });
    up.addEventListener('close', closeBoth);
    up.addEventListener('error', closeBoth);

    server.addEventListener('message', (e) => {
      if (upOpen) { try { up.send(e.data); } catch (e) { closeBoth(); } }
      else queue.push(e.data); // 关键：不缓存会丢握手消息
    });
    server.addEventListener('close', closeBoth);
    server.addEventListener('error', closeBoth);

    return new Response(null, { status: 101, webSocket: client });
  }

  // 普通 HTTP：原样转发
  const headers = new Headers(req.headers);
  headers.delete('Host'); // 让上游按自己的 Host 处理

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  let body = undefined;
  if (hasBody) {
    body = await req.arrayBuffer();
    headers.delete('Content-Length'); // body 长度可能因编码变化，让上游重算
    headers.delete('Transfer-Encoding');
  }

  const resp = await fetch('https://' + UPSTREAM_HOST + url.pathname + url.search, {
    method: req.method,
    headers,
    body,
    redirect: 'manual',
  });

  const out = new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: resp.headers,
  });
  for (const k of Object.keys(CORS)) out.headers.set(k, CORS[k]);
  return out;
}

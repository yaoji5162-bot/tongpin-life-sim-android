// Android performs API requests so local WebView pages do not depend on server CORS.
(() => {
  if (!window.AevumNative) return;
  const pending = new Map(); let sequence = 0;
  window.__aevumResponse = (id, status, body, error) => {
    const entry = pending.get(id); if (!entry) return;
    pending.delete(id); entry.cleanup();
    if (error) entry.reject(new TypeError(error));
    else entry.resolve(new Response(body, {status, headers: {'Content-Type':'application/json'}}));
  };
  window.fetch = (address, options = {}) => new Promise((resolve, reject) => {
    const id = 'request-' + (++sequence), signal = options.signal;
    const abort = () => { if (!pending.has(id)) return; pending.delete(id); window.AevumNative.cancelRequest(id); reject(new DOMException('Aborted','AbortError')); };
    if (signal?.aborted) { reject(new DOMException('Aborted','AbortError')); return; }
    const cleanup = () => signal?.removeEventListener('abort', abort);
    pending.set(id, {resolve,reject,cleanup}); signal?.addEventListener('abort', abort, {once:true});
    try { window.AevumNative.request(id, options.method || 'GET', String(address), JSON.stringify(options.headers || {}), options.body || ''); }
    catch (error) { pending.delete(id); cleanup(); reject(new TypeError('Android 网络接口不可用')); }
  });
  const images = new Map();
  window.__aevumImage = (id, data, error) => { const item=images.get(id); if (!item) return; images.delete(id); clearTimeout(item.timer); error ? item.reject(new Error(error)) : item.resolve(data); };
  window.cacheAevumImage = address => new Promise((resolve,reject) => {
    const id='image-'+(++sequence), timer=setTimeout(()=>{images.delete(id);reject(new Error('立绘备份超时'));},30000);
    images.set(id,{resolve,reject,timer}); window.AevumNative.cacheImage(id,address);
  });
})();

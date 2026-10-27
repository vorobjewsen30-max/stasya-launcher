const { fetch: nodeFetch, Agent, setGlobalDispatcher } = require('undici');
// TLS 1.2 works with networks which reject newer ClientHello handshakes.
// Certificates and hostnames are always verified. Chromium remains a fallback
// for Windows system proxy configurations unsupported by the Node transport.
function createTransport(net) {
  const dispatcher = new Agent({ connect: { maxVersion: 'TLSv1.2', timeout:15000 }, connections:12 });
  setGlobalDispatcher(dispatcher);
  const chromiumHosts = new Set();
  return async (url, options) => {
    const host = new URL(url).hostname;
    const chromium = () => net.fetch(url, { ...options, redirect:options.redirect === 'manual' ? 'follow' : options.redirect });
    if (chromiumHosts.has(host)) return chromium();
    try { return await nodeFetch(url, { ...options, dispatcher }); }
    catch (e) { if (options.signal?.aborted) throw e; const response = await chromium(); chromiumHosts.add(host); return response; }
  };
}
module.exports = { createTransport };


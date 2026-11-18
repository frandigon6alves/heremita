import { MockAgent, setGlobalDispatcher } from 'undici';
import http from 'node:http';
const agent = new MockAgent(); agent.disableNetConnect();
agent.enableNetConnect((host) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host));
setGlobalDispatcher(agent);
try { await fetch('https://example.com/'); console.log('EXTERNAL REACHED'); } catch (e) { console.log('blocked:', e.cause?.name ?? e.name, e.cause?.message?.slice(0,80)); }
const s = http.createServer((q, r) => { r.end('ok:' + q.headers['user-agent']); }).listen(0, '127.0.0.1');
await new Promise((r) => s.once('listening', r));
const res = await fetch(`http://127.0.0.1:${s.address().port}/x`, { headers: { 'user-agent': 'Heremita/0.0.0' } });
console.log('local:', res.status, await res.text()); s.close();

// Vitest setup file (every API test file): no test may reach the internet.
// Node 24's global `fetch` runs on its bundled undici 7, which honours the
// global dispatcher set through the installed undici 7, so this MockAgent sees
// every `fetch`; non-loopback requests fail like a network error. Stub servers
// on localhost stay reachable. Raw sockets (`pg`, supertest) are not affected.
import { MockAgent, setGlobalDispatcher } from 'undici';

const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

const agent = new MockAgent();
agent.disableNetConnect();
agent.enableNetConnect((host) => LOOPBACK_HOST.test(host));
setGlobalDispatcher(agent);

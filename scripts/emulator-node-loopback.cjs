// Local launcher preload: the Firebase SDK's discovery server otherwise calls
// listen(port) with a wildcard address. Keep implicit/wildcard TCP binds local.
const net = require('node:net');
const original = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  const first = args[0];
  const local = host => host === undefined || host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  if (first && typeof first === 'object' && 'port' in first) args[0] = { ...first, host: local(first.host) };
  else if (typeof first === 'number' || typeof first === 'string' && /^\d+$/.test(first)) {
    if (typeof args[1] === 'string') args[1] = local(args[1]);
    else args.splice(1, 0, '127.0.0.1');
  }
  return Reflect.apply(original, this, args);
};

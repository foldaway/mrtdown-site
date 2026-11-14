import { BlockList, isIP, SocketAddress } from 'node:net';

// Published origin-facing ranges: https://www.cloudflare.com/ips/
const cloudflareEdges = new BlockList();
for (const [address, prefix] of [
  ['173.245.48.0', 20],
  ['103.21.244.0', 22],
  ['103.22.200.0', 22],
  ['103.31.4.0', 22],
  ['141.101.64.0', 18],
  ['108.162.192.0', 18],
  ['190.93.240.0', 20],
  ['188.114.96.0', 20],
  ['197.234.240.0', 22],
  ['198.41.128.0', 17],
  ['162.158.0.0', 15],
  ['104.16.0.0', 13],
  ['104.24.0.0', 14],
  ['172.64.0.0', 13],
  ['131.0.72.0', 22],
] as const) {
  cloudflareEdges.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [
  ['2400:cb00::', 32],
  ['2606:4700::', 32],
  ['2803:f800::', 32],
  ['2405:b500::', 32],
  ['2405:8100::', 32],
  ['2a06:98c0::', 29],
  ['2c0f:f248::', 32],
] as const) {
  cloudflareEdges.addSubnet(address, prefix, 'ipv6');
}

export function getClientIp(request: Request) {
  // Fly Proxy supplies its immediate peer on both proxied and direct requests.
  const peer = request.headers.get('fly-client-ip');
  const family = peer && isIP(peer);
  if (!peer || !family) return 'unknown';

  const peerFamily = family === 4 ? 'ipv4' : 'ipv6';
  if (cloudflareEdges.check(peer, peerFamily)) {
    const rider = request.headers.get('cf-connecting-ip');
    const riderFamily = rider && isIP(rider);
    if (rider && riderFamily) {
      return new SocketAddress({
        address: rider,
        family: riderFamily === 4 ? 'ipv4' : 'ipv6',
      }).address;
    }
  }
  return new SocketAddress({ address: peer, family: peerFamily }).address;
}

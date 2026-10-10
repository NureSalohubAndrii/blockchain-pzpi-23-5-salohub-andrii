import { NodeServer } from './node';

const PORT = parseInt(process.env.PORT || '3001', 10);

const initialPeers = process.env.PEERS
  ? process.env.PEERS.split(',').map((p) => p.trim())
  : [];

const node = new NodeServer(PORT, initialPeers);
node.start();

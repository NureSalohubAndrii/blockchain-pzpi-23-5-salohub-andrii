import { Router, type Request, type Response } from 'express';
import type { NodeServer } from '../node';

export function createNetworkRouter(node: NodeServer): Router {
  const router = Router();

  router.get('/peers', (_: Request, res: Response) => {
    res.json({ peers: Array.from(node.peers) });
  });

  router.post('/peers', (req: Request, res: Response) => {
    const { peer } = req.body;

    if (peer && peer !== `http://localhost:${node.port}`) {
      node.peers.add(peer);
    }

    res.json({ peers: Array.from(node.peers) });
  });

  router.delete('/peers', (req: Request, res: Response) => {
    const { peer } = req.body || {};
    if (peer) {
      node.peers.delete(peer);
    } else {
      node.peers.clear();
    }
    res.json({ peers: Array.from(node.peers) });
  });

  router.post('/sync', async (_: Request, res: Response) => {
    await node.syncWithPeers();

    res.json({
      message: 'Sync completed',
      chainLength: node.blockchain.chain.length,
    });
  });

  return router;
}

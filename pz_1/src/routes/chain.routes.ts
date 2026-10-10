import { Router, type Request, type Response } from 'express';
import type { NodeServer } from '../node';
import {
  BLOCK_REWARD,
  createCoinbaseTransaction,
  mineBlock,
  type Block,
  type BlockHeader,
} from '../../core/block';
import { calculateMerkelRoot } from '../../core/merkel';

export function createChainRouter(node: NodeServer): Router {
  const router = Router();

  router.get('/chain', (_: Request, res: Response) => {
    res.json({
      length: node.blockchain.chain.length,
      work: node.getCumulativeWork(node.blockchain.chain),
      chain: node.blockchain.chain,
    });
  });

  router.get('/chain/validate', (_: Request, res: Response) => {
    try {
      node.blockchain.isValidChain(node.blockchain.chain);
      res.json({ valid: true, message: 'Blockchain is valid' });
    } catch (err: any) {
      res.status(400).json({ valid: false, error: err.message });
    }
  });

  router.post('/mine', async (req: Request, res: Response) => {
    try {
      const { minerAddress } = req.body;
      if (!minerAddress) {
        return res.status(400).json({ error: 'minerAddress is required' });
      }

      const mempoolTransactions = [...node.mempool.transactions];
      const totalFees = mempoolTransactions.reduce(
        (sum, transaction) => sum + transaction.fee,
        0
      );

      const coinbaseTransaction = createCoinbaseTransaction(
        minerAddress,
        BLOCK_REWARD,
        totalFees
      );
      const blockTransactions = [coinbaseTransaction, ...mempoolTransactions];

      const previousBlock = node.blockchain.getLatestBlock();
      const difficulty = node.blockchain.getDifficulty();

      const rawHeader: BlockHeader = {
        blockNumber: previousBlock.header.blockNumber + 1,
        timestamp: Date.now(),
        previousHash: previousBlock.hash,
        merkelRoot: calculateMerkelRoot(blockTransactions),
        difficulty,
        nonce: 0,
      };

      const rawBlock: Block = {
        header: rawHeader,
        transactions: blockTransactions,
        hash: '',
      };

      const minedBlock = mineBlock(rawBlock, difficulty);

      node.blockchain.addBlock(minedBlock);

      node.mempool.transactions = [];

      await node.broadcast('/blocks', minedBlock);

      res.json({ message: 'Block successfully mined', block: minedBlock });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/blocks', async (req: Request, res: Response) => {
    try {
      const incomingBlock: Block = req.body;
      const latestBlock = node.blockchain.getLatestBlock();

      if (incomingBlock.header.previousHash === latestBlock.hash) {
        node.blockchain.addBlock(incomingBlock);

        const minedSignatures = new Set(
          incomingBlock.transactions.map((tx) => tx.signature)
        );
        node.mempool.transactions = node.mempool.transactions.filter(
          (tx) => !minedSignatures.has(tx.signature)
        );

        console.log(
          `[Node ${node.port}] Accepted new block #${incomingBlock.header.blockNumber}`
        );
        return res.json({ message: 'Block accepted' });
      }

      console.log(
        `[Node ${node.port}] Received block with unknown parent. Triggering sync...`
      );
      await node.syncWithPeers();

      res.json({ message: 'Sync triggered' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

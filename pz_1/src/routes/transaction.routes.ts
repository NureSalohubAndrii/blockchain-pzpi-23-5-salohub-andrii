import { Router, type Request, type Response } from 'express';
import type { NodeServer } from '../node';
import { Wallet } from '../../core/wallet';
import type { Transaction } from '../../core/transaction';

export function createTransactionRouter(node: NodeServer): Router {
  const router = Router();

  router.post('/wallet', (_: Request, res: Response) => {
    const wallet = new Wallet();
    res.json({ address: wallet.address, publicKey: wallet.publicKey });
  });

  router.get('/balance/:address', (req: Request, res: Response) => {
    const address = req.params.address as string;
    const balance = node.blockchain.getBalance(address);
    const nonce = node.blockchain.getNonce(address);

    res.json({ address, balance, nonce });
  });

  router.get('/mempool', (_: Request, res: Response) => {
    const transactions = node.mempool.transactions;
    res.json({ count: transactions.length, transactions });
  });

  router.post(['/transactions', '/transaction'], async (req: Request, res: Response) => {
    try {
      const transaction = req.body as Transaction;
      node.mempool.addTransaction(
        transaction,
        (address: string) => node.blockchain.getBalance(address),
        (address: string) => node.blockchain.getNonce(address)
      );

      await node.broadcast('/transactions', transaction);
      res
        .status(201)
        .json({ message: 'Transaction added to mempool', transaction });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}

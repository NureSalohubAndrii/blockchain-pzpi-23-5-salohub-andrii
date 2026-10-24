import { Router, type Request, type Response } from 'express';
import type { NodeServer } from '../node';
import { Wallet } from '../../core/wallet';
import { signTransaction, type Transaction } from '../../core/transaction';
import { sha256 } from '../../core/crypto';

function normalizePem(key: string): string {
  let normalized = key.trim();
  if (
    normalized.startsWith('----BEGIN') &&
    !normalized.startsWith('-----BEGIN')
  ) {
    normalized = '-' + normalized;
  }
  if (normalized.endsWith('KEY----') && !normalized.endsWith('KEY-----')) {
    normalized = normalized + '-';
  }
  return normalized + '\n';
}

export function createTransactionRouter(node: NodeServer): Router {
  const router = Router();

  router.post('/wallet', (_: Request, res: Response) => {
    const wallet = new Wallet();
    res.json({
      address: wallet.address,
      publicKey: wallet.publicKey,
      privateKey: wallet.getPrivateKey(),
    });
  });

  router.post(
    ['/transactions/sign', '/transaction/sign'],
    (req: Request, res: Response) => {
      try {
        const {
          recipient,
          amount,
          fee = 0,
          nonce = 0,
          publicKey,
          privateKey,
          sender,
        } = req.body;
        if (!recipient || amount === undefined || !publicKey || !privateKey) {
          return res.status(400).json({
            error: 'recipient, amount, publicKey, and privateKey are required',
          });
        }

        const cleanPublicKey = normalizePem(publicKey);
        const cleanPrivateKey = normalizePem(privateKey);

        const tx: Transaction = {
          sender: sender || sha256(cleanPublicKey),
          recipient,
          amount: Number(amount),
          fee: Number(fee),
          nonce: Number(nonce),
          publicKey: cleanPublicKey,
          signature: '',
        };

        signTransaction(tx, cleanPrivateKey);

        res.json({
          signature: tx.signature,
          transaction: tx,
        });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    }
  );

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

  router.post(
    ['/transactions', '/transaction'],
    async (req: Request, res: Response) => {
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
    }
  );

  return router;
}

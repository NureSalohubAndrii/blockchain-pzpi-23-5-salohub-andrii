import express from 'express';
import { Blockchain } from '../core/blockchain';
import { Mempool } from '../core/mempool';
import type { Block } from '../core/block';
import { createChainRouter } from './routes/chain.routes';
import { createTransactionRouter } from './routes/transaction.routes';
import { createNetworkRouter } from './routes/network.routes';

export class NodeServer {
  app: express.Express;
  blockchain: Blockchain;
  mempool: Mempool;
  peers: Set<string>;
  port: number;
  server?: any;

  constructor(port: number, initialPeers: string[] = []) {
    this.port = port;
    this.app = express();
    this.mempool = new Mempool();
    this.blockchain = new Blockchain();
    this.peers = new Set(initialPeers);

    this.app.use(express.json());
    this.setupRoutes();
  }

  async broadcast(endpoint: string, data: any) {
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    for (const peer of this.peers) {
      try {
        await fetch(`${peer}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
      } catch (err) {
        console.warn(
          `[Node ${this.port}] Failed to broadcast to ${peer}:`,
          (err as any).message
        );
      }
    }
  }

  getCumulativeWork(chain: Block[]) {
    return chain.reduce(
      (sum, block) => sum + Math.pow(2, block.header.difficulty),
      0
    );
  }

  async syncWithPeers() {
    for (const peer of this.peers) {
      try {
        const response = await fetch(`${peer}/chain`);
        if (!response.ok) continue;

        const { chain: peerChain }: { chain: Block[] } = await response.json();

        try {
          this.blockchain.isValidChain(peerChain);
        } catch (error) {
          console.warn(`[Node ${this.port}] Peer ${peer} sent invalid chain`);
          continue;
        }

        const myWork = this.getCumulativeWork(this.blockchain.chain);
        const peerWork = this.getCumulativeWork(peerChain);

        if (myWork < peerWork) {
          console.log(
            `[Node ${this.port}] Replacing chain with peer ${peer} (Work: ${peerWork} > ${myWork})`
          );

          const newTransactionsSignatures = new Set(
            peerChain.flatMap((block) =>
              block.transactions.map((transaction) => transaction.signature)
            )
          );
          const orphanedTransactions = this.blockchain.chain
            .flatMap((block) => block.transactions)
            .filter(
              (transaction) =>
                transaction.sender !== 'system' &&
                !newTransactionsSignatures.has(transaction.signature)
            );

          this.blockchain.chain = peerChain;

          for (const transaction of orphanedTransactions) {
            try {
              this.mempool.addTransaction(
                transaction,
                (address: string) => this.blockchain.getBalance(address),
                (address: string) => this.blockchain.getNonce(address)
              );
            } catch (err: any) {
              console.warn(
                `[Node ${this.port}] Could not return orphaned transaction to mempool:`,
                err.message
              );
            }
          }
        }
      } catch (err) {
        console.warn(
          `[Node ${this.port}] Sync with ${peer} failed:`,
          (err as any).message
        );
      }
    }
  }

  private setupRoutes() {
    this.app.use('/', createChainRouter(this));
    this.app.use('/', createTransactionRouter(this));
    this.app.use('/', createNetworkRouter(this));
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, '0.0.0.0', () => {
        console.log(
          `[Node ${this.port}] Running at http://localhost:${this.port}`
        );
        console.log(`[Node ${this.port}] Initial peers:`, Array.from(this.peers));
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

import { describe, it, expect } from 'vitest';
import { NodeServer } from '../src/node';
import { Wallet } from '../core/wallet';
import {
  mineBlock,
  createCoinbaseTransaction,
  BLOCK_REWARD,
} from '../core/block';
import { calculateMerkelRoot } from '../core/merkel';

describe('Консенсус, вибір ланцюга та повернення Orphaned транзакцій', () => {
  it('коректно обчислює кумулятивну роботу ланцюга на основі складності блоків (sum 2^difficulty)', () => {
    const node = new NodeServer(3001);
    const genesis = node.blockchain.chain[0];

    expect(node.getCumulativeWork(node.blockchain.chain)).toBe(
      Math.pow(2, genesis.header.difficulty)
    );

    const cb = createCoinbaseTransaction(new Wallet().address, BLOCK_REWARD, 0);
    const b1 = mineBlock(
      {
        header: {
          blockNumber: 1,
          timestamp: Date.now(),
          previousHash: genesis.hash,
          merkelRoot: calculateMerkelRoot([cb]),
          difficulty: 3,
          nonce: 0,
        },
        transactions: [cb],
        hash: '',
      },
      3
    );

    const chain = [...node.blockchain.chain, b1];
    expect(node.getCumulativeWork(chain)).toBe(Math.pow(2, 2) + Math.pow(2, 3));
  });

  it('при синхронізації з довшим/важчим ланцюгом перемагає ланцюг із більшою роботою, а втрачені транзакції повертаються в мемпул', async () => {
    const minerA = new Wallet();
    const minerB = new Wallet();
    const alice = new Wallet();
    const bob = new Wallet();

    const nodeA = new NodeServer(3001);
    const nodeB = new NodeServer(3002);

    const cb1 = createCoinbaseTransaction(alice.address, BLOCK_REWARD, 0);
    const b1 = mineBlock(
      {
        header: {
          blockNumber: 1,
          timestamp: 1000,
          previousHash: nodeA.blockchain.getLatestBlock().hash,
          merkelRoot: calculateMerkelRoot([cb1]),
          difficulty: 1,
          nonce: 0,
        },
        transactions: [cb1],
        hash: '',
      },
      1
    );
    nodeA.blockchain.addBlock(b1);
    nodeB.blockchain.addBlock(b1);

    const txAlice = alice.createTransaction(bob.address, 5, 1, 0);
    const cbA2 = createCoinbaseTransaction(minerA.address, BLOCK_REWARD, 1);
    const blockA2 = mineBlock(
      {
        header: {
          blockNumber: 2,
          timestamp: 2000,
          previousHash: b1.hash,
          merkelRoot: calculateMerkelRoot([cbA2, txAlice]),
          difficulty: 1,
          nonce: 0,
        },
        transactions: [cbA2, txAlice],
        hash: '',
      },
      1
    );
    nodeA.blockchain.addBlock(blockA2);

    const cbB2 = createCoinbaseTransaction(minerB.address, BLOCK_REWARD, 0);
    const blockB2 = mineBlock(
      {
        header: {
          blockNumber: 2,
          timestamp: 2100,
          previousHash: b1.hash,
          merkelRoot: calculateMerkelRoot([cbB2]),
          difficulty: 1,
          nonce: 0,
        },
        transactions: [cbB2],
        hash: '',
      },
      1
    );
    nodeB.blockchain.addBlock(blockB2);

    const cbB3 = createCoinbaseTransaction(minerB.address, BLOCK_REWARD, 0);
    const blockB3 = mineBlock(
      {
        header: {
          blockNumber: 3,
          timestamp: 2200,
          previousHash: blockB2.hash,
          merkelRoot: calculateMerkelRoot([cbB3]),
          difficulty: 1,
          nonce: 0,
        },
        transactions: [cbB3],
        hash: '',
      },
      1
    );
    nodeB.blockchain.addBlock(blockB3);

    const workA = nodeA.getCumulativeWork(nodeA.blockchain.chain);
    const workB = nodeB.getCumulativeWork(nodeB.blockchain.chain);
    expect(workB).toBeGreaterThan(workA);

    const peerChain = nodeB.blockchain.chain;
    const newTxSignatures = new Set(
      peerChain.flatMap((block) => block.transactions.map((tx) => tx.signature))
    );
    const orphanedTransactions = nodeA.blockchain.chain
      .flatMap((block) => block.transactions)
      .filter(
        (tx) => tx.sender !== 'system' && !newTxSignatures.has(tx.signature)
      );

    nodeA.blockchain.chain = peerChain;
    for (const tx of orphanedTransactions) {
      nodeA.mempool.addTransaction(
        tx,
        (addr: string) => nodeA.blockchain.getBalance(addr),
        (addr: string) => nodeA.blockchain.getNonce(addr)
      );
    }

    expect(nodeA.mempool.transactions).toHaveLength(1);
    expect(nodeA.mempool.transactions[0].signature).toBe(txAlice.signature);
    expect(nodeA.blockchain.chain).toHaveLength(4);
  });
});

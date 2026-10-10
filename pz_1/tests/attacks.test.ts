import { describe, it, expect, beforeEach } from 'vitest';
import { Blockchain } from '../core/blockchain';
import { Mempool } from '../core/mempool';
import { Wallet } from '../core/wallet';
import {
  type Block,
  mineBlock,
  createCoinbaseTransaction,
  BLOCK_REWARD,
} from '../core/block';
import { calculateMerkelRoot } from '../core/merkel';

describe('5 обовʼязкових атак на блокчейн', () => {
  let blockchain: Blockchain;
  let mempool: Mempool;
  let miner: Wallet;
  let alice: Wallet;
  let bob: Wallet;

  beforeEach(() => {
    blockchain = new Blockchain();
    mempool = new Mempool();
    miner = new Wallet();
    alice = new Wallet();
    bob = new Wallet();

    const cb1 = createCoinbaseTransaction(miner.address, BLOCK_REWARD, 0);
    const b1 = mineBlock(
      {
        header: {
          blockNumber: 1,
          timestamp: 1000,
          previousHash: blockchain.getLatestBlock().hash,
          merkelRoot: calculateMerkelRoot([cb1]),
          difficulty: blockchain.difficulty,
          nonce: 0,
        },
        transactions: [cb1],
        hash: '',
      },
      blockchain.difficulty
    );
    blockchain.addBlock(b1);

    const tx = miner.createTransaction(alice.address, 8, 2, 0);
    const cb2 = createCoinbaseTransaction(miner.address, BLOCK_REWARD, 2);
    const b2 = mineBlock(
      {
        header: {
          blockNumber: 2,
          timestamp: 2000,
          previousHash: blockchain.getLatestBlock().hash,
          merkelRoot: calculateMerkelRoot([cb2, tx]),
          difficulty: blockchain.difficulty,
          nonce: 0,
        },
        transactions: [cb2, tx],
        hash: '',
      },
      blockchain.difficulty
    );
    blockchain.addBlock(b2);

    const cb3 = createCoinbaseTransaction(miner.address, BLOCK_REWARD, 0);
    const b3 = mineBlock(
      {
        header: {
          blockNumber: 3,
          timestamp: 3000,
          previousHash: blockchain.getLatestBlock().hash,
          merkelRoot: calculateMerkelRoot([cb3]),
          difficulty: blockchain.difficulty,
          nonce: 0,
        },
        transactions: [cb3],
        hash: '',
      },
      blockchain.difficulty
    );
    blockchain.addBlock(b3);
  });

  it('Атака 1: Зміна суми в транзакції старого блоку — перевірка ланцюга виявляє підробку', () => {
    const corruptedChain = JSON.parse(
      JSON.stringify(blockchain.chain)
    ) as Block[];

    corruptedChain[2].transactions[1].amount = 100;

    expect(() => blockchain.isValidChain(corruptedChain)).toThrow();
  });

  it('Атака 2: Зміна даних із перерахунком хешу цього ж блоку — виявляється через розрив previousHash із наступним блоком', () => {
    const corruptedChain = JSON.parse(
      JSON.stringify(blockchain.chain)
    ) as Block[];

    corruptedChain[2].header.timestamp = 999999;
    const reminedBlock2 = mineBlock(corruptedChain[2], blockchain.difficulty);
    corruptedChain[2] = reminedBlock2;

    expect(() => blockchain.isValidChain(corruptedChain)).toThrow(
      /Invalid previousHash at block 3/
    );
  });

  it('Атака 3: Транзакція з підробленим підписом — відхиляється мемпулом і валідатором', () => {
    const tx = alice.createTransaction(bob.address, 5, 1, 0);

    const forgedTx = { ...tx, signature: 'ff'.repeat(64) };

    expect(() =>
      mempool.addTransaction(
        forgedTx,
        (addr: string) => blockchain.getBalance(addr),
        (addr: string) => blockchain.getNonce(addr)
      )
    ).toThrow('Invalid transaction signature or public key mismatch');
  });

  it('Атака 4: Подвійна витрата в мемпулі (дві транзакції, кожна на весь баланс) — друга транзакція відхиляється', () => {
    expect(blockchain.getBalance(alice.address)).toBe(8);

    const tx1 = alice.createTransaction(bob.address, 7, 1, 0);
    const tx2 = alice.createTransaction(miner.address, 7, 1, 1);

    mempool.addTransaction(
      tx1,
      (addr: string) => blockchain.getBalance(addr),
      (addr: string) => blockchain.getNonce(addr)
    );
    expect(mempool.transactions).toHaveLength(1);

    expect(() =>
      mempool.addTransaction(
        tx2,
        (addr: string) => blockchain.getBalance(addr),
        (addr: string) => blockchain.getNonce(addr)
      )
    ).toThrow(/Insufficient funds/);
  });

  it('Атака 5: Повторне надсилання вже підтвердженої транзакції (Replay Attack) — відхиляється через nonce', () => {
    const confirmedTx = blockchain.chain[2].transactions[1];
    expect(confirmedTx.nonce).toBe(0);

    expect(() =>
      mempool.addTransaction(
        confirmedTx,
        (addr: string) => blockchain.getBalance(addr),
        (addr: string) => blockchain.getNonce(addr)
      )
    ).toThrow('Invalid nonce');
  });
});

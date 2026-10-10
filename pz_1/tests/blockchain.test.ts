import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Blockchain } from '../core/blockchain';
import { Wallet } from '../core/wallet';
import {
  type Block,
  type BlockHeader,
  mineBlock,
  createCoinbaseTransaction,
  BLOCK_REWARD,
  calculateBlockHash,
} from '../core/block';
import { calculateMerkelRoot } from '../core/merkel';
import { unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Блокчейн (Blockchain), Proof-of-Work та валідація ланцюга', () => {
  let blockchain: Blockchain;
  let miner: Wallet;
  let alice: Wallet;
  let bob: Wallet;
  const tempChainPath = resolve(__dirname, 'test_chain.json');

  beforeEach(() => {
    blockchain = new Blockchain();
    miner = new Wallet();
    alice = new Wallet();
    bob = new Wallet();
  });

  afterEach(() => {
    if (existsSync(tempChainPath)) {
      unlinkSync(tempChainPath);
    }
  });

  it('успішно ініціалізує валідний генезис-блок', () => {
    expect(blockchain.chain).toHaveLength(1);
    const genesis = blockchain.chain[0];

    expect(genesis.header.blockNumber).toBe(0);
    expect(genesis.header.previousHash).toBe('0'.repeat(64));
    expect(genesis.transactions).toHaveLength(0);
    expect(blockchain.isValidChain(blockchain.chain)).toBe(true);
  });

  it('майнить блок, хеш якого задовольняє поточну складність (startsWith нулів)', () => {
    const previousBlock = blockchain.getLatestBlock();
    const coinbase = createCoinbaseTransaction(miner.address, BLOCK_REWARD, 0);

    const header: BlockHeader = {
      blockNumber: 1,
      timestamp: Date.now(),
      previousHash: previousBlock.hash,
      merkelRoot: calculateMerkelRoot([coinbase]),
      difficulty: 2,
      nonce: 0,
    };

    const block: Block = {
      header,
      transactions: [coinbase],
      hash: '',
    };

    const minedBlock = mineBlock(block, 2);

    expect(minedBlock.hash.startsWith('00')).toBe(true);
    expect(minedBlock.hash).toBe(calculateBlockHash(minedBlock.header));
    expect(minedBlock.header.nonce).toBeGreaterThanOrEqual(0);
  });

  it('додає намайнений блок та коректно нараховує баланс майнера з coinbase', () => {
    const previousBlock = blockchain.getLatestBlock();
    const coinbase = createCoinbaseTransaction(miner.address, BLOCK_REWARD, 0);

    const rawBlock: Block = {
      header: {
        blockNumber: 1,
        timestamp: Date.now(),
        previousHash: previousBlock.hash,
        merkelRoot: calculateMerkelRoot([coinbase]),
        difficulty: blockchain.difficulty,
        nonce: 0,
      },
      transactions: [coinbase],
      hash: '',
    };

    const mined = mineBlock(rawBlock, blockchain.difficulty);
    blockchain.addBlock(mined);

    expect(blockchain.chain).toHaveLength(2);
    expect(blockchain.getBalance(miner.address)).toBe(BLOCK_REWARD);
  });

  it('коректно враховує комісії транзакцій у винагороді майнера та переказує кошти', () => {
    const block1Coinbase = createCoinbaseTransaction(miner.address, BLOCK_REWARD, 0);
    const block1 = mineBlock(
      {
        header: {
          blockNumber: 1,
          timestamp: Date.now(),
          previousHash: blockchain.getLatestBlock().hash,
          merkelRoot: calculateMerkelRoot([block1Coinbase]),
          difficulty: blockchain.difficulty,
          nonce: 0,
        },
        transactions: [block1Coinbase],
        hash: '',
      },
      blockchain.difficulty
    );
    blockchain.addBlock(block1);

    const tx = miner.createTransaction(alice.address, 7, 3, 0);
    const miner2 = new Wallet();
    const block2Coinbase = createCoinbaseTransaction(miner2.address, BLOCK_REWARD, 3);

    const block2 = mineBlock(
      {
        header: {
          blockNumber: 2,
          timestamp: Date.now(),
          previousHash: blockchain.getLatestBlock().hash,
          merkelRoot: calculateMerkelRoot([block2Coinbase, tx]),
          difficulty: blockchain.difficulty,
          nonce: 0,
        },
        transactions: [block2Coinbase, tx],
        hash: '',
      },
      blockchain.difficulty
    );
    blockchain.addBlock(block2);

    expect(blockchain.getBalance(alice.address)).toBe(7);
    expect(blockchain.getBalance(miner.address)).toBe(BLOCK_REWARD - (7 + 3));
    expect(blockchain.getBalance(miner2.address)).toBe(BLOCK_REWARD + 3);
  });

  it('зберігає ланцюг блоків у файл і коректно відновлює його стан після перезапуску', () => {
    const coinbase = createCoinbaseTransaction(miner.address, BLOCK_REWARD, 0);
    const block1 = mineBlock(
      {
        header: {
          blockNumber: 1,
          timestamp: Date.now(),
          previousHash: blockchain.getLatestBlock().hash,
          merkelRoot: calculateMerkelRoot([coinbase]),
          difficulty: blockchain.difficulty,
          nonce: 0,
        },
        transactions: [coinbase],
        hash: '',
      },
      blockchain.difficulty
    );
    blockchain.addBlock(block1);

    blockchain.saveToFile(tempChainPath);
    expect(existsSync(tempChainPath)).toBe(true);

    const newBlockchain = new Blockchain();
    newBlockchain.loadFromFile(tempChainPath);

    expect(newBlockchain.chain).toHaveLength(2);
    expect(newBlockchain.getBalance(miner.address)).toBe(BLOCK_REWARD);
  });

  it('автоматично коригує складність (збільшує/зменшує), якщо час блоків відхиляється від очікуваного', () => {
    let prev = blockchain.getLatestBlock();
    const startTime = 1000000;

    for (let i = 1; i <= 10; i++) {
      const cb = createCoinbaseTransaction(miner.address, BLOCK_REWARD, 0);
      const b = mineBlock(
        {
          header: {
            blockNumber: i,
            timestamp: startTime + i * 1000,
            previousHash: prev.hash,
            merkelRoot: calculateMerkelRoot([cb]),
            difficulty: blockchain.difficulty,
            nonce: 0,
          },
          transactions: [cb],
          hash: '',
        },
        blockchain.difficulty
      );
      blockchain.chain.push(b);
      prev = b;
    }

    const newDifficulty = blockchain.getDifficulty();
    expect(newDifficulty).toBe(3);
  });
});

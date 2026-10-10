import { existsSync, readFileSync, writeFileSync } from 'fs';
import {
  type Block,
  type BlockHeader,
  BLOCK_REWARD,
  calculateBlockHash,
} from './block';
import { calculateMerkelRoot } from './merkel';
import { type Transaction, verifyTransaction } from './transaction';

export class Blockchain {
  chain: Block[];
  difficulty: number = 2;
  adjastmentInterval: number = 10;
  targetBlockTime: number = 5000;

  constructor() {
    this.chain = [this.generateGenesisBlock()];
  }

  generateGenesisBlock(): Block {
    const transactions: Transaction[] = [];
    const merkelRoot = calculateMerkelRoot(transactions);

    const header: BlockHeader = {
      blockNumber: 0,
      timestamp: 12121212,
      previousHash: '0'.repeat(64),
      merkelRoot: merkelRoot,
      difficulty: this.difficulty,
      nonce: 0,
    };

    const hash = calculateBlockHash(header);

    return {
      header,
      transactions,
      hash,
    };
  }

  getDifficulty() {
    const latestBlock = this.chain[this.chain.length - 1];

    if (
      latestBlock.header.blockNumber === 0 ||
      latestBlock.header.blockNumber % this.adjastmentInterval !== 0
    ) {
      return this.difficulty;
    }

    const prevAdjastmentBlock =
      this.chain[this.chain.length - this.adjastmentInterval];

    const expectedTime = this.adjastmentInterval * this.targetBlockTime;
    const actualTime =
      latestBlock.header.timestamp - prevAdjastmentBlock.header.timestamp;

    if (actualTime < expectedTime / 2) {
      this.difficulty += 1;
    }

    if (actualTime > expectedTime * 2) {
      this.difficulty = Math.max(1, this.difficulty - 1);
    }

    return this.difficulty;
  }

  getBalance(address: string) {
    let balance = 0;

    for (let i = 0; i < this.chain.length; i++) {
      const transactions = this.chain[i].transactions;

      for (let j = 0; j < transactions.length; j++) {
        if (transactions[j].sender === address) {
          balance -= transactions[j].amount + transactions[j].fee;
        }

        if (transactions[j].recipient === address) {
          balance += transactions[j].amount;
        }
      }
    }

    return balance;
  }

  getNonce(address: string) {
    let nonceCount = 0;

    for (let i = 0; i < this.chain.length; i++) {
      const transactions = this.chain[i].transactions;

      for (let j = 0; j < transactions.length; j++) {
        if (transactions[j].sender === address) {
          nonceCount++;
        }
      }
    }

    return nonceCount;
  }

  isValidChain(chain: Block[]) {
    const balances = new Map<string, number>();
    const nonces = new Map<string, number>();

    for (let i = 1; i < chain.length; i++) {
      const block = chain[i];
      const previousBlock = chain[i - 1];

      if (block.header.previousHash !== previousBlock.hash) {
        throw new Error(
          `Invalid previousHash at block ${block.header.blockNumber}`
        );
      }

      if (block.hash !== calculateBlockHash(block.header)) {
        throw new Error(
          `Corrupted block hash at block ${block.header.blockNumber}`
        );
      }

      if (!block.hash.startsWith('0'.repeat(block.header.difficulty))) {
        throw new Error(
          `Block hash does not satisfy difficulty requirement at block ${block.header.blockNumber}`
        );
      }

      if (block.header.merkelRoot !== calculateMerkelRoot(block.transactions)) {
        throw new Error(
          `Invalid Merkle root at block ${block.header.blockNumber}`
        );
      }

      const coinbaseTransaction = block.transactions[0];
      if (coinbaseTransaction.sender !== 'system') {
        throw new Error(
          `First transaction in block ${block.header.blockNumber} must be a coinbase reward`
        );
      }

      const totalFees = block.transactions.reduce((acc, tx) => acc + tx.fee, 0);
      const maxAllowedReward = BLOCK_REWARD + totalFees;

      if (coinbaseTransaction.amount > maxAllowedReward) {
        throw new Error(
          `Coinbase reward exceeded at block ${block.header.blockNumber}: got ${coinbaseTransaction.amount}, max allowed
  ${maxAllowedReward}`
        );
      }

      for (const transaction of block.transactions) {
        const { sender, recipient, amount, fee, nonce } = transaction;

        if (sender === 'system') {
          const current = balances.get(recipient) ?? 0;
          balances.set(recipient, current + amount);
          continue;
        }

        if (!verifyTransaction(transaction)) {
          throw new Error(
            `Invalid transaction signature in block ${block.header.blockNumber}`
          );
        }

        const senderBalance = balances.get(sender) ?? 0;
        const totalCost = amount + fee;

        if (senderBalance < totalCost) {
          throw new Error(
            `Insufficient funds for sender ${sender} at block ${block.header.blockNumber}: has ${senderBalance},
  needs ${totalCost}`
          );
        }

        const expectedNonce = nonces.get(sender) ?? 0;
        if (transaction.nonce !== expectedNonce) {
          throw new Error(
            `Invalid nonce for sender ${sender} at block ${block.header.blockNumber}: expected ${expectedNonce},
  got ${nonce}`
          );
        }

        balances.set(sender, senderBalance - totalCost);
        balances.set(recipient, (balances.get(recipient) ?? 0) + amount);
        nonces.set(sender, expectedNonce + 1);
      }
    }

    return true;
  }

  saveToFile(filePath: string) {
    const data = JSON.stringify(this.chain, null, 2);
    writeFileSync(filePath, data);
  }

  loadFromFile(filePath: string) {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const rawData = readFileSync(filePath, 'utf8');
    const loadedChain: Block[] = JSON.parse(rawData);

    this.isValidChain(loadedChain);
    this.chain = loadedChain;

    const latestBlock = this.chain[this.chain.length - 1];
    if (latestBlock) {
      this.difficulty = latestBlock.header.difficulty;
    }
  }

  getLatestBlock(): Block {
    return this.chain[this.chain.length - 1]!;
  }

  addBlock(block: Block): void {
    const newChain = [...this.chain, block];
    this.isValidChain(newChain);

    this.chain.push(block);
  }
}

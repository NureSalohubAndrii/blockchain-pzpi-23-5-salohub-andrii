import { describe, it, expect } from 'vitest';
import {
  calculateMerkelRoot,
  getTransactionHash,
  getMerkelProof,
  verifyMerkleProof,
} from '../core/merkel';
import { Wallet } from '../core/wallet';
import { sha256 } from '../core/crypto';

describe('Дерево Меркла (Merkle Tree)', () => {
  const alice = new Wallet();
  const bob = new Wallet();

  it('повертає sha256("") для порожнього списку транзакцій', () => {
    const root = calculateMerkelRoot([]);
    expect(root).toBe(sha256(''));
  });

  it('повертає хеш самої транзакції, якщо в блоці лише одна транзакція', () => {
    const tx = alice.createTransaction(bob.address, 10, 1, 0);
    const root = calculateMerkelRoot([tx]);
    expect(root).toBe(getTransactionHash(tx));
  });

  it('коректно обчислює корінь Меркла для парної кількості транзакцій (2 та 4)', () => {
    const tx1 = alice.createTransaction(bob.address, 10, 1, 0);
    const tx2 = bob.createTransaction(alice.address, 5, 1, 0);

    const h1 = getTransactionHash(tx1);
    const h2 = getTransactionHash(tx2);
    const expectedRoot2 = sha256(h1 + h2);

    expect(calculateMerkelRoot([tx1, tx2])).toBe(expectedRoot2);

    const tx3 = alice.createTransaction(bob.address, 20, 1, 1);
    const tx4 = bob.createTransaction(alice.address, 15, 1, 1);
    const h3 = getTransactionHash(tx3);
    const h4 = getTransactionHash(tx4);

    const parent1 = sha256(h1 + h2);
    const parent2 = sha256(h3 + h4);
    const expectedRoot4 = sha256(parent1 + parent2);

    expect(calculateMerkelRoot([tx1, tx2, tx3, tx4])).toBe(expectedRoot4);
  });

  it('коректно дублює останній хеш при непарній кількості транзакцій (3 транзакції)', () => {
    const tx1 = alice.createTransaction(bob.address, 10, 1, 0);
    const tx2 = bob.createTransaction(alice.address, 5, 1, 0);
    const tx3 = alice.createTransaction(bob.address, 20, 1, 1);

    const h1 = getTransactionHash(tx1);
    const h2 = getTransactionHash(tx2);
    const h3 = getTransactionHash(tx3);
    const parent1 = sha256(h1 + h2);
    const parent2 = sha256(h3 + h3);
    const expectedRoot = sha256(parent1 + parent2);

    expect(calculateMerkelRoot([tx1, tx2, tx3])).toBe(expectedRoot);
  });

  it('зміна хоча б одного байта в транзакції повністю змінює корінь Меркла', () => {
    const tx1 = alice.createTransaction(bob.address, 10, 1, 0);
    const tx2 = bob.createTransaction(alice.address, 5, 1, 0);

    const originalRoot = calculateMerkelRoot([tx1, tx2]);

    const modifiedTx1 = { ...tx1, amount: 11 };
    const modifiedRoot = calculateMerkelRoot([modifiedTx1, tx2]);

    expect(originalRoot).not.toBe(modifiedRoot);
  });

  it('успішно генерує та перевіряє доказ Меркла для парної та непарної кількості транзакцій', () => {
    const tx1 = alice.createTransaction(bob.address, 10, 1, 0);
    const tx2 = bob.createTransaction(alice.address, 20, 1, 1);
    const tx3 = alice.createTransaction(bob.address, 30, 1, 2);
    const tx4 = bob.createTransaction(alice.address, 40, 1, 3);
    const transactions = [tx1, tx2, tx3, tx4];

    const root4 = calculateMerkelRoot(transactions);
    const proof4 = getMerkelProof(transactions, 1);
    expect(verifyMerkleProof(tx2, proof4, root4)).toBe(true);

    const oddTransactions = [tx1, tx2, tx3];
    const root3 = calculateMerkelRoot(oddTransactions);
    const proof3 = getMerkelProof(oddTransactions, 2);
    expect(verifyMerkleProof(tx3, proof3, root3)).toBe(true);
  });

  it('відхиляє перевірку доказу, якщо в транзакції змінено дані', () => {
    const tx1 = alice.createTransaction(bob.address, 10, 1, 0);
    const tx2 = bob.createTransaction(alice.address, 20, 1, 1);
    const tx3 = alice.createTransaction(bob.address, 30, 1, 2);
    const transactions = [tx1, tx2, tx3];

    const root = calculateMerkelRoot(transactions);
    const proof = getMerkelProof(transactions, 1);

    const fakeTx = { ...tx2, amount: 999 };
    expect(verifyMerkleProof(fakeTx, proof, root)).toBe(false);
  });

  it('відхиляє перевірку доказу, якщо підроблено хеш у кроках доказу', () => {
    const tx1 = alice.createTransaction(bob.address, 10, 1, 0);
    const tx2 = bob.createTransaction(alice.address, 20, 1, 1);
    const transactions = [tx1, tx2];

    const root = calculateMerkelRoot(transactions);
    const proof = getMerkelProof(transactions, 0);

    proof[0].transactionHash = '0'.repeat(64);
    expect(verifyMerkleProof(tx1, proof, root)).toBe(false);
  });

  it('викидає помилку, якщо передано невалідний індекс транзакції', () => {
    const tx1 = alice.createTransaction(bob.address, 10, 1, 0);
    expect(() => getMerkelProof([tx1], -1)).toThrow();
    expect(() => getMerkelProof([tx1], 5)).toThrow();
  });
});

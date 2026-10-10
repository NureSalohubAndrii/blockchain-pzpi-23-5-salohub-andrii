import { describe, it, expect, beforeEach } from 'vitest';
import { Mempool } from '../core/mempool';
import { Wallet } from '../core/wallet';

describe('Мемпул (Mempool) та 4 перевірки валідації', () => {
  let mempool: Mempool;
  let sender: Wallet;
  let recipient: Wallet;

  beforeEach(() => {
    mempool = new Mempool();
    sender = new Wallet();
    recipient = new Wallet();
  });

  it('додає валідну транзакцію до черги мемпулу', () => {
    const tx = sender.createTransaction(recipient.address, 100, 5, 0);

    const getBalance = () => 500;
    const getNonce = () => 0;

    expect(() => mempool.addTransaction(tx, getBalance, getNonce)).not.toThrow();
    expect(mempool.transactions).toHaveLength(1);
    expect(mempool.transactions[0].signature).toBe(tx.signature);
  });

  it('відхиляє транзакцію з підробленим/недійсним підписом', () => {
    const tx = sender.createTransaction(recipient.address, 100, 5, 0);
    tx.signature = 'bad' + tx.signature.slice(3);

    const getBalance = () => 500;
    const getNonce = () => 0;

    expect(() => mempool.addTransaction(tx, getBalance, getNonce)).toThrow(
      'Invalid transaction signature or public key mismatch'
    );
    expect(mempool.transactions).toHaveLength(0);
  });

  it('відхиляє повторну транзакцію-дублікат, яка вже знаходиться в мемпулі', () => {
    const tx = sender.createTransaction(recipient.address, 50, 1, 0);

    const getBalance = () => 500;
    const getNonce = () => 0;

    mempool.addTransaction(tx, getBalance, getNonce);
    expect(mempool.transactions).toHaveLength(1);

    expect(() => mempool.addTransaction(tx, getBalance, getNonce)).toThrow(
      'Transaction already in mempool'
    );
  });

  it('відхиляє транзакцію, якщо балансу відправника недостатньо для суми та комісії', () => {
    const tx = sender.createTransaction(recipient.address, 100, 5, 0);

    const getBalance = () => 100;
    const getNonce = () => 0;

    expect(() => mempool.addTransaction(tx, getBalance, getNonce)).toThrow(
      /Insufficient funds/
    );
    expect(mempool.transactions).toHaveLength(0);
  });

  it('відхиляє другу транзакцію при подвійній витраті в мемпулі (сумарна вартість > баланс)', () => {
    const tx1 = sender.createTransaction(recipient.address, 60, 5, 0);
    const tx2 = sender.createTransaction(recipient.address, 60, 5, 1);

    const getBalance = () => 100;
    const getNonce = () => 0;

    mempool.addTransaction(tx1, getBalance, getNonce);
    expect(mempool.transactions).toHaveLength(1);

    expect(() => mempool.addTransaction(tx2, getBalance, getNonce)).toThrow(
      /Insufficient funds/
    );
    expect(mempool.transactions).toHaveLength(1);
  });

  it('відхиляє транзакцію з порушеною черговістю nonce (пропущений або застарілий)', () => {
    const tx = sender.createTransaction(recipient.address, 10, 1, 5);

    const getBalance = () => 1000;
    const getNonce = () => 0;

    expect(() => mempool.addTransaction(tx, getBalance, getNonce)).toThrow(
      'Invalid nonce'
    );
  });
});

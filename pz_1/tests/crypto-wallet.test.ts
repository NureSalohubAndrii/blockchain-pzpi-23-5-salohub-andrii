import { describe, it, expect } from 'vitest';
import { sha256, stringifyWithSort } from '../core/crypto';
import { Wallet } from '../core/wallet';
import { verifyTransaction } from '../core/transaction';

describe('Криптографія та Гаманець', () => {
  it('детерміновано серіалізує обʼєкти незалежно від порядку ключів', () => {
    const objA = { z: 1, a: 'test', m: [3, 2, 1] };
    const objB = { a: 'test', m: [3, 2, 1], z: 1 };

    expect(stringifyWithSort(objA)).toBe(stringifyWithSort(objB));
    expect(sha256(stringifyWithSort(objA))).toBe(sha256(stringifyWithSort(objB)));
  });

  it('створює пару ключів та адресу як SHA-256 хеш від публічного ключа', () => {
    const wallet = new Wallet();

    expect(wallet.publicKey).toBeDefined();
    expect(wallet.publicKey).toContain('PUBLIC KEY');
    expect(wallet.address).toBe(sha256(wallet.publicKey));
    expect(wallet.address).toHaveLength(64);
  });

  it('генерує валідну підписану транзакцію, яка успішно проходить верифікацію', () => {
    const sender = new Wallet();
    const recipient = new Wallet();

    const tx = sender.createTransaction(recipient.address, 50, 2, 0);

    expect(tx.sender).toBe(sender.address);
    expect(tx.recipient).toBe(recipient.address);
    expect(tx.amount).toBe(50);
    expect(tx.fee).toBe(2);
    expect(tx.nonce).toBe(0);
    expect(tx.signature).toBeDefined();
    expect(tx.signature.length).toBeGreaterThan(0);

    const isValid = verifyTransaction(tx);
    expect(isValid).toBe(true);
  });

  it('відхиляє транзакцію, якщо дані (сума чи отримувач) були змінені після підпису', () => {
    const sender = new Wallet();
    const recipient = new Wallet();
    const tx = sender.createTransaction(recipient.address, 100, 5, 0);

    const tamperedTx = { ...tx, amount: 999 };
    expect(verifyTransaction(tamperedTx)).toBe(false);

    const tamperedRecipientTx = { ...tx, recipient: sender.address };
    expect(verifyTransaction(tamperedRecipientTx)).toBe(false);
  });
});

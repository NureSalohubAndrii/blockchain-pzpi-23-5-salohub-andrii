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

function setupTestBlockchain() {
  const blockchain = new Blockchain();
  const mempool = new Mempool();
  const miner = new Wallet();
  const alice = new Wallet();
  const bob = new Wallet();
  const attacker = new Wallet();

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

  const tx1 = miner.createTransaction(alice.address, 8, 2, 0);
  const cb2 = createCoinbaseTransaction(miner.address, BLOCK_REWARD, 2);
  const b2 = mineBlock(
    {
      header: {
        blockNumber: 2,
        timestamp: 2000,
        previousHash: blockchain.getLatestBlock().hash,
        merkelRoot: calculateMerkelRoot([cb2, tx1]),
        difficulty: blockchain.difficulty,
        nonce: 0,
      },
      transactions: [cb2, tx1],
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

  return { blockchain, mempool, miner, alice, bob, attacker };
}

function runAttack1() {
  console.log('Атака 1: Зміна суми в транзакції старого блоку');
  const { blockchain } = setupTestBlockchain();

  console.log('Початковий стан:');
  console.log(
    `Блок #2 містить транзакцію на суму: ${blockchain.chain[2].transactions[1].amount}`
  );
  console.log(`Хеш блоку #2: ${blockchain.chain[2].hash.slice(0, 16)}...`);

  console.log('Зміна суми транзакції з 8 на 100 у блоці #2.');
  const corruptedChain = JSON.parse(
    JSON.stringify(blockchain.chain)
  ) as Block[];
  corruptedChain[2].transactions[1].amount = 100;

  try {
    blockchain.isValidChain(corruptedChain);
    console.log('Помилка: підроблений ланцюг пройшов перевірку.');
  } catch (error: any) {
    console.log('Результат: ланцюг відхилено.');
    console.log(`Повідомлення: ${error.message}`);
  }
}

function runAttack2() {
  console.log('\nАтака 2: Зміна даних із перерахунком хешу цього ж блоку');
  const { blockchain } = setupTestBlockchain();

  console.log('Початковий стан:');
  console.log(`Хеш блоку #2: ${blockchain.chain[2].hash.slice(0, 16)}...`);
  console.log(
    `previousHash у блоці #3: ${blockchain.chain[3].header.previousHash.slice(0, 16)}...`
  );

  console.log('Зміна timestamp блоку #2 та перерахунок PoW.');
  const corruptedChain = JSON.parse(
    JSON.stringify(blockchain.chain)
  ) as Block[];
  corruptedChain[2].header.timestamp = 999999;
  const reminedBlock2 = mineBlock(corruptedChain[2], blockchain.difficulty);
  corruptedChain[2] = reminedBlock2;

  console.log(`Новий хеш блоку #2: ${reminedBlock2.hash.slice(0, 16)}...`);
  console.log(
    `previousHash у блоці #3: ${corruptedChain[3].header.previousHash.slice(0, 16)}...`
  );

  console.log('Перевірка ланцюга:');
  try {
    blockchain.isValidChain(corruptedChain);
    console.log('Помилка: підроблений ланцюг пройшов перевірку.');
  } catch (error: any) {
    console.log('Результат: виявлено розрив звʼязку між блоками.');
    console.log(`Повідомлення: ${error.message}`);
  }
}

function runAttack3() {
  console.log('\nАтака 3: Транзакція з підробленим підписом');
  const { blockchain, mempool, alice, attacker } = setupTestBlockchain();

  console.log('Початковий стан:');
  console.log(`Баланс відправника: ${blockchain.getBalance(alice.address)}`);

  console.log('Спроба відправки:');
  console.log('Створення транзакції з невалідним підписом.');

  const forgedTx = {
    sender: alice.address,
    recipient: attacker.address,
    amount: 8,
    fee: 0,
    nonce: 0,
    publicKey: alice.publicKey,
    signature: 'adsfasdfas;dfjasd;fjas;fdkj',
  };

  try {
    mempool.addTransaction(
      forgedTx,
      (addr: string) => blockchain.getBalance(addr),
      (addr: string) => blockchain.getNonce(addr)
    );
    console.log('Помилка: транзакція додана до мемпулу.');
  } catch (error: any) {
    console.log('Результат: транзакцію відхилено мемпулом.');
    console.log(`Повідомлення: ${error.message}`);
  }
}

function runAttack4() {
  console.log('\nАтака 4: Подвійна витрата');
  const { blockchain, mempool, alice, bob, attacker } = setupTestBlockchain();

  console.log('Початковий стан:');
  console.log(`Баланс: ${blockchain.getBalance(alice.address)}`);

  console.log('Відправка першої транзакції:');
  const tx1 = alice.createTransaction(bob.address, 7, 1, 0);
  mempool.addTransaction(
    tx1,
    (addr: string) => blockchain.getBalance(addr),
    (addr: string) => blockchain.getNonce(addr)
  );
  console.log('Транзакція 1 додана до мемпулу.');

  console.log('Спроба відправки другої транзакції на ту саму суму:');
  const tx2 = alice.createTransaction(attacker.address, 7, 1, 1);

  try {
    mempool.addTransaction(
      tx2,
      (addr: string) => blockchain.getBalance(addr),
      (addr: string) => blockchain.getNonce(addr)
    );
    console.log('Помилка: транзакція додана до мемпулу.');
  } catch (error: any) {
    console.log(
      'Результат: транзакцію відхилено через недостатній баланс з урахуванням черги.'
    );
    console.log(`Повідомлення: ${error.message}`);
  }
}

function runAttack5() {
  console.log('\nАтака 5: Повторне надсилання підтвердженої транзакції');
  const { blockchain, mempool } = setupTestBlockchain();

  const confirmedTx = blockchain.chain[2].transactions[1];
  console.log('Початковий стан:');
  console.log(
    `Транзакція з nonce = ${confirmedTx.nonce} вже включена в блок #2.`
  );

  console.log('Спроба повторної відправки старої транзакції:');
  try {
    mempool.addTransaction(
      confirmedTx,
      (addr: string) => blockchain.getBalance(addr),
      (addr: string) => blockchain.getNonce(addr)
    );
    console.log('Помилка: транзакція додана повторно.');
  } catch (error: any) {
    console.log('Результат: транзакцію відхилено через невідповідність nonce.');
    console.log(`Повідомлення: ${error.message}`);
  }
}

const targetAttack = process.argv[2];

if (targetAttack) {
  const num = parseInt(targetAttack, 10);
  switch (num) {
    case 1:
      runAttack1();
      break;
    case 2:
      runAttack2();
      break;
    case 3:
      runAttack3();
      break;
    case 4:
      runAttack4();
      break;
    case 5:
      runAttack5();
      break;
    default:
      console.log(`Невідомий номер: ${targetAttack}. Доступні: 1, 2, 3, 4, 5`);
  }
} else {
  runAttack1();
  runAttack2();
  runAttack3();
  runAttack4();
  runAttack5();
}

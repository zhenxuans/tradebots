import WebSocket from 'ws';
import fetch from 'node-fetch';
import { subchannelAddressToString } from '@grpc/grpc-js/build/src/subchannel-address';

/*********************
 * 类型定义
 *********************/
interface TradeSignal {
  action: 'buy' | 'sell';
  mint: string;        // 代币合约地址
  amount: number;
  sellPercetage? : string      // 交易数量
  isSolAmount: boolean;// 是否以 SOL 为计价单位
  timestamp: number;   // 信号接收时间戳
  trader: string;      // 跟单交易钱包地址
}

interface TradeLog {
  signalTime: Date;    // 信号接收时间
  execTime?: Date;     // 执行完成时间
  durationMs?: number; // 执行耗时(毫秒)
  txHash?: string;     // 交易哈希
  error?: string;      // 错误信息
}

/*********************
 * 配置项
 *********************/
const CONFIG = {
  API_KEY: 'c91n2mtrdt436auq5dgncwbj85w5ehbn94r5eeb26grp8wuqehcnjc318x532p2p9t84cpaab4v42ka4d9p64uj75x3k0pkh6ta7apba8d2mpbv79n3p6ra9ed37evjrdt9n2kb3cwyku84qm2htr8t0pcbvfd1gmrgk3d89937jn38a5a6et9ba967gnj99t4q4mkp6t0kuf8',
  SMART_WALLETS: [    // 聪明钱包列表
    "ABUqmjGYiZd4mFxVa2ZV4zZUUbB7a7U7EvoPkw4YHvC6",
    "7iSG5y8f4DHtUEPLcgWQnJso99JRB51opyaRoH8qWZ8r",
    "HUpPyLU8KWisCAr3mzWy2FKT6uuxQ2qGgJQxyTpDoes5",
    "G1pRtSyKuWSjTqRDcazzKBDzqEF96i1xSURpiXj3yFcc",
    "8wfi8x1RfZzJBpMwQbWKLLsKDSrZvSnVkJfEKD6uvTpv",
    "EUM51CoFuxBw2FUVQ7YmrAy6a3p6PUNwou5S9f8qt83S",
    "Ay9wnuZCRTceZJuRpGZnuwYZuWdsviM4cMiCwFoSQiPH",
    "71CPXu3TvH3iUKaY1bNkAAow24k6tjH473SsKprQBABC",
    "Gf9XgdmvNHt8fUTFsWAccNbKeyDXsgJyZN8iFJKg5Pbd",
    "off5DDPLfBqcnHuQHssyDModwYkgwaVYp1JBb95CU18"	,
    "9HCTuTPEiQvkUtLmTZvK6uch4E3pDynwJTbNw6jLhp9z",
    "C8uCFAY8WPwvEudVuQUW62rDHVAjQyVNxcdw5eMZW287",
    "J485YzQjuJPLYoFEYjrjxd7NAoLHTiyUU63JwK7kLxRr",
    "4YzpSZpxDdjNf3unjkCtdWEsz2FL5mok7e5XQaDNqry8",
    "3SYQn32YG7XowiCzXKuXqnqBWtFvQDp3WeK36eE8rTEi",
    "C3nLTNMK6Ao1s3J1CQhv8GbT3NoMmifWoi9PGEcYd9hP",
    "EfbbhahGNuhqEraRZXrwETfsaKxScngEttdQixWAW4WE",
    "5ZMuSmd1V5irZtPa6CQG3L5gx22U9vYbkscPR1kJne5s",
    "C6173UhKXr1t2tRCnE8QwXRvpHPxYrD79k5v2YteCHX1",
    "FPTspEkKpoJZGccPWCfdt7Xyun7eZ61kZALMJVciSk1K",
    "27sfYMALabHSpjt4nDLAubw5mdDPnv3hkL8K7s2ZM1gU",
    "EtfUwhGtKwDjxdyKU7d83pePQjh4DtmfCLZtdxbQ1k3N",
    "AVAZvHLR2PcWpDf8BXY4rVxNHYRBytycHkcB5z5QNXYm",
    "8deJ9xeUvXSJwicYptA9mHsU2rN2pDx37KWzkDkEXhU6",
    "2CXbN6nuTTb4vCrtYM89SfQHMMKGPAW4mvFe6Ht4Yo6z",
    "DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm",
    "CNudZYFgpbT26fidsiNrWfHeGTBMMeVWqruZXsEkcUPc",
    "D6nUhQ7o3TQwk243mgVS5hsdkuJk71fxZib3KxY4Upyv",
    "dY9sUsh4kXocVTzw8F6UagFg6KPe5QizhuZTrDYSX1C" ,
    "AmManpABYP2yxskBmt31VSrALjCnTyaEdK8qeSVWLmjs",
    "QvPPwsV6ri3ydYLQRhnjWQt6US3qVEUhKss9J45uPFL" ,
    "4Be9CvxqHW6BYiRAxW9Q3xu1ycTMWaL5z8NX4HR3ha7t",
    "CRVidEDtEUTYZisCxBZkpELzhQc9eauMLR3FWg74tReL",
    "2ZiQY2u9bNxLF3fDhUFmZCz1n1baNnx2jtu1asPYpMhR",
    "AMTmcPLHDQ6NU8AVjVkGqN15HyNkTsnAPREGodLCMpVS",
    "DG6QpsjvwqCGyLAYXKEmDBLRfomJ2UAmoe4MJWL9fNtt",
    "5UATnGWCexXeiRhBHPjpgkRvDYEH9XvQtwGNDATxDCS8",
    "ARSdp5MFL1bjgWddK8dkF3QdttHvy5ZdVjJ6T8BHJimo",
    "DScqtGwFoDTme2Rzdjpdb2w7CtuKc6Z8KF7hMhbx8ugQ",
    "7cm7BtqSJHqy7QYJFh4cr7SybGR6q1zA7oXk6gdvWgTk",
    "C4wwvA1D479e5m6K19fjFrRaCPGzVykSm4pCHqsxgEuw",
    "5W7UZNQk6oCFbNdPowRJZpByErqzifQFVNVtN4uKb3cV",
    "DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj",
    "3h65MmPZksoKKyEpEjnWU2Yk2iYT5oZDNitGy5cTaxoE",
    "4DdrfiDHpmx55i4SPssxVzS9ZaKLb8qr45NKY9Er9nNh",
    "HYWo71Wk9PNDe5sBaRKazPnVyGnQDiwgXCFKvgAQ1ENp",
    "HpJ6bsNhW4ftV1E1KtSwvr9yQ55ZbHaxMVvgney6gpoY",
    "8yJFWmVTQq69p6VJxGwpzW7ii7c5J9GRAtHCNMMQPydj",
    "6LChaYRYtEYjLEHhzo4HdEmgNwu2aia8CM8VhR9wn6n7",
    "8zFZHuSRuDpuAR7J6FzwyF3vKNx4CVW3DFHJerQhc7Zd",
    "2WJvjGFjZePB3sYrHKMBQd46o1TCS8zxchEHnDK7oBxQ",
    "GQva3CGJNAiBxzPYjNaamHeyQ2shnCmPpwp2bbiRW9K" ,
    "ApRnQN2HkbCn7W2WWiT2FEKvuKJp9LugRyAE1a9Hdz1" ,
    "8iFVg3mMe9CaLcS8Gq3bSYEoZPJSN21DPdmuf38U9Q4Z",
    "DzeSE8ZBNk36qqswcDxd8919evdH5upwyZ4u1yieQSkp",
    "33MuTy5vo3GymDT6rhmA1trYH3ySWcgYa1HSVxD9Tko5",
    "86AEJExyjeNNgcp7GrAvCXTDicf5aGWgoERbXFiG1EdD",
    "EnQLCLB7NWojruXXNopgH7jhkwoHihTpuzsrtsM2UCSe",
    "qTB6ryTHBU1tGEVg9a1QiRJh5euRAU3bcDdWubUJ4ne" ,
    "3JbCsBJbRncrJbwmKYo5ww3uMuRgZ2LkS9LY7pZxu5v1",
    "DxjmHXm1p7cs8Tezdf2EJm5xnwp9QC2E8CbfD1aXeH1j",
    "H1RzgQhep7bxKgqiBTd2kdyPJQ5wbiGN7BqUMGFNqg2W",
    "1Mrfsd5xD9PyGWjCBJtcrBPkDirxUdqSTpmAouPUNfc" ,
    "5B52w1ZW9tuwUduueP5J7HXz5AcGfruGoX6YoAudvyxG",
    "2nKbwrpXKf7nBhvqrUprHoNBfg2jnoKaStd99h2w8QGc",
    "981G4w1e6zSiy6gBtYLGdFjF7rmFgAXXgA3mgKwPzwyS",
    "F5jWYuiDLTiaLYa54D88YbpXgEsA6NKHzWy4SN4bMYjt",
    "4LBhsqPTC2fHBST7MCmURRiU1zinWYQWe4G2GtP4wCSM",
    "HFLnuLwvBXxM4bGn24v6dQuhz6JVU3TKu8JsVLcGdxaV",
    "952nKaqEPaEiQrH4HqSnT5jki9Eh6bJvwvfwLk4LxuW6",
    "6fg77vTppRWZaQQaZhBqUtfu1PvRiCtWzoN8qF83fEbS",
    "CtKi39VFQRf2m8j8fkLzmJR6csxPVnWApLEGHmuAQWYb",
    "F7MJy5xhx6bFnaeK9eMLHzUmNKmf9rLsr7JUsV1wnEFj",
    "4aj4ey8kGzwoA1Ce1ADmLr5uUJYxAfuahohdNx9UL9qB",
    "CDUAza6NMFDUhjZEaAGHZA8y9AE9bEbm236K5AJhFHRv",
    "4625pi6asX1CpKmw1apw3mnGxxntS7F95ALqhWLgVoCr",
    "2aDBRNNdGEnCq2Av6Wz447CqgdEbmEaDudfGW1M85MAC",
    "CzJFuW2JAtCkNB4pBNvUJhg9wKwjq2dYx2yK36Wio1ta",
    "F7KSBM7SVVYUczJTCLpLJFPDEBrmrfi9ZiGru1BzAuwi",
    "3kebnKw7cPdSkLRfiMEALyZJGZ4wdiSRvmoN4rD1yPzV",
    "6vdXD7uu4zBXMjWecqMPWGsy5H7dSQXSYJS4gNqGbvTt",
    "4qyYcBA8tizD2MQCcHkXwrdFowZihKwdcFL6PExShVvL",
    "HPkQu4osTzt3reYjYX8CHufGCGgHesc7PqG6WdhcY4p9",
    "2btYi2pqVgtgzLqeAXE122FPhN2xBJMQpE1V9CMNv4EH",
    "DKAarFVePUBbQuTEj4g7hp2wJkorJo1HsMnAU5tTP7EE",
    "J2dEKMCV9vDtsAcnUgAED99n3QvQ48KUqNL6YYyiDYdC",
    "BSZ5Qn9DEZZhXvTGvaQhobgXCCZPJDSkgB9dZnAhgAPd",
    "BPeH6CSLdhMEW9UjoduYtwKHKcPZzYUeQVcWFoLYDkst",
    "GH4NtrMtTrxRDMbQacT6bgyWVwDkoujLnCYwUY9pa5Cu",
    "6zqYKgfANYEB5mmw7quiUCWbDg4tLJk2Gq5EbZ8ki6bE",
    "3BM6smanfeY3x7zfaSgSwQgcaTGvg8qyybJjJRy76ixA",
    "2m5498hY3hpSvm1pVyZwwyU6bpQGFGu3PADSoEoZFXQB",
    "AMxCLXZtnhd4Puf2kVa2cVWk8mjYk6xUwjfcP1eWxdCR",
    "EeZf8YxMisxMcyX9PHyGa9sdaQR3n3T1hFcMEeZPpPY8",
    "DXJYryY8bs7mJWhqvYMBqaMmjSLYZozHboyTA5AYi2an"

  ],
  TRADE_PARAMS: {     // 默认交易参数
    slippage: 10,       // 滑点百分比
    priorityFee: 0.00005,
    pool: 'auto' as const
  },
  RATIO: 0.001,         // 跟单资金比例 (0.5表示使用50%的可用资金)
  COOLDOWN: 1000      // 相同代币交易冷却时间(毫秒)
};

/*********************
 * 跟单机器人核心类
 *********************/
class CopyTradeBot {
  private ws: WebSocket;
  private tradeLogs: TradeLog[] = [];
  private cooldownMap = new Map<string, number>(); // 代币地址 => 最后交易时间

  constructor() {
    this.ws = new WebSocket('wss://pumpportal.fun/api/data');
    this.setupWebSocket();
  }

  /*********************
   * WebSocket 连接管理
   *********************/
  private setupWebSocket() {
    this.ws.on('open', () => {
      console.log('Connected to data feed');
      this.subscribeSmartWallets();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      const signal = this.parseTradeSignal(data);
      console.log(signal);
      if (signal != null) this.handleTradeSignal(signal);
    });

    this.ws.on('error', (err) => {
      console.error('WebSocket Error:', err);
      this.scheduleReconnect();
    });
  }

  /*********************
   * 订阅聪明钱包交易
   *********************/
  private subscribeSmartWallets() {
    CONFIG.SMART_WALLETS.forEach(address => {
      const payload = {
        method: "subscribeAccountTrade",
        keys: [address]
      };
      this.ws.send(JSON.stringify(payload));
    });
  }

  /*********************
   * 解析交易信号
   *********************/
  private parseTradeSignal(data: WebSocket.Data): TradeSignal | null {
    try {
      const raw = JSON.parse(data.toString());
      console.log("raw data is: " + data.toString());
      // 验证必要字段
      if (
        raw.mint === undefined || raw.mint === null ||
        Number.isNaN(raw.tokenAmount) || raw.tokenAmount === null ||
        Number.isNaN(raw.solAmount) || raw.solAmount === null ||
        raw.txType === undefined || raw.txType === null
      ) return null;

      if( raw.txType === 'buy' ) {
        return {
          action: raw.txType,
          mint: raw.mint,
          amount: raw.solAmount * CONFIG.RATIO, // 按比例调整跟单量
          isSolAmount: true,
          timestamp: Date.now(),
          trader: raw.traderPublicKey
        };
      } else if( raw.txType === 'sell') {
        return {
          action: raw.txType,
          mint: raw.mint,
          amount: -1, // 按比例调整跟单量
          sellPercetage: '100%',
          isSolAmount: true,
          timestamp: Date.now(),
          trader: raw.traderPublicKey
        };
      } else
        return null;
      
    } catch (err) {
      console.error('Parse signal error:', err);
      return null;
    }
  }

  /*********************
   * 处理交易信号
   *********************/
  private async handleTradeSignal(signal: TradeSignal) {
    // 冷却期检查，只检查买入操作
    if (this.isInCooldown(signal.mint) && signal.action === 'buy') {
      console.log(`Skipped ${signal.mint} due to cooldown`);
      return;
    }

    const log: TradeLog = {
      signalTime: new Date(signal.timestamp),
    };

    try {
      // 执行交易
      const startTime = Date.now();
      const txHash = await this.executeTrade(signal);
      const endTime = Date.now();

      // 记录结果
      log.execTime = new Date(endTime);
      log.durationMs = endTime - startTime;
      log.txHash = txHash;

      //只对买入操作更新冷却时间
      if(signal.action === 'buy')
        this.updateCooldown(signal.mint);
    } catch (err) {
      log.error = err instanceof Error ? err.message : String(err);
    }

    this.tradeLogs.push(log);
    this.printLog(log);
  }

  /*********************
   * 执行实际交易
   *********************/
  private async executeTrade(signal: TradeSignal): Promise<string> {
    const url = new URL('https://pumpportal.fun/api/trade');
    url.searchParams.set('api-key', CONFIG.API_KEY);
    
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...CONFIG.TRADE_PARAMS,
        action: signal.action,
        mint: signal.mint,
        amount: signal.amount != -1?signal.amount:signal.sellPercetage,
        denominatedInSol: signal.isSolAmount.toString()
      })
    });

    // console.log("### DEBUG trade body: " + JSON.stringify(body));

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return (data as { signature: string }).signature;; // 假设返回包含 txHash
  }

  /*********************
   * 冷却期管理
   *********************/
  private isInCooldown(mint: string): boolean {
    const lastTrade = this.cooldownMap.get(mint);
    return lastTrade ? Date.now() - lastTrade < CONFIG.COOLDOWN : false;
  }

  private updateCooldown(mint: string) {
    this.cooldownMap.set(mint, Date.now());
  }

  /*********************
   * 重连机制
   *********************/
  private scheduleReconnect() {
    setTimeout(() => {
      console.log('Attempting reconnect...');
      this.ws = new WebSocket('wss://pumpportal.fun/api/data');
      this.setupWebSocket();
    }, 5000);
  }

  /*********************
   * 日志记录
   *********************/
  private printLog(log: TradeLog) {
    const baseInfo = `[${log.signalTime.toISOString()}] Action: ${log.txHash ? 'Success' : 'Failed'}`;
    const timeInfo = log.durationMs ? `Took ${log.durationMs}ms` : '';
    const errorInfo = log.error ? ` | Error: ${log.error}` : '';
    
    console.log(`${baseInfo} ${timeInfo}${errorInfo}`);
  }
}

/*********************
 * 启动机器人
 *********************/
const bot = new CopyTradeBot();
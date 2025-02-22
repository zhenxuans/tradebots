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
    "suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK"
  ],
  TRADE_PARAMS: {     // 默认交易参数
    slippage: 10,       // 滑点百分比
    priorityFee: 0.0005,
    pool: 'auto' as const
  },
  RATIO: 0.001,         // 跟单资金比例 (0.5表示使用50%的可用资金)
  COOLDOWN: 120000      // 相同代币交易冷却时间(毫秒)
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
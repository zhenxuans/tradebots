import WebSocket from 'ws';
import fetch from 'node-fetch';
import { URL } from 'url';
import PQueue from 'p-queue';
import dotenv from 'dotenv';

// 初始化环境变量
dotenv.config();

/*********************
 * 类型定义
 *********************/
interface ApiResponse {
  signature: string;
}

interface TradeSignal {
  action: 'buy' | 'sell';
  mint: string;
  amount: number;
  sellPercentage?: string;
  isSolAmount: boolean;
  timestamp: number;
  trader: string;
}

interface TradeLog extends TradeSignal {
  signalTime: Date;
  execTime?: Date;
  durationMs?: number;
  txHash?: string;
  error?: string;
}

/*********************
 * 配置加载器
 *********************/
const loadConfig = () => {
  // 必需配置校验
  const requiredVars = ['API_KEY', 'SMART_WALLETS'];
  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      throw new Error(`Missing required environment variable: ${varName}`);
    }
  });

  return {
    API_KEY: process.env.API_KEY!,
    SMART_WALLETS: process.env.SMART_WALLETS!.split(','),
    WS_URL: process.env.WS_URL || 'wss://pumpportal.fun/api/data',
    TRADE_PARAMS: {
      slippage: parseFloat(process.env.SLIPPAGE || '10'),
      priorityFee: parseFloat(process.env.PRIORITY_FEE || '0.0001'),
      pool: process.env.POOL || 'auto' as const
    },
    RATIO: parseFloat(process.env.RATIO || '0.001'),
    SELL_PERCENTAGE: process.env.SELL_PERCENTAGE || '100%',
    COOLDOWN: parseInt(process.env.COOLDOWN || '120000'),
    MAX_RETRIES: parseInt(process.env.MAX_RETRIES || '3'),
    RETRY_DELAY: parseInt(process.env.RETRY_DELAY || '1000')
  };
};

const CONFIG = loadConfig();

/*********************
 * 跟单机器人核心类
 *********************/
class CopyTradeBot {
  private ws: WebSocket;
  private tradeLogs: TradeLog[] = [];
  private cooldownMap = new Map<string, number>();
  private queue = new PQueue({ concurrency: 1 });

  constructor() {
    this.ws = new WebSocket(CONFIG.WS_URL);
    this.setupWebSocket();
  }

  private setupWebSocket() {
    this.ws.on('open', () => {
      console.log('📡 Connected to data feed');
      this.subscribeSmartWallets();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      this.queue.add(async () => {
        const signal = this.parseTradeSignal(data);
        if (signal) await this.handleTradeSignal(signal);
      });
    });

    this.ws.on('error', (err) => {
      console.error('⚠️ WebSocket Error:', err);
      this.scheduleReconnect();
    });
  }

  private subscribeSmartWallets() {
    CONFIG.SMART_WALLETS.forEach(address => {
      const payload = {
        method: "subscribeAccountTrade",
        keys: [address.trim()]
      };
      this.ws.send(JSON.stringify(payload));
    });
  }

  private parseTradeSignal(data: WebSocket.Data): TradeSignal | null {
    try {
      const raw = JSON.parse(data.toString());
      
      // 增强字段校验
      if (!raw.mint || !raw.txType || !raw.traderPublicKey) return null;

      const baseSignal = {
        mint: raw.mint,
        timestamp: Date.now(),
        trader: raw.traderPublicKey,
        isSolAmount: raw.txType === 'buy'
      };

      if (raw.txType === 'buy' && typeof raw.solAmount === 'number') {
        return {
          ...baseSignal,
          action: 'buy',
          amount: raw.solAmount * CONFIG.RATIO,
        };
      }

      if (raw.txType === 'sell' && typeof raw.tokenAmount === 'number') {
        return {
          ...baseSignal,
          action: 'sell',
          amount: 0,
          sellPercentage: CONFIG.SELL_PERCENTAGE,
          isSolAmount: false
        };
      }

      return null;
    } catch (err) {
      console.error('❌ Parse signal error:', err);
      return null;
    }
  }

  private async handleTradeSignal(signal: TradeSignal) {
    const log: TradeLog = {
      ...signal,
      signalTime: new Date(signal.timestamp)
    };

    try {
      if (signal.action === 'buy' && this.isInCooldown(signal.mint)) {
        throw new Error(`⏳ Cooldown active for ${signal.mint}`);
      }

      const startTime = Date.now();
      const txHash = await this.executeTradeWithRetry(signal);
      const endTime = Date.now();

      Object.assign(log, {
        execTime: new Date(endTime),
        durationMs: endTime - startTime,
        txHash
      });

      if (signal.action === 'buy') {
        this.updateCooldown(signal.mint);
      }
    } catch (err) {
      log.error = err instanceof Error ? err.message : String(err);
    }

    this.tradeLogs.push(log);
    this.printLog(log);
  }

  private async executeTrade(signal: TradeSignal): Promise<string> {
    const url = new URL('https://pumpportal.fun/api/trade');
    url.searchParams.set('api-key', CONFIG.API_KEY);

    const body: any = {
      ...CONFIG.TRADE_PARAMS,
      action: signal.action,
      mint: signal.mint,
      denominatedInSol: signal.isSolAmount
    };

    if (signal.action === 'buy') {
      body.amount = signal.amount;
    } else {
      body.percentage = signal.sellPercentage;
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    console.log("### DEBUG trade body: " + body as string);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API ${response.status}: ${errorText.slice(0, 100)}`);
    }

    const data = await response.json() as ApiResponse;

    console.log("### DEBUG trade response: " + data.signature);

    return data.signature;
  }

  private async executeTradeWithRetry(signal: TradeSignal): Promise<string> {
    let retries = CONFIG.MAX_RETRIES;
    const backoffFactor = 1.5;
    
    while (retries > 0) {
      try {
        return await this.executeTrade(signal);
      } catch (err) {
        retries--;
        if (retries === 0) throw err;
        
        const delay = CONFIG.RETRY_DELAY * (backoffFactor ** (CONFIG.MAX_RETRIES - retries));
        await new Promise(r => setTimeout(r, delay));
      }
    }
    
    throw new Error('Exhausted all retry attempts');
  }

  private isInCooldown(mint: string): boolean {
    const lastTrade = this.cooldownMap.get(mint);
    return lastTrade ? Date.now() - lastTrade < CONFIG.COOLDOWN : false;
  }

  private updateCooldown(mint: string) {
    this.cooldownMap.set(mint, Date.now());
  }

  private scheduleReconnect() {
    setTimeout(() => {
      console.log('🔌 Attempting reconnect...');
      this.ws = new WebSocket(CONFIG.WS_URL);
      this.setupWebSocket();
    }, 5000);
  }

  private printLog(log: TradeLog) {
    const status = log.txHash ? '✅' : '❌';
    const action = log.action.toUpperCase().padEnd(4);
    const mint = `${log.mint.slice(0, 4)}...${log.mint.slice(-4)}`;
    const duration = log.durationMs ? `⏱️ ${log.durationMs}ms` : '';
    const txHash = log.txHash ? `📜 ${log.txHash.slice(0, 6)}...` : '';
    const error = log.error ? `💥 ${log.error}` : '';

    console.log(
      `${status} [${log.signalTime.toLocaleTimeString()}] ${action} ${mint}` +
      ` | ${[duration, txHash, error].filter(Boolean).join(' | ')}`
    );
  }
}

/*********************
 * 启动机器人
 *********************/
console.log('🚀 Starting CopyTrade Bot...');
new CopyTradeBot();
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
  isSolAmount: boolean;
  timestamp: number;
  trader: string;
}

interface PendingSell {
  mint: string;
  totalAmount: number;
  remaining: number;
  nextSellTime: number;
}

interface TradeLog {
  signalTime: Date;
  execTime?: Date;
  durationMs?: number;
  txHash?: string;
  error?: string;
  actionType?: 'buy' | 'sell';
  amount?: number;
  mint?: string;
}

/*********************
 * 策略配置
 *********************/
const loadConfig = () => ({
    // 基础配置
    API_KEY: process.env.API_KEY!,
    SMART_WALLETS: process.env.SMART_WALLETS!.split(','),
    WS_URL: process.env.WS_URL || 'wss://pumpportal.fun/api/data',
    
    // 买入策略
    BUY_RATIO: parseFloat(process.env.BUY_RATIO || '0.005'),
    
    // 卖出策略
    SELL_INTERVAL: parseInt(process.env.SELL_INTERVAL || '300000'),
    SELL_PERCENTAGE: parseFloat(process.env.SELL_PERCENTAGE_PER_SELL || '0.2'),
    INITIAL_DELAY: parseInt(process.env.INITIAL_DELAY || '120000'),
    SELL_CHECK_INTERVAL: parseInt(process.env.SELL_CHECK_INTERVAL || '30000'), // 新增检查间隔
    
    // 交易参数
    TRADE_PARAMS: {
      slippage: parseFloat(process.env.SLIPPAGE || '80'),
      priorityFee: parseFloat(process.env.PRIORITY_FEE || '0.0002'),
      pool: process.env.POOL || 'auto' as const
    },
    
    // 系统参数
    COOLDOWN: parseInt(process.env.COOLDOWN || '120000'),
    MAX_RETRIES: parseInt(process.env.MAX_RETRIES || '3'),
    RETRY_DELAY: parseInt(process.env.RETRY_DELAY || '1000')
  });

const CONFIG = loadConfig();

/*********************
 * 核心交易类
 *********************/
class TradeEngine {
  private pendingSells = new Map<string, PendingSell>();
  private queue = new PQueue({ concurrency: 1 });

  constructor(private readonly config: ReturnType<typeof loadConfig>) {
    // 使用配置的检查间隔
    setInterval(
        this.processPendingSells.bind(this),
        this.config.SELL_CHECK_INTERVAL
      );
  }

  /*********************
   * 买入策略执行
   *********************/
  async executeBuy(signal: TradeSignal): Promise<TradeLog> {
    const log: TradeLog = {
      signalTime: new Date(signal.timestamp),
      actionType: 'buy',
      mint: signal.mint
    };

    try {
      const startTime = Date.now();
      const txHash = await this.sendTradeRequest({
        action: 'buy',
        mint: signal.mint,
        amount: signal.amount,
        denominatedInSol: signal.isSolAmount.toString()
      });
      
      // 初始化卖出计划
      this.pendingSells.set(signal.mint, {
        mint: signal.mint,
        totalAmount: signal.amount,
        remaining: signal.amount,
        nextSellTime: Date.now() + this.config.INITIAL_DELAY
      });

      return this.createSuccessLog(log, startTime, txHash);
    } catch (err) {
      return this.createErrorLog(log, err);
    }
  }

  /*********************
   * 卖出策略执行
   *********************/
  private async executeScheduledSell(mint: string): Promise<TradeLog> {
    const log: TradeLog = {
      signalTime: new Date(),
      actionType: 'sell',
      mint: mint
    };

    try {
      const pending = this.pendingSells.get(mint)!;
      const sellAmount = pending.totalAmount * this.config.SELL_PERCENTAGE;
      
      const startTime = Date.now();
      const txHash = await this.sendTradeRequest({
        action: 'sell',
        mint: mint,
        amount: Math.min(sellAmount, pending.remaining),
        denominatedInSol: false
      });

      // 更新卖出状态
      const newRemaining = pending.remaining - sellAmount;
      if (newRemaining <= 0) {
        this.pendingSells.delete(mint);
      } else {
        this.pendingSells.set(mint, {
          ...pending,
          remaining: newRemaining,
          nextSellTime: Date.now() + this.config.SELL_INTERVAL
        });
      }

      return this.createSuccessLog(log, startTime, txHash);
    } catch (err) {
      return this.createErrorLog(log, err);
    }
  }

  /*********************
   * 交易请求统一处理
   *********************/
  private async sendTradeRequest(params: {
    action: 'buy' | 'sell';
    mint: string;
    amount: number;
    denominatedInSol: string;
  }) {
    const url = new URL('https://pumpportal.fun/api/trade');
    url.searchParams.set('api-key', this.config.API_KEY);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...this.config.TRADE_PARAMS,
        ...params
      })
    });

    console.log("### DEBUG trade body: " + JSON.stringify({
      ...this.config.TRADE_PARAMS,
      ...params
    }));


    if (!response.ok) {
      throw new Error(`API ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as ApiResponse;

    console.log("### DEBUG trade response: " + data.signature);

    return data.signature;
  }

  /*********************
   * 待处理卖出检查
   *********************/
  private async processPendingSells() {
    const now = Date.now();
    
    for (const [mint, pending] of this.pendingSells) {
      if (pending.nextSellTime <= now) {
        await this.queue.add(() => this.executeScheduledSell(mint));
      }
    }
  }

  /*********************
   * 日志辅助方法
   *********************/
  private createSuccessLog(log: TradeLog, startTime: number, txHash: string): TradeLog {
    const endTime = Date.now();
    return {
      ...log,
      execTime: new Date(endTime),
      durationMs: endTime - startTime,
      txHash: txHash
    };
  }

  private createErrorLog(log: TradeLog, error: unknown): TradeLog {
    return {
      ...log,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/*********************
 * 跟单机器人核心类
 *********************/
class CopyTradeBot {
  private ws: WebSocket;
  private tradeEngine: TradeEngine;
  private cooldownMap = new Map<string, number>();

  constructor() {
    this.tradeEngine = new TradeEngine(CONFIG);
    this.ws = new WebSocket(CONFIG.WS_URL);
    this.setupWebSocket();
  }

  private setupWebSocket() {
    this.ws.on('open', () => {
      console.log('📡 Connected to data feed');
      this.subscribeSmartWallets();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      const signal = this.parseTradeSignal(data);
      if (signal) this.handleTradeSignal(signal);
    });

    this.ws.on('error', (err) => {
      console.error('⚠️ WebSocket Error:', err);
      this.scheduleReconnect();
    });
  }

  private parseTradeSignal(data: WebSocket.Data): TradeSignal | null {
    try {
      const raw = JSON.parse(data.toString());

      console.log("### DEBUG raw data is: " + data.toString());

      if (!raw.mint || !raw.txType || !raw.traderPublicKey) return null;

      return {
        action: raw.txType,
        mint: raw.mint,
        amount: raw.solAmount * CONFIG.BUY_RATIO,
        isSolAmount: true,
        timestamp: Date.now(),
        trader: raw.traderPublicKey
      };
    } catch (err) {
      console.error('❌ Parse error:', err);
      return null;
    }
  }

  private async handleTradeSignal(signal: TradeSignal) {
    if (signal.action !== 'buy') return;
    if (this.isInCooldown(signal.mint)) {
      console.log(`⏳ Skipped ${signal.mint} (cooldown)`);
      return;
    }

    const log = await this.tradeEngine.executeBuy(signal);
    this.printLog(log);
    this.updateCooldown(signal.mint);
  }

  private isInCooldown(mint: string): boolean {
    const last = this.cooldownMap.get(mint);
    return last ? Date.now() - last < CONFIG.COOLDOWN : false;
  }

  private updateCooldown(mint: string) {
    this.cooldownMap.set(mint, Date.now());
  }

  private printLog(log: TradeLog) {
    const status = log.txHash ? '✅' : '❌';
    const action = log.actionType?.toUpperCase().padEnd(4) || '';
    const details = [
      log.mint?.slice(0, 6),
      log.durationMs && `${log.durationMs}ms`,
      log.txHash?.slice(0, 6),
      log.error
    ].filter(Boolean).join(' | ');
    
    console.log(`${status} [${log.signalTime.toLocaleTimeString()}] ${action} ${details}`);
  }

  private scheduleReconnect() {
    setTimeout(() => {
      console.log('🔌 Reconnecting...');
      this.ws = new WebSocket(CONFIG.WS_URL);
      this.setupWebSocket();
    }, 5000);
  }

  private subscribeSmartWallets() {
    CONFIG.SMART_WALLETS.forEach(address => {
      this.ws.send(JSON.stringify({
        method: "subscribeAccountTrade",
        keys: [address.trim()]
      }));
    });
  }
}

/*********************
 * 启动系统
 *********************/
console.log('🚀 Starting CopyTrade Bot...');
new CopyTradeBot();
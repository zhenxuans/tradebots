import axios from 'axios';
import pLimit from 'p-limit';

// 定义类型接口（解决第一个错误）
interface RpcNode {
  rpc: string;
  isBenchmark?: boolean;
}

interface BenchmarkResult {
  url: string;
  latency: number;
  status: 'success' | 'timeout' | 'error'; // 明确枚举类型
  error?: string;
}

// 基准节点测试方法（解决第二个类型错误）
async function testBenchmarkNodes(nodes: RpcNode[]): Promise<BenchmarkResult[]> {
  const concurrency = pLimit(5);
  
  const testPromises = nodes.map(node => 
    concurrency(async (): Promise<BenchmarkResult> => { // 显式声明返回类型
      const start = Date.now();
      try {
        const response = await axios.post(node.rpc, {
          jsonrpc: '2.0',
          id: 1,
          method: 'getVersion'
        }, {
          timeout: 5000,
          headers: { 'Content-Type': 'application/json' }
        });

        // 严格类型校验（文献3的类型守卫建议）
        const status: BenchmarkResult['status'] = response.data.result ? 
          'success' : 'error';

        return {
          url: node.rpc,
          latency: Date.now() - start,
          status,
          error: response.data.error?.message
        };
      } catch (error: unknown) { // 类型安全处理（文献5的错误处理规范）
        const status: BenchmarkResult['status'] = 
          axios.isAxiosError(error) && error.code === 'ECONNABORTED' ? 
          'timeout' : 'error';

        return {
          url: node.rpc,
          latency: Date.now() - start,
          status,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    })
  );

  return Promise.all(testPromises);
}

// 使用示例
const benchmarkNodes: RpcNode[] = [
  { rpc: 'https://rpc.shyft.to?api_key=frSyI3WVilww6J4Z', isBenchmark: true },
  { rpc: 'https://solana-rpc.publicnode.com', isBenchmark: true },
  { rpc: 'http://145.40.125.27:8899', isBenchmark: true },
  { rpc: 'https://mainnet.helius-rpc.com/?api-key=55b0924d-0595-4264-93b2-d150824dd953', isBenchmark: true }
];

testBenchmarkNodes(benchmarkNodes).then(results => {
  console.log('基准节点测试报告：');
  console.table(results.map(r => ({
    '节点地址': r.url.split('?')[0],
    '延迟(ms)': r.latency,
    '状态': r.status,
    '错误信息': r.error || '无'
  })));
});
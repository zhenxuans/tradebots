"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const p_limit_1 = __importDefault(require("p-limit"));
// 基准节点测试方法（解决第二个类型错误）
async function testBenchmarkNodes(nodes) {
    const concurrency = (0, p_limit_1.default)(5);
    const testPromises = nodes.map(node => concurrency(async () => {
        const start = Date.now();
        try {
            const response = await axios_1.default.post(node.rpc, {
                jsonrpc: '2.0',
                id: 1,
                method: 'getVersion'
            }, {
                timeout: 5000,
                headers: { 'Content-Type': 'application/json' }
            });
            // 严格类型校验（文献3的类型守卫建议）
            const status = response.data.result ?
                'success' : 'error';
            return {
                url: node.rpc,
                latency: Date.now() - start,
                status,
                error: response.data.error?.message
            };
        }
        catch (error) { // 类型安全处理（文献5的错误处理规范）
            const status = axios_1.default.isAxiosError(error) && error.code === 'ECONNABORTED' ?
                'timeout' : 'error';
            return {
                url: node.rpc,
                latency: Date.now() - start,
                status,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }));
    return Promise.all(testPromises);
}
// 使用示例
const benchmarkNodes = [
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

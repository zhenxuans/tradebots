"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const promises_1 = __importDefault(require("fs/promises"));
const p_limit_1 = __importDefault(require("p-limit"));
async function measureLatency(node) {
    const start = Date.now();
    try {
        // 处理带参数的 URL
        const [baseUrl, query] = node.rpc.split('?');
        const url = query ? `${baseUrl}?${query}` : baseUrl;
        await axios_1.default.post(url, {
            jsonrpc: '2.0',
            id: 1,
            method: 'getVersion',
        }, {
            timeout: 5000,
            headers: { 'Content-Type': 'application/json' }
        });
        return Date.now() - start;
    }
    catch {
        return Infinity;
    }
}
async function testRpcSpeed() {
    try {
        // 读取原有节点
        const data = await promises_1.default.readFile('rpc-nodes-final.json', 'utf8');
        const nodes = JSON.parse(data);
        // 添加基准节点
        const benchmarkNodes = [
            {
                rpc: 'https://rpc.shyft.to?api_key=frSyI3WVilww6J4Z',
                pubkey: 'benchmark_shyft',
                isBenchmark: true
            },
            {
                rpc: 'https://solana-rpc.publicnode.com',
                pubkey: 'benchmark_publicnode',
                isBenchmark: true
            }
        ];
        const allNodes = [...nodes, ...benchmarkNodes];
        // 并发测试配置
        const concurrencyLimit = (0, p_limit_1.default)(20);
        console.log(`Testing ${allNodes.length} nodes (包含 2 个基准节点)...`);
        // 执行测试
        const testPromises = allNodes.map(node => concurrencyLimit(async () => ({
            ...node,
            latency: await measureLatency(node)
        })));
        const results = await Promise.all(testPromises);
        // 过滤排序
        const validNodes = results.filter(n => n.latency !== Infinity);
        const sortedNodes = validNodes.sort((a, b) => a.latency - b.latency);
        // 取前 20 并标记基准节点状态
        const topNodes = sortedNodes.slice(0, 20).map(node => ({
            ...node,
            isBenchmark: node.isBenchmark || false
        }));
        // 保存结果
        await promises_1.default.writeFile('rpc-nodes-top20.json', JSON.stringify(topNodes, null, 2));
        // 打印基准节点结果
        const benchmarkResults = topNodes.filter(n => n.isBenchmark);
        console.log('基准节点排名:');
        benchmarkResults.forEach((node, index) => {
            console.log(`[${index + 1}] ${node.rpc} - ${node.latency}ms`);
        });
    }
    catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
}
testRpcSpeed();

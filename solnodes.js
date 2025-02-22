"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const promises_1 = __importDefault(require("fs/promises"));
const https_1 = __importDefault(require("https"));
const p_limit_1 = __importDefault(require("p-limit"));
// 步骤1: 获取集群节点数据并保存
async function fetchClusterNodes() {
    const url = 'http://api.mainnet-beta.solana.com';
    const payload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'getClusterNodes',
    };
    try {
        console.log('Fetching cluster nodes from Solana mainnet...');
        const response = await axios_1.default.post(url, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
        });
        if (response.data.error) {
            throw new Error(response.data.error.message);
        }
        await promises_1.default.writeFile('rpc-nodes.json', JSON.stringify(response.data.result, null, 2));
        console.log('Successfully saved', response.data.result.length, 'nodes to rpc-nodes.json');
    }
    catch (error) {
        if (error instanceof Error) {
            console.error('Error fetching cluster nodes:', error.message);
        }
        else {
            console.error('Error fetching cluster nodes:', 'Unknown error occurred');
        }
        throw error;
    }
}
// 步骤2: 过滤有效RPC节点
async function filterValidRpcNodes() {
    try {
        console.log('\nFiltering valid RPC nodes...');
        const data = await promises_1.default.readFile('rpc-nodes.json', 'utf8');
        const nodes = JSON.parse(data);
        const validNodes = nodes.filter((node) => node.rpc &&
            typeof node.rpc === 'string' &&
            node.rpc.trim().length > 0);
        await promises_1.default.writeFile('rpc-nodes-valid.json', JSON.stringify(validNodes, null, 2));
        console.log('Found', validNodes.length, 'valid RPC nodes. Saved to rpc-nodes-valid.json');
    }
    catch (error) {
        if (error instanceof Error) {
            console.error('Error filtering nodes:', error.message);
        }
        else {
            console.error('Error filtering nodes:', 'Unknown error occurred');
        }
        throw error;
    }
}
// 步骤3: 测试RPC节点可用性
async function testAndSaveWorkingNodes() {
    const concurrencyLimit = (0, p_limit_1.default)(10); // 控制并发数
    try {
        console.log('\nTesting RPC node availability...');
        const data = await promises_1.default.readFile('rpc-nodes-valid.json', 'utf8');
        const validNodes = JSON.parse(data);
        const testPromises = validNodes.map((node) => concurrencyLimit(async () => {
            try {
                const rpcUrl = normalizeUrl(node.rpc);
                await axios_1.default.post(rpcUrl, {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'getVersion',
                }, {
                    timeout: 5000,
                    httpsAgent: new https_1.default.Agent({ rejectUnauthorized: false }),
                });
                return { ...node, rpc: rpcUrl };
            }
            catch (error) {
                return null;
            }
        }));
        const results = await Promise.all(testPromises);
        const workingNodes = results.filter(node => node !== null);
        await promises_1.default.writeFile('rpc-nodes-final.json', JSON.stringify(workingNodes, null, 2));
        console.log('Found', workingNodes.length, 'working nodes. Saved to rpc-nodes-final.json');
    }
    catch (error) {
        if (error instanceof Error) {
            console.error('Error testing nodes:', error.message);
        }
        else {
            console.error('Error testing nodes:', 'Unknown error occurred');
        }
        throw error;
    }
}
// 辅助函数：标准化URL格式
function normalizeUrl(url) {
    if (/^https?:\/\//i.test(url))
        return url;
    return `http://${url}`;
}
// 主执行流程
async function main() {
    try {
        await fetchClusterNodes();
        await filterValidRpcNodes();
        await testAndSaveWorkingNodes();
        console.log('\nAll tasks completed successfully!');
    }
    catch (error) {
        console.error('\nScript execution failed:', error);
        process.exit(1);
    }
}
main();

import axios from 'axios';
import fs from 'fs/promises';
import https from 'https';
import pLimit from 'p-limit';

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
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });

    if (response.data.error) {
      throw new Error(response.data.error.message);
    }

    await fs.writeFile('rpc-nodes.json', JSON.stringify(response.data.result, null, 2));
    console.log('Successfully saved', response.data.result.length, 'nodes to rpc-nodes.json');
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error fetching cluster nodes:', error.message);
    } else {
      console.error('Error fetching cluster nodes:', 'Unknown error occurred');
    }
    throw error;
  }
}

// 步骤2: 过滤有效RPC节点
async function filterValidRpcNodes() {
  try {
    console.log('\nFiltering valid RPC nodes...');
    const data = await fs.readFile('rpc-nodes.json', 'utf8');
    const nodes = JSON.parse(data);

    const validNodes = nodes.filter((node: any) => 
      node.rpc && 
      typeof node.rpc === 'string' && 
      node.rpc.trim().length > 0
    );

    await fs.writeFile('rpc-nodes-valid.json', JSON.stringify(validNodes, null, 2));
    console.log('Found', validNodes.length, 'valid RPC nodes. Saved to rpc-nodes-valid.json');
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error filtering nodes:', error.message);
    } else {
      console.error('Error filtering nodes:', 'Unknown error occurred');
    }
    throw error;
  }
}

// 步骤3: 测试RPC节点可用性
async function testAndSaveWorkingNodes() {
  const concurrencyLimit = pLimit(10); // 控制并发数

  try {
    console.log('\nTesting RPC node availability...');
    const data = await fs.readFile('rpc-nodes-valid.json', 'utf8');
    const validNodes = JSON.parse(data);

    const testPromises = validNodes.map((node: any) => 
      concurrencyLimit(async () => {
        try {
          const rpcUrl = normalizeUrl(node.rpc);
          await axios.post(rpcUrl, {
            jsonrpc: '2.0',
            id: 1,
            method: 'getVersion',
          }, {
            timeout: 5000,
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          });
          return { ...node, rpc: rpcUrl };
        } catch (error) {
          return null;
        }
      })
    );

    const results = await Promise.all(testPromises);
    const workingNodes = results.filter(node => node !== null);

    await fs.writeFile('rpc-nodes-final.json', JSON.stringify(workingNodes, null, 2));
    console.log('Found', workingNodes.length, 'working nodes. Saved to rpc-nodes-final.json');
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error testing nodes:', error.message);
    } else {
      console.error('Error testing nodes:', 'Unknown error occurred');
    }
    throw error;
  }
}

// 辅助函数：标准化URL格式
function normalizeUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  return `http://${url}`;
}

// 主执行流程
async function main() {
  try {
    await fetchClusterNodes();
    await filterValidRpcNodes();
    await testAndSaveWorkingNodes();
    console.log('\nAll tasks completed successfully!');
  } catch (error) {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  }
}

main();
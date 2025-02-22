import { readFileSync, writeFileSync } from 'fs';

// 定义节点数据结构接口
interface RpcNode {
  featureSet: number;
  gossip: string;
  pubkey: string;
  pubsub: string | null;
  rpc: string | null;
  serveRepair: string;
  shredVersion: number;
  tpu: string;
  tpuForwards: string;
  tpuForwardsQuic: string;
  tpuQuic: string;
  tpuVote: string;
  tvu: string;
  version: string;
}

// 读取并解析JSON文件
const nodes: RpcNode[] = JSON.parse(
  readFileSync('rpc-nodes.json', 'utf8')
);

// 过滤TPU端口为10000的节点
const filteredNodes = nodes.filter(node => {
  // 添加空值检查和类型保护
  return node.tpu?.split(':')[1] === '10000'; // 使用可选链操作符
});

// 保存结果到新文件
writeFileSync('gRPCs.json', JSON.stringify(filteredNodes, null, 2));

console.log(`找到 ${filteredNodes.length} 个符合要求的节点，已保存到 gRPCs.json`);
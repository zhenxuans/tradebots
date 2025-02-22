"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
// 读取并解析JSON文件
const nodes = JSON.parse((0, fs_1.readFileSync)('rpc-nodes.json', 'utf8'));
// 过滤TPU端口为10000的节点
const filteredNodes = nodes.filter(node => {
    // 添加空值检查和类型保护
    return node.tpu?.split(':')[1] === '10000'; // 使用可选链操作符
});
// 保存结果到新文件
(0, fs_1.writeFileSync)('gRPCs.json', JSON.stringify(filteredNodes, null, 2));
console.log(`找到 ${filteredNodes.length} 个符合要求的节点，已保存到 gRPCs.json`);

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
;
const ws = new ws_1.default('wss://pumpportal.fun/api/data');
ws.on('open', () => {
    const payloads = [
        // { method: "subscribeNewToken" },
        {
            method: "subscribeAccountTrade",
            keys: ["DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj", "GQva3CGJNAiBxzPYjNaamHeyQ2shnCmPpwp2bbiRW9K"]
        },
        {
            method: "subscribeTokenTrade",
            keys: ["91WNez8D22NwBssQbkzjy4s2ipFrzpmn5hfvWVe2aY5p"]
        }
    ];
    payloads.forEach(payload => ws.send(JSON.stringify(payload)));
});
ws.on('message', (data) => {
    try {
        console.log('tx recv at : ' + formatDate());
        console.log(JSON.parse(data.toString())); // 类型安全转换
    }
    catch (err) {
        console.error('解析错误:', err);
    }
});
const formatDate = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    const miliSeconds = String(date.getMilliseconds());
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}:${miliSeconds}`;
};

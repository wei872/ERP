#!/usr/bin/env node
/** 扫描后端 Java 中 db.update/queryForList/queryForObject 调用，核对 ? 占位符数量与参数个数 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../backend/src/main/java', import.meta.url).pathname;
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.java')) files.push(p);
  }
})(root);

let issues = 0;
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  // 匹配 db.update("SQL" ... , args); 形式（单语句内联写法）
  const re = /db\.(update|queryForList|queryForObject)\(\s*"((?:[^"\\]|\\.)*)"\s*(?:,\s*([^;]*?))?\)\s*;/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const sql = m[2];
    // 统计 SQL 中 ? 数量（去掉单引号字符串内的 ?）
    let q = 0, inS = false;
    for (let i = 0; i < sql.length; i++) {
      const c = sql[i];
      if (c === "'") { inS = !inS; continue; }
      if (c === '?' && !inS) q++;
    }
    if (q === 0) continue;
    let argsStr = (m[3] || '').trim();
    // queryForObject/queryForList 的第二个参数是结果类型（.class），不是绑定参数
    if (m[1] !== 'update' && /^\S+\.class\b/.test(argsStr)) {
      argsStr = argsStr.replace(/^\S+\.class\s*(,\s*)?/, '');
    }
    // 参数个数：顶层逗号计数
    let argc = 0;
    if (argsStr) {
      // 单个数组/列表参数（params.toArray() / Object[] 变量）无法静态计数 → 跳过
      if (/^\S+(\.toArray\(\))?$/.test(argsStr) && !argsStr.includes('"')) { continue; }
      argc = 1; let depth = 0, inStr = false;
      for (let i = 0; i < argsStr.length; i++) {
        const c = argsStr[i];
        if (inStr) { if (c === '"') inStr = false; continue; }
        if (c === '"') inStr = true;
        else if (c === '(' ) depth++;
        else if (c === ')') depth--;
        else if (c === ',' && depth === 0) argc++;
      }
    }
    if (q !== argc) {
      issues++;
      console.log(`⚠️  ${file.split('/java/')[1]}: SQL含 ${q} 个? 但传了 ${argc} 个参数`);
      console.log(`    SQL: ${sql.slice(0, 110)}${sql.length > 110 ? '…' : ''}`);
      console.log(`    ARG: ${argsStr.slice(0, 110)}`);
    }
  }
}
console.log(issues === 0 ? '✅ 全部 SQL 占位符与参数数量匹配' : `❌ 发现 ${issues} 处不匹配`);
process.exit(issues === 0 ? 0 : 1);

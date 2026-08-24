#!/usr/bin/env node
/** 校验 demo_data.sql：语句可被后端 DemoDataRunner 按 ';' 安全分割，且每条 INSERT 列数=值数 */
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('../backend/src/main/resources/demo-data/demo_data.sql', import.meta.url), 'utf8');

// 按顶层 ';' 分割语句（感知字符串与括号）
const stmts = [];
let cur = '', inStr = false, depth = 0;
for (let i = 0; i < sql.length; i++) {
  const ch = sql[i];
  if (inStr) {
    cur += ch;
    if (ch === "'") {
      if (sql[i + 1] === "'") { cur += "'"; i++; } else inStr = false;
    }
    continue;
  }
  if (ch === "'") { inStr = true; cur += ch; continue; }
  if (ch === '(') depth++;
  if (ch === ')') depth--;
  if (ch === ';' && depth === 0) { stmts.push(cur.trim()); cur = ''; continue; }
  cur += ch;
}
const tail = cur.split('\n').filter(l => l.trim() && !l.trim().startsWith('--')).join('\n').trim();
if (tail) { console.error('❌ 文件末尾存在未以分号结束的语句: ' + tail.slice(0, 80)); process.exit(1); }
if (inStr) { console.error('❌ 存在未闭合的字符串'); process.exit(1); }

let errors = 0, checked = 0;
for (const [idx, s] of stmts.entries()) {
  if (!s) continue;
  if (/^(SET NAMES|USE|--)/.test(s)) continue;
  const m = s.match(/^INSERT IGNORE INTO (\S+) \(([^)]*)\) VALUES([\s\S]*)$/);
  if (!m) { console.error(`❌ 语句#${idx} 不是受支持的 INSERT 形式: ${s.slice(0, 80)}`); errors++; continue; }
  const table = m[1], cols = m[2].split(',').map(x => x.trim()).filter(Boolean);
  // 解析 VALUES 后的顶层元组
  const body = m[3];
  const tuples = [];
  let i = 0;
  while (i < body.length) {
    if (body[i] === '(') {
      let d = 0, start = i, inS = false;
      for (; i < body.length; i++) {
        const c = body[i];
        if (inS) { if (c === "'") { if (body[i + 1] === "'") i++; else inS = false; } continue; }
        if (c === "'") inS = true;
        else if (c === '(') d++;
        else if (c === ')') { d--; if (d === 0) { i++; break; } }
      }
      tuples.push(body.slice(start + 1, i - 1));
    } else i++;
  }
  for (const [ti, t] of tuples.entries()) {
    // 统计元组内顶层逗号数
    let cnt = 1, d = 0, inS = false;
    for (let j = 0; j < t.length; j++) {
      const c = t[j];
      if (inS) { if (c === "'") { if (t[j + 1] === "'") j++; else inS = false; } continue; }
      if (c === "'") inS = true;
      else if (c === '(') d++;
      else if (c === ')') d--;
      else if (c === ',' && d === 0) cnt++;
    }
    checked++;
    if (cnt !== cols.length) { console.error(`❌ ${table} 元组#${ti}: 值数=${cnt} ≠ 列数=${cols.length}`); errors++; if (errors > 10) process.exit(1); }
  }
}
console.log(`✅ 校验通过：${stmts.length} 条语句，${checked} 个值元组，列数全部匹配`);

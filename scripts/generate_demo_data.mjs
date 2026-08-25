#!/usr/bin/env node
/**
 * ERP 演示数据生成器
 * 生成 database 级别的自洽业务数据集（9 个月跨度），输出到
 *   backend/src/main/resources/demo-data/demo_data.sql
 *
 * 自洽性保证（生成时全部计算好，落库即为真源）：
 *  - 销售明细金额之和 = 销售主表 total_amount；采购同理
 *  - 库存结存 = 期初0 + 全部入库 - 全部出库（加权平均成本）
 *  - 应收/应付 = 对应销售/采购金额；核销额 <= 总额
 *  - 每张凭证借贷平衡；科目余额按期间滚存（与后端 FinanceService 公式一致）
 *  - 已结账月份损益清零并结转 4104 本年利润 → 资产负债表平衡
 *  - 日期全部相对 CURDATE()，任何时候加载都呈现"最近9个月"的鲜活数据
 *
 * 用法：node scripts/generate_demo_data.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── 确定性随机（保证每次生成完全一致） ──
let seed = 20260824 >>> 0;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const money = x => (Math.round(x * 100) / 100).toFixed(2);
const q4 = x => (Math.round(x * 10000) / 10000).toString();

// ── SQL 日期表达式：一切相对 CURDATE()，数据永远新鲜 ──
const dAgo = n => (n <= 0 ? 'CURDATE()' : `DATE_SUB(CURDATE(), INTERVAL ${n} DAY)`);
const periodOfDaysAgo = n => `DATE_FORMAT(${dAgo(n)}, '%Y-%m')`;
// m 个月前的月份标签（用于按月聚合）
const periodOfMonth = m => (m === 0 ? "DATE_FORMAT(CURDATE(), '%Y-%m')" : `DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL ${m} MONTH), '%Y-%m')`);
const monthFirstDay = m => (m === 0 ? "DATE_FORMAT(CURDATE(), '%Y-%m-01')" : `DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL ${m} MONTH), '%Y-%m-01')`);
const nextMonthFirstDay = m => `DATE_ADD(${monthFirstDay(m)}, INTERVAL 1 MONTH)`;

const q = s => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;

const out = [];
const emit = s => out.push(s);
const insert = (table, cols, rows) => {
  if (!rows.length) return;
  emit(`INSERT IGNORE INTO ${table} (${cols.join(',')}) VALUES`);
  emit(rows.map(r => `(${r.join(',')})`).join(',\n') + ';');
};

// ══════════════════════ 基础资料 ══════════════════════
const customers = [
  ['C-001', '华东智能制造有限公司', '制造业', '华东', '王建国', '13901234567', 'wangjg@hdzn.example.com', '上海市松江区茸江路88号', 500000, '战略客户'],
  ['C-002', '南方物联科技公司', '物联网', '华南', '李晓明', '13812345678', 'lixm@nfwl.example.com', '深圳市南山区科技园南区12栋', 300000, '重要客户'],
  ['C-003', '西部重工集团', '重工', '西南', '张卫东', '13723456789', 'zhangwd@xbzg.example.com', '成都市双流区工业大道66号', 400000, '重要客户'],
  ['C-004', '北方自动化设备公司', '自动化', '华北', '刘芳', '13634567890', 'liufang@bfzd.example.com', '天津市滨海新区泰达大街100号', 150000, '普通客户'],
  ['C-005', '深港电子科技公司', '电子', '华南', '陈志强', '13545678901', 'chenzq@sgdz.example.com', '东莞市长安镇电子产业园3号', 200000, '普通客户'],
  ['C-006', '长江智慧能源公司', '能源', '华中', '赵敏', '13456789012', 'zhaomin@cjzh.example.com', '武汉市东湖高新区光谷大道77号', 350000, '重要客户'],
  ['C-007', '沿海港口设备公司', '物流设备', '华东', '孙涛', '13367890123', 'suntao@yhpk.example.com', '宁波市北仑区港口大道9号', 120000, '普通客户'],
  ['C-008', '中原农机股份公司', '农机', '华中', '周丽华', '13278901234', 'zhoulh@zynj.example.com', '郑州市经开区第九大街168号', 100000, '普通客户'],
];
const suppliers = [
  ['S-001', '深圳芯联电子公司', '芯片模组', '李强', '13601111222', 'liqiang@szxl.example.com', '深圳市福田区华强北路1号'],
  ['S-002', '东莞精工五金制品厂', '五金结构件', '黄伟', '13702222333', 'huangw@dgjg.example.com', '东莞市塘厦镇工业区5路'],
  ['S-003', '苏州光电科技公司', '显示与传感', '吴娟', '13803333444', 'wujuan@szgd.example.com', '苏州市工业园区星湖街218号'],
  ['S-004', '广州电源设备公司', '电源器件', '郑军', '13904444555', 'zhengj@gzdy.example.com', '广州市黄埔区科学大道50号'],
  ['S-005', '佛山包装材料厂', '包装辅料', '冯丽', '13505555666', 'fengl@fsbz.example.com', '佛山市南海区狮山镇工业路6号'],
  ['S-006', '杭州测控技术公司', '传感元件', '蒋超', '13606666777', 'jiangc@hzck.example.com', '杭州市滨江区物联网街88号'],
];
// code,name,cat,spec,unit,buy,sell —— 行业编码规则（电子智造）：分类前缀+流水号
const goods = [
  ['FG-001', '智能工业网关', '成品', 'GW-200/4G全网通', '台', 0, 1280],
  ['FG-002', '工业温湿度传感器', '成品', 'IS-500/RS485', '只', 0, 460],
  ['FG-003', '边缘计算控制主板', '成品', 'CB-8X/8核', '块', 0, 2350],
  ['IC-0001', '主控芯片STM32F4', '原材料', 'LQFP-100', '片', 45, 68],
  ['MOD-0001', '4G通信模组', '原材料', 'CAT-1全网通', '个', 120, 168],
  ['PCB-0001', 'PCB四层主板', '原材料', '200x120mm', '块', 65, 92],
  ['PWR-0001', '工业电源模块', '原材料', '24V/2A', '个', 38, 55],
  ['ENC-0001', '铝合金外壳', '原材料', '阳极氧化', '件', 52, 75],
  ['DSP-0001', '3.5寸触控显示屏', '原材料', '800x480', '块', 85, 120],
  ['CON-0001', '接线端子组件', '原材料', '5.08mm间距', '套', 6, 10],
  ['PKG-0001', '防震包装箱', '辅料', '五层瓦楞定制', '个', 4, 7],
  ['FST-0001', '不锈钢螺丝包', '辅料', 'M3x8全套', '包', 2, 4],
  ['SEN-0001', '高精度温度探头', '原材料', 'PT100/A级', '支', 55, 80],
  ['SEN-0002', '湿度感应元件', '原材料', '电容式', '支', 32, 48],
  ['ISO-0001', '信号隔离器', '元器件', '4-20mA', '个', 28, 42],
];
const gmap = Object.fromEntries(goods.map(g => [g[0], g]));
const bom = {
  'FG-001': [['IC-0001', 1], ['MOD-0001', 1], ['PCB-0001', 1], ['PWR-0001', 1], ['ENC-0001', 1], ['CON-0001', 4], ['PKG-0001', 1], ['FST-0001', 2]],
  'FG-002': [['IC-0001', 1], ['PCB-0001', 1], ['PWR-0001', 1], ['ENC-0001', 1], ['SEN-0001', 2], ['SEN-0002', 1], ['PKG-0001', 1], ['FST-0001', 1]],
  'FG-003': [['IC-0001', 2], ['PCB-0001', 2], ['PWR-0001', 2], ['DSP-0001', 1], ['CON-0001', 6], ['ISO-0001', 2], ['FST-0001', 2]],
};
const fgCost = {};
for (const [fg, lines] of Object.entries(bom)) {
  const mat = lines.reduce((s, [c, qy]) => s + gmap[c][5] * qy, 0);
  fgCost[fg] = Math.round((mat + 40) * 100) / 100; // 材料 + 人工制费40/台
}
const matSupplier = { 'IC-0001': 0, 'MOD-0001': 0, 'PCB-0001': 2, 'DSP-0001': 2, 'SEN-0001': 5, 'SEN-0002': 5, 'ISO-0001': 5, 'PWR-0001': 3, 'ENC-0001': 1, 'CON-0001': 1, 'FST-0001': 1, 'PKG-0001': 4 };
const salesPersons = ['张三', '周八', '王小明'];
const workshops = ['一号车间', '二号车间'];

// ══════════════════════ 业务单据生成（按月推进） ══════════════════════
const sales = [];      // {no, custIdx, date(m,day), lines:[{code,qty,price}], status, ship, person}
const purchases = [];  // {no, suppIdx, date, lines:[{code,qty,price}], status, arrival, buyer}
const workOrders = []; // {no, fg, qty, m, status, actual}
const requisitions = []; // {no, wo, lines:[{code,plan,actual}], m}
const warehouseIns = []; // {no, wo, fg, qty, m}
const receipts = [];   // {saleNo, amount, m}
const payments = [];   // {poNo, amount, m}

let soSeq = 0, poSeq = 0, woSeq = 0, reqSeq = 0, pwiSeq = 0;
const pad = (n, w) => String(n).padStart(w, '0');

for (let m = 8; m >= 0; m--) {
  // ── 销售单：近期增长趋势 ──
  const nSales = 4 + Math.floor((8 - m) / 2) + ri(0, 2);
  for (let i = 0; i < nSales; i++) {
    const custIdx = pick([0, 0, 1, 1, 2, 3, 4, 5, 5, 6, 7]);
    const fgs = Object.keys(bom);
    const nLines = ri(1, 3);
    const chosen = [];
    while (chosen.length < nLines) { const f = pick(fgs); if (!chosen.includes(f)) chosen.push(f); }
    const lines = chosen.map(code => {
      const qty = code === 'FG-003' ? ri(2, 6) : code === 'FG-001' ? ri(3, 12) : ri(5, 25);
      return { code, qty, price: gmap[code][6] };
    });
    const day = m === 0 ? ri(0, 4) : ri(2, 26);
    let status, ship;
    if (m >= 2) { status = '已完成'; ship = '已出库'; }
    else if (m === 1) { const r = rnd(); if (r < 0.7) { status = '已完成'; ship = '已出库'; } else { status = '已审核'; ship = '未发货'; } }
    else { const r = rnd(); if (r < 0.35) { status = '已完成'; ship = '已出库'; } else if (r < 0.7) { status = '已审核'; ship = '未发货'; } else { status = '待审核'; ship = '未发货'; } }
    sales.push({ no: `SO-${pad(++soSeq, 4)}`, custIdx, m, day, lines, status, ship, person: pick(salesPersons) });
  }
  // ── 采购单 ──
  const nPo = 3 + ri(0, 2);
  for (let i = 0; i < nPo; i++) {
    const mats = Object.keys(matSupplier);
    const nLines = ri(1, 3);
    const chosen = [];
    while (chosen.length < nLines) { const c = pick(mats); if (!chosen.includes(c)) chosen.push(c); }
    const suppIdx = matSupplier[chosen[0]];
    const lines = chosen.map(code => ({ code, qty: ri(60, 240), price: gmap[code][5] }));
    const day = m === 0 ? ri(0, 4) : ri(1, 24);
    let status, arrival;
    if (m >= 2) { status = '已入库'; arrival = '全部到货'; }
    else if (m === 1) { const r = rnd(); if (r < 0.6) { status = '已入库'; arrival = '全部到货'; } else { status = '已审批'; arrival = '未到货'; } }
    else { if (i === 0) { status = '已入库'; arrival = '全部到货'; } else { status = rnd() < 0.5 ? '已审批' : '待审批'; arrival = '未到货'; } }
    purchases.push({ no: `PO-${pad(++poSeq, 4)}`, suppIdx, m, day, lines, status, arrival, buyer: '周八' });
  }
  // ── 生产工单（当月为进行中） ──
  const nWo = m === 0 ? 1 : ri(1, 2);
  for (let i = 0; i < nWo; i++) {
    const fg = pick(Object.keys(bom));
    const qty = ri(40, 70);
    const done = m >= 1;
    workOrders.push({ no: `WO-${pad(++woSeq, 4)}`, fg, qty, m, day: m === 0 ? ri(0, 3) : ri(1, 20), status: done ? '已完成' : '进行中', actual: done ? qty : Math.round(qty * 0.4) });
    const reqNo = `REQ-${pad(++reqSeq, 4)}`;
    requisitions.push({ no: reqNo, wo: `WO-${pad(woSeq, 4)}`, fg, m, lines: bom[fg].map(([c, per]) => ({ code: c, plan: Math.round(per * qty * 100) / 100, actual: done ? Math.round(per * qty * 100) / 100 : 0 })) });
    if (done) warehouseIns.push({ no: `PWI-${pad(++pwiSeq, 4)}`, wo: `WO-${pad(woSeq, 4)}`, fg, qty, m, day: ri(1, 20) });
  }
  // ── 回款 / 付款策略 ──
  for (const s of sales.filter(x => x.m === m && x.status !== '待审核')) {
    const total = s.lines.reduce((t, l) => t + l.qty * l.price, 0);
    let ratio = 0;
    if (m >= 2) ratio = rnd() < 0.85 ? 1 : 0.6;
    else if (m === 1) ratio = rnd() < 0.5 ? 0.5 : (rnd() < 0.5 ? 1 : 0);
    else ratio = 0;
    if (ratio > 0) receipts.push({ sale: s, amount: Math.round(total * ratio * 100) / 100, m });
  }
  for (const p of purchases.filter(x => x.m === m && x.status !== '待审批')) {
    const total = p.lines.reduce((t, l) => t + l.qty * l.price, 0);
    let ratio = 0;
    if (m >= 2) ratio = rnd() < 0.8 ? 1 : 0.7;
    else if (m === 1) ratio = rnd() < 0.4 ? 0.5 : 0;
    else ratio = 0;
    if (ratio > 0) payments.push({ po: p, amount: Math.round(total * ratio * 100) / 100, m });
  }
}
// 报废示例
const scrapEvent = { wo: workOrders[3]?.no || workOrders[0].no, qty: 2, reason: '焊接缺陷-返修无价值', m: 4 };

// ══════════════════════ 库存模拟（加权平均成本） ══════════════════════
const inv = {}; // 'code|仓库' -> {qty, value}（多仓维度）
const moves = []; // {m, day, code, wh, type:'入库'|'出库', delta, cost, ref}
const WH_RAW = '原料仓', WH_FG = '成品仓', WH = '默认仓';
const invIn = (m, day, code, qty, price, ref, wh) => {
  const k = code + '|' + wh;
  inv[k] = inv[k] || { qty: 0, value: 0 };
  inv[k].qty += qty; inv[k].value += qty * price;
  moves.push({ m, day, code, wh, type: '入库', delta: qty, ref });
};
const invOut = (m, day, code, qty, ref, wh) => {
  const k = code + '|' + wh;
  const b = inv[k] = inv[k] || { qty: 0, value: 0 };
  const uc = b.qty > 0 ? b.value / b.qty : 0;
  b.qty -= qty; b.value -= qty * uc;
  if (b.qty < 0) { b.qty = 0; b.value = 0; }
  moves.push({ m, day, code, wh, type: '出库', delta: qty, ref, cost: uc });
};
// 期初建账库存（8个月前的一次性建库采购，保证早期生产领料不断料）
const initialStock = { 'IC-0001': 400, 'MOD-0001': 200, 'PCB-0001': 350, 'PWR-0001': 300, 'ENC-0001': 250, 'DSP-0001': 120, 'CON-0001': 1200, 'PKG-0001': 500, 'FST-0001': 900, 'SEN-0001': 200, 'SEN-0002': 150, 'ISO-0001': 160 };
for (const [c, qty] of Object.entries(initialStock)) invIn(8, 29, c, qty, gmap[c][5], '期初建库', WH_RAW);
// ── 批次仿真：与库存回放同节奏（采购批次 → FIFO领料 → 生产批次(成分回写) → 销售FIFO耗用） ──
const batchRows = [];   // trade_batch_trace
const batchConsumeRows = []; // trade_batch_consume
const liveBatches = []; // {no, code, type, qty, remain, source_no, supplier_code, supplier_name, wo, components, m, day}
const woComponents = {}; // woNo -> [batchNo]
const fifoConsume = (code, qty, targetNo, targetType, m, compSet) => {
  let need = qty;
  for (const b of liveBatches) {
    if (need <= 0) break;
    if (b.code !== code || b.remain <= 0) continue;
    const take = Math.min(b.remain, need);
    b.remain -= take; need -= take;
    batchConsumeRows.push({ batch_no: b.no, code, qty: take, targetNo, targetType, m });
    if (compSet && !compSet.includes(b.no)) compSet.push(b.no);
  }
};
// 按时间回放全部业务
for (let m = 8; m >= 0; m--) {
  for (const p of purchases.filter(x => x.m === m && x.status === '已入库')) {
    p.lines.forEach((l, i) => {
      invIn(m, p.day, l.code, l.qty, l.price, p.no, WH_RAW);
      const bn = `PB-${p.no}-${i + 1}`;
      liveBatches.push({ no: bn, code: l.code, type: '采购批次', qty: l.qty, remain: l.qty, source_no: p.no, supplier_code: suppliers[p.suppIdx][0], supplier_name: suppliers[p.suppIdx][1], wo: '', components: [], m, day: p.day + 2 });
    });
  }
  for (const r of requisitions.filter(x => x.m === m)) {
    woComponents[r.wo] = woComponents[r.wo] || [];
    for (const l of r.lines) if (l.actual > 0) {
      invOut(m, 15, l.code, l.actual, r.no, WH_RAW);
      fifoConsume(l.code, l.actual, r.wo, '生产领料', m, woComponents[r.wo]);
    }
  }
  for (const w of warehouseIns.filter(x => x.m === m)) {
    invIn(m, w.day, w.fg, w.qty, fgCost[w.fg], w.no, WH_FG);
    liveBatches.push({ no: `MB-${w.wo}`, code: w.fg, type: '生产批次', qty: w.qty, remain: w.qty, source_no: w.wo, supplier_code: '', supplier_name: '', wo: w.wo, components: woComponents[w.wo] || [], m, day: w.day });
  }
  for (const s of sales.filter(x => x.m === m && x.ship === '已出库'))
    for (const l of s.lines) {
      invOut(m, s.day, l.code, l.qty, s.no, WH_FG);
      fifoConsume(l.code, l.qty, s.no, '销售出库', m, null);
    }
}
for (const b of liveBatches) batchRows.push(b);

// ══════════════════════ 凭证与科目余额 ══════════════════════
const vouchers = []; // {m, day, no, remark, lines:[{code,name,dr,cr,summary}]}
let vzSeq = 0;
const vzNo = () => `VZ-${pad(++vzSeq, 5)}`;
const SUBJ = { '1002': '银行存款', '1122': '应收账款', '1403': '原材料', '1405': '库存商品', '5001': '生产成本', '2202': '应付账款', '4001': '实收资本', '4104': '本年利润', '6001': '主营业务收入', '6401': '主营业务成本', '6602': '管理费用' };
const addVz = (m, day, remark, lines) => vouchers.push({ m, day, no: vzNo(), remark, lines });

addVz(8, 29, '期初股东投入资本金', [{ code: '1002', dr: 2000000, cr: 0, summary: '收到股东投资款' }, { code: '4001', dr: 0, cr: 2000000, summary: '实收资本入账' }]);
for (const s of sales.filter(x => x.status !== '待审核')) {
  const amt = s.lines.reduce((t, l) => t + l.qty * l.price, 0);
  addVz(s.m, s.day, `销售-${s.no}`, [{ code: '1122', dr: amt, cr: 0, summary: `销售-${s.no}` }, { code: '6001', dr: 0, cr: amt, summary: `销售-${s.no}` }]);
}
for (const p of purchases.filter(x => x.status !== '待审批')) {
  const amt = p.lines.reduce((t, l) => t + l.qty * l.price, 0);
  addVz(p.m, p.day, `采购-${p.no}`, [{ code: '1403', dr: amt, cr: 0, summary: `采购-${p.no}` }, { code: '2202', dr: 0, cr: amt, summary: `采购-${p.no}` }]);
}
for (const s of sales.filter(x => x.ship === '已出库')) {
  const cost = s.lines.reduce((t, l) => t + l.qty * (fgCost[l.code] || 0), 0);
  if (cost > 0) addVz(s.m, s.day, `结转销售成本-${s.no}`, [{ code: '6401', dr: cost, cr: 0, summary: `结转销售成本-${s.no}` }, { code: '1405', dr: 0, cr: cost, summary: `结转销售成本-${s.no}` }]);
}
for (const r of requisitions) {
  const cost = r.lines.reduce((t, l) => t + l.actual * gmap[l.code][5], 0);
  if (cost > 0) addVz(r.m, 15, `生产领料-${r.no}`, [{ code: '5001', dr: cost, cr: 0, summary: `生产直接领料-${r.no}` }, { code: '1403', dr: 0, cr: cost, summary: `生产直接领料-${r.no}` }]);
}
for (const w of warehouseIns) {
  const cost = Math.round(w.qty * fgCost[w.fg] * 100) / 100;
  addVz(w.m, w.day, `完工入库-${w.wo}`, [{ code: '1405', dr: cost, cr: 0, summary: `完工入库成本-${w.fg}` }, { code: '5001', dr: 0, cr: cost, summary: `结转生产成本-${w.wo}` }]);
}
for (const rc of receipts) addVz(rc.m, ri(1, 24), `回款-${rc.sale.no}`, [{ code: '1002', dr: rc.amount, cr: 0, summary: `核销回款-${rc.sale.no}` }, { code: '1122', dr: 0, cr: rc.amount, summary: `核销应收-${rc.sale.no}` }]);
for (const py of payments) addVz(py.m, ri(1, 24), `付款-${py.po.no}`, [{ code: '2202', dr: py.amount, cr: 0, summary: `核销应付-${py.po.no}` }, { code: '1002', dr: 0, cr: py.amount, summary: `核销付款-${py.po.no}` }]);
// 工资与月度费用（9 个月）
const staffCost = {}; // m -> {salary, rent, utility}
for (let m = 8; m >= 0; m--) {
  const salary = ri(255000, 285000);
  const rent = 18000;
  const utility = ri(3200, 6800);
  staffCost[m] = { salary, rent, utility };
  addVz(m, 10, `发放${'工资'}`, [{ code: '6602', dr: salary, cr: 0, summary: '计提并发放当月工资' }, { code: '1002', dr: 0, cr: salary, summary: '代发工资' }]);
  addVz(m, 5, '支付办公租金水电', [{ code: '6602', dr: rent + utility, cr: 0, summary: '办公租金及水电费' }, { code: '1002', dr: 0, cr: rent + utility, summary: '支付租金水电' }]);
}

// 按期间聚合凭证
const CREDIT_NATURE = new Set(['2202', '4001', '4104', '6001']);
const periodAgg = {}; // m -> code -> {dr, cr}
for (const v of vouchers) {
  for (const l of v.lines) {
    periodAgg[v.m] = periodAgg[v.m] || {};
    periodAgg[v.m][l.code] = periodAgg[v.m][l.code] || { dr: 0, cr: 0 };
    periodAgg[v.m][l.code].dr += l.dr;
    periodAgg[v.m][l.code].cr += l.cr;
  }
}
// 滚存余额（与 FinanceService.updateBalance 相同公式）
const balances = []; // {m, code, begin, dr, cr, end, remark}
const prevEnd = {};
const cumProfit = {}; // m -> 4104 期末
let profitCarry = 0;
for (let m = 8; m >= 0; m--) {
  const agg = periodAgg[m] || {};
  const codes = Array.from(new Set([...Object.keys(agg), ...Object.keys(prevEnd).filter(c => !CREDIT_NATURE.has(c) || true)]));
  const monthRevenue = (agg['6001']?.cr || 0);
  const monthExpense = (agg['6401']?.dr || 0) + (agg['6602']?.dr || 0);
  const closed = m >= 1;
  for (const code of Object.keys(agg)) {
    const isPL = code.startsWith('6');
    const begin = isPL ? 0 : (prevEnd[code] || 0);
    const { dr, cr } = agg[code];
    let end = CREDIT_NATURE.has(code) ? begin - dr + cr : begin + dr - cr;
    let remark = null;
    if (isPL && closed) { end = 0; remark = '已结账'; }
    balances.push({ m, code, begin, dr, cr, end, remark });
    if (!isPL) prevEnd[code] = end;
  }
  if (closed) {
    const profit = monthRevenue - monthExpense;
    profitCarry += profit;
    cumProfit[m] = profitCarry;
    balances.push({ m, code: '4104', begin: profitCarry - profit, dr: 0, cr: profit, end: profitCarry, remark: '月结转入净利润' });
    prevEnd['4104'] = profitCarry;
  }
}

// ══════════════════════ 人员 / 工资明细 ══════════════════════
const depts = [['销售部', '销售专员', 6], ['生产部', '装配技工', 6], ['财务部', '会计', 2], ['仓储部', '仓管员', 3], ['采购部', '采购专员', 2], ['人事部', '人事专员', 1], ['售后部', '售后工程师', 2], ['管理层', '部门经理', 2]];
const surnamePool = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜';
const name2Pool = ['伟', '芳', '娜', '敏', '静', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '秀兰', '霞', '平', '刚', '桂英'];
const employees = [];
let empSeq = 0;
for (const [dept, pos, n] of depts) {
  for (let i = 0; i < n; i++) {
    empSeq++;
    const name = surnamePool[ri(0, surnamePool.length - 1)] + pick(name2Pool);
    employees.push({ no: `EMP-${pad(empSeq, 3)}`, name, gender: rnd() < 0.55 ? '男' : '女', dept, pos, entry: `${ri(2018, 2024)}-${pad(ri(1, 12), 2)}-${pad(ri(1, 28), 2)}`, phone: `138${pad(ri(10000000, 99999999), 8)}` });
  }
}
const salaries = []; // {m, emp, base, bonus, ded, ins, tax, net}
for (let m = 2; m >= 0; m--) {
  for (const e of employees) {
    const base = e.dept === '管理层' ? ri(12000, 16000) : e.dept === '财务部' ? ri(8000, 10500) : ri(5200, 8800);
    const bonus = ri(200, 2200);
    const ded = ri(0, 400);
    const ins = Math.round(base * 0.105);
    const tax = Math.round((base + bonus) * 0.06);
    salaries.push({ m, emp: e, base, bonus, ded, ins, tax, net: base + bonus - ded - ins - tax });
  }
}

// ══════════════════════ 质检 / 发货 ══════════════════════
const qcs = [];
for (let m = 8; m >= 0; m--) {
  const isFg = rnd() < 0.5;
  const code = isFg ? pick(Object.keys(bom)) : pick(Object.keys(matSupplier));
  const sample = ri(50, 200);
  const rate = rnd() < 0.85 ? 1 : (0.93 + rnd() * 0.05);
  const pass = Math.min(sample, Math.round(sample * rate));
  qcs.push({ m, day: m === 0 ? ri(0, 4) : ri(1, 26), type: isFg ? '成品检验' : '来料检验', code, sample, pass, result: pass / sample >= 0.95 ? '合格' : '让步接收', inspector: pick(['质检一组', '质检二组']) });
  if (rnd() < 0.4) {
    const code2 = pick(Object.keys(bom));
    const s2 = ri(40, 120), p2 = s2;
    qcs.push({ m, day: m === 0 ? ri(0, 4) : ri(1, 26), type: '成品检验', code: code2, sample: s2, pass: p2, result: '合格', inspector: pick(['质检一组', '质检二组']) });
  }
}
const deliveries = [];
let dlvSeq = 0;
for (const s of sales.filter(x => x.ship === '已出库')) {
  deliveries.push({ no: `DLV-${pad(++dlvSeq, 4)}`, sale: s, m: s.m, day: Math.max(0, s.day - 1), logistics: pick(['顺丰速运', '德邦物流', '京东物流']), track: `SF${ri(100000000, 999999999)}`, status: s.m === 0 ? '运输中' : '已签收' });
}

// ══════════════════════ 审批流 ══════════════════════
const approvals = [];
const pendPurchases = purchases.filter(p => p.status === '待审批');
const apprPurchases = purchases.filter(p => p.status === '已审批');
if (pendPurchases[0]) approvals.push({ no: 'AP-D-0001', type: '采购审批', m: 0, applicant: '周八', dept: '采购部', ref: pendPurchases[0].no, amount: pendPurchases[0].lines.reduce((t, l) => t + l.qty * l.price, 0), status: '待审批', nodes: [['部门经理审核', '已通过', '系统'], ['总经理审批', '待处理', 'admin'], ['财务总监审批', '未触发', 'accounting']], remark: '月度原材料采购申请' });
if (pendPurchases[1]) approvals.push({ no: 'AP-D-0002', type: '采购审批', m: 0, applicant: '周八', dept: '采购部', ref: pendPurchases[1].no, amount: pendPurchases[1].lines.reduce((t, l) => t + l.qty * l.price, 0), status: '待审批', nodes: [['部门经理审核', '已通过', '系统'], ['总经理审批', '待处理', 'admin'], ['财务总监审批', '未触发', 'accounting']], remark: '补充采购-结构件' });
approvals.push({ no: 'AP-D-0003', type: '费用审批', m: 0, applicant: '张三', dept: '销售部', ref: '', amount: 4200, status: '待审批', nodes: [['部门经理审核', '待处理', 'admin'], ['财务审核', '未触发', 'accounting']], remark: '华东区客户拜访差旅费' });
approvals.push({ no: 'AP-D-0004', type: '请假审批', m: 0, applicant: '孙七', dept: '人事部', ref: '', amount: 0, status: '待审批', nodes: [['部门经理审核', '待处理', 'admin'], ['HR复核', '未触发', 'hr']], remark: '年假3天' });
if (apprPurchases[0]) approvals.push({ no: 'AP-D-0005', type: '采购审批', m: 1, applicant: '周八', dept: '采购部', ref: apprPurchases[0].no, amount: apprPurchases[0].lines.reduce((t, l) => t + l.qty * l.price, 0), status: '已通过', nodes: [['部门经理审核', '已通过', '系统'], ['总经理审批', '已通过', 'admin'], ['财务总监审批', '已通过', 'accounting']], remark: '传感器元件采购' });
approvals.push({ no: 'AP-D-0006', type: '费用审批', m: 2, applicant: '李四', dept: '仓储部', ref: '', amount: 1680, status: '已通过', nodes: [['部门经理审核', '已通过', 'admin'], ['财务审核', '已通过', 'accounting']], remark: '仓储货架维修费' });
approvals.push({ no: 'AP-D-0007', type: '请假审批', m: 3, applicant: '王五', dept: '财务部', ref: '', amount: 0, status: '已通过', nodes: [['部门经理审核', '已通过', 'admin'], ['HR复核', '已通过', 'hr']], remark: '事假1天' });
approvals.push({ no: 'AP-D-0008', type: '费用审批', m: 2, applicant: '赵六', dept: '生产部', ref: '', amount: 29800, status: '已驳回', nodes: [['部门经理审核', '已驳回', 'admin'], ['财务审核', '已取消', 'accounting']], remark: '车间设备采购-超预算驳回' });

// ══════════════════════ 输出 SQL ══════════════════════
emit('-- ============================================================');
emit('-- ERP 演示数据集（由 scripts/generate_demo_data.mjs 生成，请勿手改）');
emit('-- 特性：全链路自洽（库存/凭证/应收应付/报表互相勾稽），全部 INSERT IGNORE 幂等，');
emit('--       日期相对 CURDATE() 永远呈现最近 9 个月的鲜活数据。');
emit('-- ============================================================');
emit('SET NAMES utf8mb4;');

// ── 商品 / 客户 / 供应商 ──
insert('trade_goods_main', ['product_code', 'product_name', 'category', 'spec_model', 'unit', 'brand', 'purchase_price', 'sale_price', 'unit_cost', 'status', 'remark'],
  goods.map(g => {
    const isFg = g[0].startsWith('FG');
    const cost = isFg ? fgCost[g[0]] : g[5];
    return [q(g[0]), q(g[1]), q(g[2]), q(g[3]), q(g[4]), q('自研'), money(g[5]), money(g[6]), money(cost), q('启用'), q(isFg ? '自制产成品' : '常备物料')];
  }));
insert('cust_customer_main', ['customer_code', 'customer_name', 'customer_type', 'industry', 'region', 'contact_person', 'contact_phone', 'email', 'address', 'credit_limit', 'level', 'status'],
  customers.map(c => [q(c[0]), q(c[1]), q('企业客户'), q(c[2]), q(c[3]), q(c[4]), q(c[5]), q(c[6]), q(c[7]), money(c[8]), q(c[9]), q('启用')]));
insert('supp_supplier_main', ['supplier_code', 'supplier_name', 'supplier_type', 'contact_person', 'contact_phone', 'email', 'address', 'level', 'status'],
  suppliers.map((s, i) => [q(s[0]), q(s[1]), q(s[2]), q(s[3]), q(s[4]), q(s[5]), q(s[6]), q(i < 3 ? '战略供应商' : '普通供应商'), q('启用')]));

// ── BOM ──
insert('prod_bom_structure', ['parent_code', 'component_code', 'product_code', 'product_name', 'spec_model', 'level', 'qty', 'unit_price', 'unit_name', 'loss_rate'],
  Object.entries(bom).flatMap(([fg, lines]) => lines.map(([c, per]) =>
    [q(fg), q(c), q(c), q(gmap[c][1]), q(gmap[c][3]), q('1'), q4(per), money(gmap[c][5]), q(gmap[c][4]), q4(0.01)])));

// ── 销售 ──
insert('trade_sales_main', ['sales_no', 'customer_code', 'customer_name', 'sales_date', 'total_amount', 'sales_person', 'sales_status', 'shipping_status', 'warehouse', 'remark'],
  sales.map(s => {
    const total = s.lines.reduce((t, l) => t + l.qty * l.price, 0);
    return [q(s.no), q(customers[s.custIdx][0]), q(customers[s.custIdx][1]), dAgo(s.m * 30 + s.day), money(total), q(s.person), q(s.status), q(s.ship), q(WH_FG), q('')];
  }));
insert('trade_sales_detail', ['sales_no', 'line_no', 'product_code', 'product_name', 'spec_model', 'qty', 'unit', 'unit_price', 'amount', 'delivery_date'],
  sales.flatMap(s => s.lines.map((l, i) => [q(s.no), i + 1, q(l.code), q(gmap[l.code][1]), q(gmap[l.code][3]), q4(l.qty), q(gmap[l.code][4]), money(l.price), money(l.qty * l.price), dAgo(Math.max(0, s.m * 30 + s.day - 2))])));

// ── 采购 ──
insert('trade_purchase_main', ['purchase_no', 'supplier_code', 'supplier_name', 'purchase_date', 'total_amount', 'buyer', 'purchase_status', 'arrival_status', 'warehouse', 'remark'],
  purchases.map(p => {
    const total = p.lines.reduce((t, l) => t + l.qty * l.price, 0);
    return [q(p.no), q(suppliers[p.suppIdx][0]), q(suppliers[p.suppIdx][1]), dAgo(p.m * 30 + p.day), money(total), q(p.buyer), q(p.status), q(p.arrival), q(WH_RAW), q('')];
  }));
insert('trade_purchase_detail', ['purchase_no', 'line_no', 'product_code', 'product_name', 'spec_model', 'qty', 'unit', 'unit_price', 'amount', 'recv_qty'],
  purchases.flatMap(p => p.lines.map((l, i) => [q(p.no), i + 1, q(l.code), q(gmap[l.code][1]), q(gmap[l.code][3]), q4(l.qty), q(gmap[l.code][4]), money(l.price), money(l.qty * l.price), p.status === '已入库' ? q4(l.qty) : q4(0)])));

// ── 出入库单据 ──
const inDocs = [], inDetails = [], outDocs = [], outDetails = [];
for (const p of purchases.filter(x => x.status === '已入库')) {
  const total = p.lines.reduce((t, l) => t + l.qty * l.price, 0);
  const inNo = `IN-${p.no}`;
  inDocs.push([q(inNo), q('采购入库'), q(p.no), q(suppliers[p.suppIdx][0]), q(WH_RAW), money(total), q('李四'), dAgo(p.m * 30 + p.day + 2), q('已入库')]);
  p.lines.forEach((l, i) => inDetails.push([q(inNo), i + 1, q(l.code), q(gmap[l.code][1]), q(gmap[l.code][3]), q4(l.qty), q(gmap[l.code][4]), money(l.price), money(l.qty * l.price), q('A-01')]));
}
for (const w of warehouseIns) {
  const inNo = `IN-${w.no}`;
  inDocs.push([q(inNo), q('生产入库'), q(w.wo), q(''), q(WH_FG), money(w.qty * fgCost[w.fg]), q('李四'), dAgo(w.m * 30 + w.day), q('已入库')]);
  inDetails.push([q(inNo), 1, q(w.fg), q(gmap[w.fg][1]), q(gmap[w.fg][3]), q4(w.qty), q(gmap[w.fg][4]), money(fgCost[w.fg]), money(w.qty * fgCost[w.fg]), q('B-01')]);
}
insert('trade_stock_in_main', ['in_no', 'in_type', 'ref_no', 'supplier_code', 'warehouse', 'total_amount', 'handler', 'in_date', 'status'], inDocs);
insert('trade_stock_in_detail', ['in_no', 'line_no', 'product_code', 'product_name', 'spec_model', 'qty', 'unit', 'unit_cost', 'amount', 'location'], inDetails);
for (const s of sales.filter(x => x.ship === '已出库')) {
  const total = s.lines.reduce((t, l) => t + l.qty * l.price, 0);
  const outNo = `OUT-${s.no}`;
  outDocs.push([q(outNo), q('销售出库'), q(s.no), q(customers[s.custIdx][0]), q(WH_FG), money(total), q('李四'), dAgo(s.m * 30 + s.day), q('已出库')]);
  s.lines.forEach((l, i) => {
    const uc = fgCost[l.code];
    outDetails.push([q(outNo), i + 1, q(l.code), q(gmap[l.code][1]), q(gmap[l.code][3]), q4(l.qty), q(gmap[l.code][4]), money(uc), money(l.qty * uc), q('B-01')]);
  });
}
insert('trade_stock_out_main', ['out_no', 'out_type', 'ref_no', 'customer_code', 'warehouse', 'total_amount', 'handler', 'out_date', 'status'], outDocs);
insert('trade_stock_out_detail', ['out_no', 'line_no', 'product_code', 'product_name', 'spec_model', 'qty', 'unit', 'unit_cost', 'amount', 'location'], outDetails);

// ── 库存结存 + 流水 ──
const alertSet = new Set(['PKG-0001', 'FST-0001']);
insert('trade_inventory_balance', ['product_code', 'product_name', 'spec_model', 'warehouse', 'location', 'qty', 'unit_cost', 'total_value', 'min_stock', 'stock_status'],
  Object.entries(inv).filter(([, b]) => b.qty > 0).map(([key, b]) => {
    const [code, wh] = key.split('|');
    const uc = b.value / b.qty;
    const min = alertSet.has(code) ? Math.ceil(b.qty + 25) : (code.startsWith('FG') ? 15 : 40);
    return [q(code), q(gmap[code][1]), q(gmap[code][3]), q(wh), q(code.startsWith('FG') ? 'B-01' : 'A-01'), q4(b.qty), q4(uc), money(b.value), q4(min), q(b.qty < min ? '预警' : '正常')];
  }));
{
  let logSeq = 0;
  const running = {};
  const logRows = moves.map(mv => {
    const rk = mv.code + '|' + mv.wh;
    running[rk] = running[rk] || 0;
    const before = running[rk];
    const after = mv.type === '入库' ? before + mv.delta : before - mv.delta;
    running[rk] = after;
    return [q(`LOG-D-${pad(++logSeq, 5)}`), q(mv.code), q(gmap[mv.code][1]), q(mv.wh), q(mv.type), q4(before), q4(mv.delta), q4(after), q(mv.ref), q('系统'), dAgo(mv.m * 30 + mv.day)];
  });
  insert('trade_stock_log', ['log_no', 'product_code', 'product_name', 'warehouse', 'change_type', 'before_qty', 'change_qty', 'after_qty', 'ref_no', 'operator', 'change_date'], logRows);
}

// ── 部门月度预算（近4个月，费用审批超预算拦截依据） ──
{
  const budgetRows = [];
  const depts = [['销售部', 35000], ['财务部', 15000], ['生产部', 40000], ['仓储部', 18000], ['采购部', 25000], ['人事部', 12000], ['售后部', 16000], ['管理层', 30000]];
  for (let m = 3; m >= 0; m--) {
    for (const [d, base] of depts) {
      budgetRows.push([q(d), periodOfMonth(m), money(base + ri(-2000, 3000)), q('')]);
    }
  }
  insert('oa_budget', ['department', 'budget_month', 'budget_amount', 'remark'], budgetRows);
}

// ── 销售目标（近9个月 × 3名销售，随业务增长爬坡） ──
{
  const targetRows = [];
  for (let m = 8; m >= 0; m--) {
    const growth = 1 + (8 - m) * 0.04;
    [['张三', 95000], ['周八', 75000], ['王小明', 45000]].forEach(([p, base]) => {
      targetRows.push([periodOfMonth(m), q(p), money(Math.round(base * growth / 500) * 500), q('')]);
    });
  }
  insert('trade_sales_target', ['target_month', 'salesperson', 'target_amount', 'remark'], targetRows);
}

// ── 合同档案（含临期30天内与已过期未完结的预警样例） ──
{
  const dPlus = n => `DATE_ADD(CURDATE(), INTERVAL ${n} DAY)`;
  const contracts = [
    ['CT-2026-001', '智能网关年度框架协议', '销售合同', '华东智能制造有限公司', 1200000, 300, 290, dPlus(65), '张三', '执行中'],
    ['CT-2026-002', '传感器批量供货合同', '销售合同', '南方物联科技公司', 460000, 200, 190, dPlus(20), '张三', '执行中'],
    ['CT-2026-003', '控制主板定制开发合同', '销售合同', '长江智慧能源公司', 820000, 150, 140, dPlus(120), '王小明', '执行中'],
    ['CT-2026-004', '港口设备供货合同', '销售合同', '沿海港口设备公司', 350000, 120, 110, dPlus(-10), '周八', '执行中'],
    ['CT-2026-005', '芯片年度采购框架', '采购合同', '深圳芯联电子公司', 900000, 260, 250, dPlus(105), '周八', '执行中'],
    ['CT-2026-006', '显示模组采购合同', '采购合同', '苏州光电科技公司', 280000, 180, 170, dPlus(25), '周八', '执行中'],
    ['CT-2025-018', '农机定制合同', '销售合同', '中原农机股份公司', 540000, 480, 470, dAgo(110), '王小明', '已完结'],
    ['CT-2025-015', '包装材料采购合同', '采购合同', '佛山包装材料厂', 86000, 420, 410, dAgo(60), '周八', '已完结'],
    ['CT-2026-007', '北方自动化试点合同', '销售合同', '北方自动化设备公司', 150000, 40, 30, dPlus(150), '张三', '草稿'],
    ['CT-2025-011', '旧产线改造合同', '销售合同', '深港电子科技公司', 220000, 560, 550, dAgo(200), '张三', '已终止'],
  ];
  insert('cust_contract_main', ['contract_no', 'contract_name', 'contract_type', 'party_name', 'amount', 'sign_date', 'start_date', 'end_date', 'owner', 'status', 'remark'],
    contracts.map(c => [q(c[0]), q(c[1]), q(c[2]), q(c[3]), money(c[4]), dAgo(c[5]), dAgo(c[6]), c[7], q(c[8]), q(c[9]), q('')]));
}

// ── 仓库主数据（多仓库管理） ──
insert('trade_warehouse_main', ['warehouse_code', 'warehouse_name', 'warehouse_type', 'manager', 'location', 'status', 'remark'], [
  [q('WH-01'), q(WH_RAW), q('原料仓'), q('李四'), q('A区-1层'), q('启用'), q('原材料/元器件存储，采购入库与生产领料')],
  [q('WH-02'), q(WH_FG), q('成品仓'), q('李四'), q('B区-1层'), q('启用'), q('产成品存储，生产入库与销售发货')],
  [q('WH-03'), q(WH), q('综合仓'), q('李四'), q('C区-1层'), q('启用'), q('盘点调账与杂项周转')],
]);

// ── 批次追溯台账 + 耗用记录（与出入库回放完全同步生成） ──
insert('trade_batch_trace', ['batch_no', 'product_code', 'product_name', 'batch_type', 'qty', 'remain_qty', 'source_no', 'supplier_code', 'supplier_name', 'work_order_no', 'component_batches', 'in_date', 'status'],
  batchRows.map(b => [q(b.no), q(b.code), q(gmap[b.code][1]), q(b.type), q4(b.qty), q4(b.remain), q(b.source_no), q(b.supplier_code), q(b.supplier_name), q(b.wo), q(JSON.stringify(b.components)), dAgo(b.m * 30 + b.day), q(b.remain <= 0 ? '已耗用' : '在库')]));
insert('trade_batch_consume', ['batch_no', 'product_code', 'consume_qty', 'target_no', 'target_type', 'consume_date'],
  batchConsumeRows.map(c => [q(c.batch_no), q(c.code), q4(c.qty), q(c.targetNo), q(c.targetType), dAgo(c.m * 30 + 15)]));

// ── 生产 ──
insert('prod_work_order', ['work_order_no', 'ref_plan_no', 'product_code', 'product_name', 'spec_model', 'plan_qty', 'actual_qty', 'complete_qty', 'scrap_qty', 'unit', 'workshop', 'leader', 'start_date', 'plan_end_date', 'order_status', 'priority'],
  workOrders.map(w => [q(w.no), q(''), q(w.fg), q(gmap[w.fg][1]), q(gmap[w.fg][3]), q4(w.qty), q4(w.actual), q4(w.actual), w.no === scrapEvent.wo ? q4(scrapEvent.qty) : q4(0), q('台'), q(pick(workshops)), q('赵六'), dAgo(w.m * 30 + w.day), dAgo(Math.max(0, w.m * 30 + w.day - 7)), q(w.status), q('中')]));
insert('prod_material_requisition', ['req_no', 'ref_work_order', 'product_code', 'product_name', 'spec_model', 'plan_req_qty', 'actual_req_qty', 'unit', 'warehouse', 'req_date', 'req_person'],
  requisitions.flatMap(r => r.lines.map(l => [q(r.no), q(r.wo), q(l.code), q(gmap[l.code][1]), q(gmap[l.code][3]), q4(l.plan), q4(l.actual), q(gmap[l.code][4]), q(WH_RAW), dAgo(r.m * 30 + 14), q('赵六')])));
insert('prod_warehousing', ['in_no', 'ref_work_order', 'product_code', 'product_name', 'spec_model', 'plan_in_qty', 'actual_in_qty', 'unit', 'warehouse', 'in_date', 'qc_result', 'handler'],
  warehouseIns.map(w => [q(w.no), q(w.wo), q(w.fg), q(gmap[w.fg][1]), q(gmap[w.fg][3]), q4(w.qty), q4(w.qty), q(gmap[w.fg][4]), q(WH_FG), dAgo(w.m * 30 + w.day), q('合格'), q('李四')]));
insert('prod_scrap_main', ['scrap_no', 'work_order_no', 'product_code', 'product_name', 'scrap_qty', 'scrap_reason', 'handler', 'scrap_date', 'status'],
  [[q('SCP-D-0001'), q(scrapEvent.wo), q(workOrders.find(w => w.no === scrapEvent.wo).fg), q(gmap[workOrders.find(w => w.no === scrapEvent.wo).fg][1]), q4(scrapEvent.qty), q(scrapEvent.reason), q('赵六'), dAgo(scrapEvent.m * 30 + 16), q('已确认')]]);
insert('prod_cost_settle', ['settle_no', 'work_order_no', 'product_code', 'product_name', 'spec_model', 'produce_qty', 'material_cost', 'labor_cost', 'total_cost', 'unit_cost', 'settle_date', 'handler'],
  warehouseIns.map((w, i) => {
    const mat = bom[w.fg].reduce((t, [c, per]) => t + per * w.qty * gmap[c][5], 0);
    const labor = w.qty * 40;
    return [q(`SETTLE-D-${pad(i + 1, 4)}`), q(w.wo), q(w.fg), q(gmap[w.fg][1]), q(gmap[w.fg][3]), q4(w.qty), money(mat), money(labor), money(mat + labor), money((mat + labor) / w.qty), dAgo(w.m * 30 + w.day), q('系统')];
  }));

// ── 凭证 + 科目余额 ──
const vzRows = [], vzDetailRows = [];
for (const v of vouchers) {
  const dr = v.lines.reduce((t, l) => t + l.dr, 0);
  vzRows.push([q(v.no), q('记'), dAgo(v.m * 30 + v.day), periodOfDaysAgo(v.m * 30 + v.day), money(dr), money(dr), q('系统'), q('已审核'), q(v.remark)]);
  v.lines.forEach((l, i) => vzDetailRows.push([q(v.no), i + 1, q(l.code), q(SUBJ[l.code]), money(l.dr), money(l.cr), q(l.summary)]));
}
// 月末结转凭证（已结账月份）
for (let m = 8; m >= 1; m--) {
  const agg = periodAgg[m] || {};
  const rev = agg['6001']?.cr || 0;
  if (rev > 0) {
    const no = `VZ-CLOSE-${m}-INC`;
    vzRows.push([q(no), q('记'), nextMonthFirstDay(m), periodOfMonth(m), money(rev), money(rev), q('系统'), q('已审核'), q('月结结转收入')]);
    vzDetailRows.push([q(no), 1, q('6001'), q(SUBJ['6001']), money(0), money(rev), q('结转收入')]);
    vzDetailRows.push([q(no), 2, q('4104'), q(SUBJ['4104']), money(rev), money(0), q('结转收入到本年利润')]);
  }
  const exp = (agg['6401']?.dr || 0) + (agg['6602']?.dr || 0);
  if (exp > 0) {
    const no = `VZ-CLOSE-${m}-EXP`;
    vzRows.push([q(no), q('记'), nextMonthFirstDay(m), periodOfMonth(m), money(exp), money(exp), q('系统'), q('已审核'), q('月结结转费用')]);
    let ln = 0;
    if (agg['6401']?.dr) vzDetailRows.push([q(no), ++ln, q('6401'), q(SUBJ['6401']), money(agg['6401'].dr), money(0), q('结转费用-主营业务成本')]);
    if (agg['6602']?.dr) vzDetailRows.push([q(no), ++ln, q('6602'), q(SUBJ['6602']), money(agg['6602'].dr), money(0), q('结转费用-管理费用')]);
    vzDetailRows.push([q(no), ++ln, q('4104'), q(SUBJ['4104']), money(0), money(exp), q('结转费用到本年利润')]);
  }
}
insert('voucher_main', ['voucher_no', 'voucher_word', 'voucher_date', 'period', 'debit_total', 'credit_total', 'prepared_by', 'voucher_status', 'remark'], vzRows);
insert('voucher_detail', ['voucher_no', 'line_no', 'subject_code', 'subject_name', 'debit_amount', 'credit_amount', 'summary'], vzDetailRows);
insert('account_subject_balance', ['subject_code', 'subject_name', 'period', 'begin_balance', 'debit_amount', 'credit_amount', 'end_balance', 'remark'],
  balances.map(b => [q(b.code), q(SUBJ[b.code]), periodOfMonth(b.m), money(b.begin), money(b.dr), money(b.cr), money(b.end), b.remark ? q(b.remark) : q('')]));
insert('account_subject', ['subject_code', 'subject_name', 'subject_type', 'level', 'parent_code', 'balance_direction'],
  [['1002', '银行存款', '资产', 1, '', '借'], ['1122', '应收账款', '资产', 1, '', '借'], ['1403', '原材料', '资产', 1, '', '借'], ['1405', '库存商品', '资产', 1, '', '借'], ['5001', '生产成本', '成本', 1, '', '借'], ['2202', '应付账款', '负债', 1, '', '贷'], ['4001', '实收资本', '权益', 1, '', '贷'], ['4104', '本年利润', '权益', 1, '', '贷'], ['6001', '主营业务收入', '损益', 1, '', '贷'], ['6401', '主营业务成本', '损益', 1, '', '借'], ['6602', '管理费用', '损益', 1, '', '借']]
    .map(r => [q(r[0]), q(r[1]), q(r[2]), r[3], q(r[4]), q(r[5])]));

// ── 应收 / 应付 / 收支流水 ──
insert('finance_receivable_main', ['receivable_no', 'customer_code', 'customer_name', 'total_amount', 'received_amount', 'remain_amount', 'due_date', 'overdue_days', 'status', 'remark'],
  sales.filter(s => s.status !== '待审核').map((s, i) => {
    const total = s.lines.reduce((t, l) => t + l.qty * l.price, 0);
    const rc = receipts.find(r => r.sale === s);
    const received = rc ? rc.amount : 0;
    const remain = Math.round((total - received) * 100) / 100;
    const status = remain <= 0 ? '已核销' : received > 0 ? '部分核销' : '应收';
    const dueDaysAgo = s.m * 30 + s.day - 30;
    const overdue = remain > 0 && dueDaysAgo > 0 ? dueDaysAgo : 0;
    return [q(`RCV-D-${pad(i + 1, 4)}`), q(customers[s.custIdx][0]), q(customers[s.custIdx][1]), money(total), money(received), money(remain), dAgo(dueDaysAgo), overdue, q(status), q(`销售单:${s.no}`)];
  }));
insert('finance_payable_main', ['payable_no', 'supplier_code', 'supplier_name', 'total_amount', 'paid_amount', 'remain_amount', 'due_date', 'status', 'remark'],
  purchases.filter(p => p.status !== '待审批').map((p, i) => {
    const total = p.lines.reduce((t, l) => t + l.qty * l.price, 0);
    const py = payments.find(r => r.po === p);
    const paid = py ? py.amount : 0;
    const remain = Math.round((total - paid) * 100) / 100;
    const status = remain <= 0 ? '已核销' : paid > 0 ? '部分核销' : '应付';
    return [q(`PAY-D-${pad(i + 1, 4)}`), q(suppliers[p.suppIdx][0]), q(suppliers[p.suppIdx][1]), money(total), money(paid), money(remain), dAgo(p.m * 30 + p.day - 30), q(status), q(`采购单:${p.no}`)];
  }));
insert('finance_income_main', ['income_no', 'income_type', 'customer_code', 'customer_name', 'amount', 'income_date', 'status', 'remark'],
  receipts.map((r, i) => [q(`RCV-IN-${pad(i + 1, 4)}`), q('回款'), q(customers[r.sale.custIdx][0]), q(customers[r.sale.custIdx][1]), money(r.amount), dAgo(r.m * 30 + ri(1, 24)), q('已确认'), q(`核销应收-${r.sale.no}`)]));
{
  const expRows = payments.map((r, i) => [q(`PAY-OUT-${pad(i + 1, 4)}`), q('付款'), q(suppliers[r.po.suppIdx][0]), q(suppliers[r.po.suppIdx][1]), money(r.amount), dAgo(r.m * 30 + ri(1, 24)), q('已确认'), q(`核销应付-${r.po.no}`)]);
  for (let m = 8; m >= 0; m--) {
    const sc = staffCost[m];
    expRows.push([q(`EXP-RENT-${pad(8 - m + 1, 2)}`), q('办公租金'), q(''), q('园区物业'), money(sc.rent), dAgo(m * 30 + 5), q('已确认'), q('当月办公场地租金')]);
    expRows.push([q(`EXP-UTIL-${pad(8 - m + 1, 2)}`), q('水电费'), q(''), q('供电局'), money(sc.utility), dAgo(m * 30 + 6), q('已确认'), q('当月水电能耗')]);
    expRows.push([q(`EXP-SAL-${pad(8 - m + 1, 2)}`), q('工资'), q(''), q('代发'), money(sc.salary), dAgo(m * 30 + 10), q('已确认'), q('当月工资发放')]);
  }
  insert('finance_expense_main', ['expense_no', 'expense_type', 'supplier_code', 'supplier_name', 'amount', 'expense_date', 'status', 'remark'], expRows);
}

// ── 员工 / 工资 ──
insert('hr_employee_main', ['emp_no', 'emp_name', 'gender', 'department', 'position', 'entry_date', 'phone', 'emp_status'],
  employees.map(e => [q(e.no), q(e.name), q(e.gender), q(e.dept), q(e.pos), q(e.entry), q(e.phone), q('在职')]));
insert('hr_salary_main', ['salary_no', 'emp_no', 'emp_name', 'department', 'base_salary', 'bonus', 'deduction', 'insurance', 'tax', 'net_salary', 'salary_month', 'status'],
  salaries.map((s, i) => [q(`SAL-${pad(i + 1, 5)}`), q(s.emp.no), q(s.emp.name), q(s.emp.dept), money(s.base), money(s.bonus), money(s.ded), money(s.ins), money(s.tax), money(s.net), periodOfMonth(s.m), q(s.m === 0 ? '待发放' : '已发放')]));

// ── 质检 / 发货 ──
insert('quality_inspection_main', ['inspection_no', 'inspection_type', 'product_code', 'product_name', 'batch_no', 'sample_qty', 'pass_qty', 'fail_qty', 'result', 'inspector', 'inspection_date', 'status'],
  qcs.map((c, i) => [q(`QC-${pad(i + 1, 4)}`), q(c.type), q(c.code), q(gmap[c.code][1]), q(`B${pad(i + 1, 5)}`), c.sample, c.pass, c.sample - c.pass, q(c.result), q(c.inspector), dAgo(c.m * 30 + c.day), q('已完成')]));
insert('trade_delivery_main', ['delivery_no', 'ref_sales_no', 'customer_code', 'customer_name', 'delivery_date', 'warehouse', 'logistics', 'tracking_no', 'handler', 'status'],
  deliveries.map(d => [q(d.no), q(d.sale.no), q(customers[d.sale.custIdx][0]), q(customers[d.sale.custIdx][1]), dAgo(d.m * 30 + d.day), q(WH_FG), q(d.logistics), q(d.track), q('李四'), q(d.status)]));

// ── 审批流 ──
const apMainRows = [], apInstRows = [], apTaskRows = [], apLogRows = [];
for (const a of approvals) {
  const dayAgo = a.m * 30 + ri(1, 10);
  apMainRows.push([q(a.no), q(a.type), q(a.applicant), q(a.dept), q(a.ref), money(a.amount), dAgo(dayAgo), a.status === '待审批' ? q('') : q('admin'), q(a.status), q(a.remark)]);
  const instStatus = a.status === '待审批' ? '待处理' : a.status === '已驳回' ? '已终止' : '已完成';
  const curNode = a.status === '待审批' ? a.nodes[0][0] : a.status === '已驳回' ? '已驳回' : '审批完成';
  apInstRows.push([q(a.no), q(a.type), q(a.applicant), dAgo(dayAgo), q(curNode), q(instStatus)]);
  a.nodes.forEach((nd, i) => {
    const name = nd[0], st = nd[1], assignee = nd[2] || 'admin';
    apTaskRows.push([q(`${a.no}-T${i + 1}`), q(a.no), q(name), q(assignee), dAgo(dayAgo), st === '待处理' || st === '已通过' ? dAgo(Math.max(0, dayAgo - 1)) : 'NULL', q(st)]);
  });
  apLogRows.push([q(`${a.no}-L1`), q(a.no), q(a.applicant), q('提交'), dAgo(dayAgo), q('提交审批')]);
  if (a.status !== '待审批') {
    a.nodes.forEach(([name, st], i) => {
      apLogRows.push([q(`${a.no}-L${i + 2}`), q(a.no), q('admin'), st === '已取消' ? q('取消') : q(`通过-${name}`), dAgo(Math.max(0, dayAgo - 1)), q(st === '已驳回' ? '超出预算，驳回' : '同意')]);
    });
  }
}
insert('oa_approval_main', ['approval_no', 'approval_type', 'applicant', 'department', 'ref_no', 'amount', 'submit_date', 'approver', 'approval_status', 'remark'], apMainRows);
insert('oa_flow_instance', ['instance_no', 'workflow_code', 'applicant', 'start_date', 'current_node', 'instance_status'], apInstRows);
insert('oa_flow_task', ['task_no', 'instance_no', 'task_name', 'assignee', 'create_date', 'complete_date', 'task_status'], apTaskRows);
insert('oa_flow_log', ['log_no', 'instance_no', 'operator', 'action', 'action_date', 'comment'], apLogRows);
insert('oa_purchase_approval', ['approval_no', 'purchase_no', 'supplier_name', 'total_amount', 'applicant', 'approval_status'],
  approvals.filter(a => a.type === '采购审批').map(a => {
    const p = purchases.find(x => x.no === a.ref);
    return [q(a.no), q(a.ref), p ? q(suppliers[p.suppIdx][1]) : q(''), money(a.amount), q(a.applicant), q(a.status)];
  }));
insert('oa_expense_approval', ['approval_no', 'expense_type', 'amount', 'applicant', 'approval_status'],
  approvals.filter(a => a.type === '费用审批').map(a => [q(a.no), q(a.remark.length > 20 ? a.remark.slice(0, 20) : a.remark), money(a.amount), q(a.applicant), q(a.status)]));
insert('oa_leave_approval', ['approval_no', 'emp_name', 'leave_type', 'start_date', 'end_date', 'leave_days', 'approver', 'approval_status', 'remark'],
  approvals.filter(a => a.type === '请假审批').map(a => [q(a.no), q(a.applicant), q('年假'), dAgo(a.m * 30 + 8), dAgo(a.m * 30 + 5), '3.0', a.status === '已通过' ? q('admin') : q(''), q(a.status), q(a.remark)]));
insert('hr_attendance_leave', ['leave_no', 'emp_no', 'emp_name', 'leave_type', 'start_date', 'end_date', 'leave_days', 'reason', 'status'],
  approvals.filter(a => a.type === '请假审批').map((a, i) => [q(`LV-${pad(i + 1, 3)}`), q('EMP-015'), q(a.applicant), q('年假'), dAgo(a.m * 30 + 8), dAgo(a.m * 30 + 5), 3, q(a.remark), q(a.status === '已通过' ? '已批准' : '待批准')]));

// ── 字典补齐（新增状态值的彩色标签） ──
insert('sys_dict_item', ['dict_code', 'item_value', 'item_label', 'color', 'sort_no'], [
  ['doc.status', '未发货', '未发货', 'gray', 12], ['doc.status', '运输中', '运输中', 'blue', 13], ['doc.status', '已签收', '已签收', 'green', 14],
  ['doc.status', '部分核销', '部分核销', 'amber', 15], ['doc.status', '已核销', '已核销', 'green', 16], ['doc.status', '应收', '应收', 'amber', 17],
  ['doc.status', '应付', '应付', 'amber', 18], ['doc.status', '待审批', '待审批', 'amber', 19], ['doc.status', '已审批', '已审批', 'blue', 20],
  ['doc.status', '待发放', '待发放', 'amber', 21], ['doc.status', '已发放', '已发放', 'green', 22], ['doc.status', '在职', '在职', 'green', 23],
  ['doc.status', '合格', '合格', 'green', 24], ['doc.status', '待处理', '待处理', 'amber', 25], ['doc.status', '已通过', '已通过', 'green', 26],
  ['doc.status', '未触发', '未触发', 'gray', 27], ['doc.status', '已终止', '已终止', 'red', 28], ['doc.status', '审批中', '审批中', 'blue', 29],
  ['doc.status', '未到货', '未到货', 'amber', 30], ['doc.status', '全部到货', '全部到货', 'green', 31], ['doc.status', '让步接收', '让步接收', 'amber', 32],
  ['doc.status', '已确认', '已确认', 'green', 33], ['doc.status', '已批准', '已批准', 'green', 34], ['doc.status', '待批准', '待批准', 'amber', 35],
].map(r => [q(r[0]), q(r[1]), q(r[2]), q(r[3]), r[4]]));
insert('sys_dict_column', ['table_name', 'column_name', 'dict_code'], [
  ['finance_receivable_main', 'status', 'doc.status'], ['finance_payable_main', 'status', 'doc.status'],
  ['oa_approval_main', 'approval_status', 'doc.status'], ['oa_flow_task', 'task_status', 'doc.status'],
  ['oa_flow_instance', 'instance_status', 'doc.status'], ['hr_salary_main', 'status', 'doc.status'],
  ['hr_employee_main', 'emp_status', 'doc.status'], ['prod_work_order', 'order_status', 'doc.status'],
  ['prod_scrap_main', 'status', 'doc.status'], ['quality_inspection_main', 'result', 'doc.status'],
  ['quality_inspection_main', 'status', 'doc.status'], ['trade_purchase_main', 'arrival_status', 'doc.status'],
  ['finance_income_main', 'status', 'doc.status'], ['finance_expense_main', 'status', 'doc.status'],
  ['hr_attendance_leave', 'status', 'doc.status'],
].map(r => [q(r[0]), q(r[1]), q(r[2])]));

emit('');
emit('-- 演示数据加载完成');

// ── 写文件 ──
const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'backend', 'src', 'main', 'resources', 'demo-data', 'demo_data.sql');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, out.join('\n') + '\n', 'utf8');
console.log(`✅ 生成完成: ${target}`);
console.log(`   销售单 ${sales.length} | 采购单 ${purchases.length} | 工单 ${workOrders.length} | 凭证 ${vzRows.length} | 库存流水 ${moves.length} | 员工 ${employees.length}`);

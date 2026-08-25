-- ============================================================
-- ERP 数据模型补丁脚本 v3 (upgrade3.sql) —— 幂等，可重复加载
-- 依赖：先加载 init.sql + upgrade.sql + upgrade2.sql
-- 内容：补齐业务代码依赖、但基础建表脚本缺失的列
--   1) trade_sales_main.warehouse / shipping_status   —— 销售出库联动
--   2) trade_purchase_main.warehouse / arrival_status —— 采购入库联动
--   3) trade_purchase_detail.recv_qty                 —— MRP 在途量精确计算
-- ============================================================
SET NAMES utf8mb4;
USE erp_system;

SET @c1 = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='trade_sales_main' AND column_name='warehouse');
SET @s1 = IF(@c1=0, 'ALTER TABLE trade_sales_main ADD COLUMN warehouse VARCHAR(50) DEFAULT ''默认仓'' COMMENT ''出库仓库''', 'SELECT 1'); PREPARE st1 FROM @s1; EXECUTE st1; DEALLOCATE PREPARE st1;

SET @c2 = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='trade_sales_main' AND column_name='shipping_status');
SET @s2 = IF(@c2=0, 'ALTER TABLE trade_sales_main ADD COLUMN shipping_status VARCHAR(20) DEFAULT ''未发货'' COMMENT ''发货状态''', 'SELECT 1'); PREPARE st2 FROM @s2; EXECUTE st2; DEALLOCATE PREPARE st2;

SET @c3 = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='trade_purchase_main' AND column_name='warehouse');
SET @s3 = IF(@c3=0, 'ALTER TABLE trade_purchase_main ADD COLUMN warehouse VARCHAR(50) DEFAULT ''默认仓'' COMMENT ''入库仓库''', 'SELECT 1'); PREPARE st3 FROM @s3; EXECUTE st3; DEALLOCATE PREPARE st3;

SET @c4 = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='trade_purchase_main' AND column_name='arrival_status');
SET @s4 = IF(@c4=0, 'ALTER TABLE trade_purchase_main ADD COLUMN arrival_status VARCHAR(20) DEFAULT ''未到货'' COMMENT ''到货状态''', 'SELECT 1'); PREPARE st4 FROM @s4; EXECUTE st4; DEALLOCATE PREPARE st4;

SET @c5 = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='trade_purchase_detail' AND column_name='recv_qty');
SET @s5 = IF(@c5=0, 'ALTER TABLE trade_purchase_detail ADD COLUMN recv_qty DECIMAL(18,4) DEFAULT 0 COMMENT ''已到货数量''', 'SELECT 1'); PREPARE st5 FROM @s5; EXECUTE st5; DEALLOCATE PREPARE st5;

-- BOM 结构补全父子件关系列（旧行无 parent_code 时按 product_code 兼容匹配）
SET @c6 = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='prod_bom_structure' AND column_name='parent_code');
SET @s6 = IF(@c6=0, 'ALTER TABLE prod_bom_structure ADD COLUMN parent_code VARCHAR(50) COMMENT ''父件编码''', 'SELECT 1'); PREPARE st6 FROM @s6; EXECUTE st6; DEALLOCATE PREPARE st6;

SET @c7 = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='prod_bom_structure' AND column_name='component_code');
SET @s7 = IF(@c7=0, 'ALTER TABLE prod_bom_structure ADD COLUMN component_code VARCHAR(50) COMMENT ''子件编码''', 'SELECT 1'); PREPARE st7 FROM @s7; EXECUTE st7; DEALLOCATE PREPARE st7;

SET @i1 = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='prod_bom_structure' AND index_name='idx_pbs_parent');
SET @si1 = IF(@i1=0, 'CREATE INDEX idx_pbs_parent ON prod_bom_structure(parent_code)', 'SELECT 1'); PREPARE sti1 FROM @si1; EXECUTE sti1; DEALLOCATE PREPARE sti1;

-- ── 批次追溯：批次台账 + 耗用记录（正反向追溯的数据基座） ──
CREATE TABLE IF NOT EXISTS trade_batch_trace (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  batch_no VARCHAR(50) COMMENT '批次号',
  product_code VARCHAR(50) COMMENT '物料/产品编码',
  product_name VARCHAR(100) COMMENT '名称',
  batch_type VARCHAR(20) COMMENT '采购批次/生产批次',
  qty DECIMAL(18,4) COMMENT '入库数量',
  remain_qty DECIMAL(18,4) COMMENT '剩余数量',
  source_no VARCHAR(50) COMMENT '来源单号（采购单/工单）',
  supplier_code VARCHAR(50), supplier_name VARCHAR(100),
  work_order_no VARCHAR(50),
  component_batches TEXT COMMENT '生产批次耗用的原料批次(JSON数组)',
  in_date DATE,
  status VARCHAR(20) DEFAULT '在库',
  remark TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_batch_consume (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  batch_no VARCHAR(50) COMMENT '被耗用批次',
  product_code VARCHAR(50),
  consume_qty DECIMAL(18,4) COMMENT '耗用数量',
  target_no VARCHAR(50) COMMENT '去向单号（销售单/工单）',
  target_type VARCHAR(20) COMMENT '销售出库/生产领料',
  consume_date DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 物料编码规则（行业特色：电子智造，分类前缀+流水号） ──
CREATE TABLE IF NOT EXISTS sys_code_rule (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  rule_code VARCHAR(30) COMMENT '规则编码',
  rule_name VARCHAR(50) COMMENT '规则名称',
  prefix VARCHAR(20) COMMENT '编码前缀',
  category VARCHAR(30) COMMENT '物料分类',
  seq_length INT DEFAULT 4 COMMENT '流水号位数',
  description VARCHAR(200),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO sys_code_rule(rule_code, rule_name, prefix, category, seq_length, description) VALUES
('FG',  '成品编码',     'FG-',  '成品',     3, '智能硬件成品：FG-001 智能工业网关'),
('IC',  '芯片类',       'IC-',  '芯片',     4, '主控/存储芯片：IC-0001 主控芯片STM32F4'),
('MOD', '模组类',       'MOD-', '通信模组', 4, '通信/功能模组：MOD-0001 4G通信模组'),
('PCB', '电路板类',     'PCB-', '电路板',   4, 'PCB裸板/成品板：PCB-0001 PCB四层主板'),
('PWR', '电源类',       'PWR-', '电源器件', 4, '电源模块/电池：PWR-0001 工业电源模块'),
('ENC', '结构件类',     'ENC-', '结构件',   4, '外壳/散热/支架：ENC-0001 铝合金外壳'),
('DSP', '显示类',       'DSP-', '显示器件', 4, '屏幕/指示灯：DSP-0001 3.5寸触控显示屏'),
('CON', '连接件类',     'CON-', '连接器件', 4, '端子/线缆/插座：CON-0001 接线端子组件'),
('SEN', '传感器类',     'SEN-', '传感元件', 4, '温度/湿度/压力：SEN-0001 高精度温度探头'),
('ISO', '隔离器件类',   'ISO-', '隔离器件', 4, '隔离器/保护器：ISO-0001 信号隔离器'),
('PKG', '包装辅料类',   'PKG-', '包装辅料', 4, '包装箱/标签：PKG-0001 防震包装箱'),
('FST', '紧固件类',     'FST-', '紧固件',   4, '螺丝/螺母/垫片：FST-0001 不锈钢螺丝包');

-- ── 多仓库管理：仓库主数据 ──
CREATE TABLE IF NOT EXISTS trade_warehouse_main (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  warehouse_code VARCHAR(50) COMMENT '仓库编码',
  warehouse_name VARCHAR(100) COMMENT '仓库名称',
  warehouse_type VARCHAR(30) COMMENT '原料仓/成品仓/综合仓',
  manager VARCHAR(50) COMMENT '仓管员',
  location VARCHAR(200) COMMENT '库区位置',
  status VARCHAR(20) DEFAULT '启用',
  remark TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO sys_table_registry(table_name, cn_name, module, sub_module, sort_no) VALUES
('trade_warehouse_main','仓库主数据','进销存管理','仓储设置',903);

INSERT IGNORE INTO sys_dict_column(table_name, column_name, dict_code) VALUES
('trade_warehouse_main','status','common.enable');

-- ── 销售目标管理 ──
CREATE TABLE IF NOT EXISTS trade_sales_target (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  target_month VARCHAR(10) COMMENT '目标月份 yyyy-MM',
  salesperson VARCHAR(50) COMMENT '销售人员',
  target_amount DECIMAL(18,2) COMMENT '目标金额',
  remark TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 合同管理 ──
CREATE TABLE IF NOT EXISTS cust_contract_main (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  contract_no VARCHAR(50) COMMENT '合同编号',
  contract_name VARCHAR(200) COMMENT '合同名称',
  contract_type VARCHAR(30) COMMENT '销售合同/采购合同/框架协议',
  party_name VARCHAR(100) COMMENT '对方单位',
  amount DECIMAL(18,2) COMMENT '合同金额',
  sign_date DATE,
  start_date DATE,
  end_date DATE,
  owner VARCHAR(50) COMMENT '负责人',
  status VARCHAR(20) DEFAULT '执行中',
  remark TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO sys_table_registry(table_name, cn_name, module, sub_module, sort_no) VALUES
('trade_sales_target','销售目标','进销存管理','销售管理',904),
('cust_contract_main','合同管理','客户供应商','合同档案',905);

INSERT IGNORE INTO sys_dict_item(dict_code, item_value, item_label, color, sort_no) VALUES
('doc.status','草稿','草稿','gray',39),
('doc.status','执行中','执行中','blue',40),
('doc.status','已完结','已完结','green',41),
('doc.status','已终止','已终止','red',42);

INSERT IGNORE INTO sys_dict_column(table_name, column_name, dict_code) VALUES
('cust_contract_main','status','doc.status');

-- ── 库存盘点单：补充商品维度列（原表为仓级汇总结构） ──
SET @c8 = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='trade_stock_check' AND column_name='product_code');
SET @s8 = IF(@c8=0, 'ALTER TABLE trade_stock_check ADD COLUMN product_code VARCHAR(50) COMMENT ''盘点商品编码''', 'SELECT 1'); PREPARE st8 FROM @s8; EXECUTE st8; DEALLOCATE PREPARE st8;
SET @c9 = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='trade_stock_check' AND column_name='product_name');
SET @s9 = IF(@c9=0, 'ALTER TABLE trade_stock_check ADD COLUMN product_name VARCHAR(100) COMMENT ''盘点商品名称''', 'SELECT 1'); PREPARE st9 FROM @s9; EXECUTE st9; DEALLOCATE PREPARE st9;

INSERT IGNORE INTO sys_table_registry(table_name, cn_name, module, sub_module, sort_no) VALUES
('trade_stock_check','库存盘点单','进销存管理','盘点管理',906);

INSERT IGNORE INTO sys_dict_column(table_name, column_name, dict_code) VALUES
('trade_stock_check','status','doc.status');

-- ── 操作回收站：删除前自动归档，可一键恢复 ──
CREATE TABLE IF NOT EXISTS sys_deleted_backup (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  table_name VARCHAR(64) COMMENT '原表名',
  row_id BIGINT COMMENT '原记录ID',
  row_data LONGTEXT COMMENT '完整行数据JSON',
  deleted_by VARCHAR(50),
  deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO sys_table_registry(table_name, cn_name, module, sub_module, sort_no) VALUES
('sys_deleted_backup','操作回收站','系统维护','数据安全',912);

-- ── 多公司/多账套：公司主数据（全局公司上下文的基础） ──
CREATE TABLE IF NOT EXISTS sys_company (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_code VARCHAR(50) COMMENT '公司编码',
  company_name VARCHAR(100) COMMENT '公司全称',
  short_name VARCHAR(50) COMMENT '简称',
  tax_no VARCHAR(50) COMMENT '税号',
  address VARCHAR(200),
  status VARCHAR(20) DEFAULT '启用',
  is_default INT DEFAULT 0 COMMENT '默认公司 1=是',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_company_code (company_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO sys_table_registry(table_name, cn_name, module, sub_module, sort_no) VALUES
('sys_company','公司档案','系统维护','组织架构',911);

INSERT IGNORE INTO sys_dict_column(table_name, column_name, dict_code) VALUES
('sys_company','status','common.enable');

INSERT IGNORE INTO sys_company(company_code, company_name, short_name, tax_no, address, status, is_default) VALUES
('HQ', '三包智联科技有限公司', '三包智联', '91310000MA1FL8XQ0A', '上海市松江区茸江路88号', '启用', 1),
('SZ-01', '深圳智造分公司', '深圳智造', '91440300MA5FQK7B2C', '深圳市南山区科技园南区12栋', '启用', 0);

-- ── 凭证公司维度：按公司（账套）归档凭证 ──
SET @c10 = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='voucher_main' AND column_name='company_code');
SET @s10 = IF(@c10=0, "ALTER TABLE voucher_main ADD COLUMN company_code VARCHAR(50) DEFAULT 'HQ' COMMENT '公司编码（账套）'", 'SELECT 1'); PREPARE st10 FROM @s10; EXECUTE st10; DEALLOCATE PREPARE st10;

-- ── 部门月度预算（费用审批超预算拦截的依据） ──
CREATE TABLE IF NOT EXISTS oa_budget (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  department VARCHAR(50) COMMENT '部门',
  budget_month VARCHAR(10) COMMENT '预算月份 yyyy-MM',
  budget_amount DECIMAL(18,2) COMMENT '预算金额',
  remark TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_dept_month (department, budget_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO sys_table_registry(table_name, cn_name, module, sub_module, sort_no) VALUES
('oa_budget','部门预算','协同办公','预算管理',913);

-- ── 批次成本：FIFO 先进先出成本法需要批次入库单价 ──
SET @c11 = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='trade_batch_trace' AND column_name='unit_cost');
SET @s11 = IF(@c11=0, 'ALTER TABLE trade_batch_trace ADD COLUMN unit_cost DECIMAL(18,4) DEFAULT 0 COMMENT ''批次入库单价（FIFO成本法）''', 'SELECT 1'); PREPARE st11 FROM @s11; EXECUTE st11; DEALLOCATE PREPARE st11;

-- 报价单状态字典
INSERT IGNORE INTO sys_dict_item(dict_code, item_value, item_label, color, sort_no) VALUES
('doc.status','已报价','已报价','blue',43),
('doc.status','已转订单','已转订单','green',44);

INSERT IGNORE INTO sys_dict_column(table_name, column_name, dict_code) VALUES
('prod_quotation','audit_status','doc.status'),
('trade_sales_return','status','doc.status');

INSERT IGNORE INTO sys_table_registry(table_name, cn_name, module, sub_module, sort_no) VALUES
('trade_sales_return','销售退货单','进销存管理','销售管理',914);

-- ── 凭证模板：常用分录一键调用 ──
CREATE TABLE IF NOT EXISTS finance_voucher_template (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  template_name VARCHAR(100) COMMENT '模板名称',
  description VARCHAR(200) COMMENT '用途说明',
  lines_json LONGTEXT COMMENT '分录行JSON [{subject_code,subject_name,debit_amount,credit_amount,summary}]',
  created_by VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_vt_name (template_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO sys_table_registry(table_name, cn_name, module, sub_module, sort_no) VALUES
('finance_voucher_template','凭证模板','财务管理','凭证模板',915);

-- ── 附件管理：任意业务单据可挂载图片/文件附件 ──
CREATE TABLE IF NOT EXISTS sys_attachment (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ref_table VARCHAR(64) COMMENT '关联业务表',
  ref_no VARCHAR(64) COMMENT '关联单据号',
  file_name VARCHAR(200) COMMENT '原始文件名',
  file_type VARCHAR(50) COMMENT 'MIME 类型',
  file_size BIGINT DEFAULT 0 COMMENT '字节数',
  file_data LONGBLOB COMMENT '文件内容',
  uploaded_by VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_att_ref (ref_table, ref_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO sys_table_registry(table_name, cn_name, module, sub_module, sort_no) VALUES
('sys_attachment','附件管理','系统维护','附件管理',916);

INSERT IGNORE INTO finance_voucher_template(template_name, description, lines_json, created_by) VALUES
('提现备用金', '从银行提取现金作为备用金（借:1001 库存现金 / 贷:1002 银行存款）',
 '[{"subject_code":"1001","subject_name":"库存现金","debit_amount":5000,"credit_amount":0,"summary":"提现备用金"},{"subject_code":"1002","subject_name":"银行存款","debit_amount":0,"credit_amount":5000,"summary":"提现备用金"}]', '系统'),
('支付办公费用', '以银行存款支付办公费用（借:6602 管理费用 / 贷:1002 银行存款）',
 '[{"subject_code":"6602","subject_name":"管理费用","debit_amount":2000,"credit_amount":0,"summary":"办公费用"},{"subject_code":"1002","subject_name":"银行存款","debit_amount":0,"credit_amount":2000,"summary":"支付办公费用"}]', '系统'),
('股东追加投资', '收到股东追加投资款（借:1002 银行存款 / 贷:4001 实收资本）',
 '[{"subject_code":"1002","subject_name":"银行存款","debit_amount":100000,"credit_amount":0,"summary":"收到投资款"},{"subject_code":"4001","subject_name":"实收资本","debit_amount":0,"credit_amount":100000,"summary":"股东追加投资"}]', '系统'),
('计提本月折旧', '计提固定资产折旧（借:6602 管理费用 / 贷:1602 累计折旧）',
 '[{"subject_code":"6602","subject_name":"管理费用","debit_amount":3500,"credit_amount":0,"summary":"计提折旧"},{"subject_code":"1602","subject_name":"累计折旧","debit_amount":0,"credit_amount":3500,"summary":"计提折旧"}]', '系统');

-- ── 总账按公司隔离：科目余额增加公司维度 ──
SET @c12 = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='account_subject_balance' AND column_name='company_code');
SET @s12 = IF(@c12=0, "ALTER TABLE account_subject_balance ADD COLUMN company_code VARCHAR(50) DEFAULT 'HQ' COMMENT '公司编码（账套）'", 'SELECT 1'); PREPARE st12 FROM @s12; EXECUTE st12; DEALLOCATE PREPARE st12;
UPDATE account_subject_balance SET company_code='HQ' WHERE company_code IS NULL;
SET @i2 = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='account_subject_balance' AND index_name='idx_asb_company');
SET @si2 = IF(@i2=0, 'CREATE INDEX idx_asb_company ON account_subject_balance(company_code, period, subject_code)', 'SELECT 1'); PREPARE sti2 FROM @si2; EXECUTE sti2; DEALLOCATE PREPARE sti2;

-- 批次/编码规则表注册进通用菜单与字典
INSERT IGNORE INTO sys_table_registry(table_name, cn_name, module, sub_module, sort_no) VALUES
('trade_batch_trace','批次追溯台账','进销存管理','批次追溯',901),
('trade_batch_consume','批次耗用记录','进销存管理','批次追溯',902),
('sys_code_rule','物料编码规则','系统维护','编码规则',910);

INSERT IGNORE INTO sys_dict_item(dict_code, item_value, item_label, color, sort_no) VALUES
('doc.status','在库','在库','green',36),
('doc.status','已耗用','已耗用','gray',37),
('doc.status','已记账','已记账','blue',38);

INSERT IGNORE INTO sys_dict_column(table_name, column_name, dict_code) VALUES
('trade_batch_trace','status','doc.status');

-- 状态列字典绑定补齐（前端彩色签 & 写入口校验）
INSERT IGNORE INTO sys_dict_column(table_name, column_name, dict_code) VALUES
('trade_sales_main','shipping_status','doc.status');

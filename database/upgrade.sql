-- ============================================================
-- 补充业务表 + 索引优化（全部使用 IF NOT EXISTS）
-- 覆盖：质量/协同办公/设备/售后/报表等模块
-- ============================================================
SET NAMES utf8mb4;
USE erp_system;

-- ===== 补充生产模块 =====
CREATE TABLE IF NOT EXISTS prod_outsource_order (id BIGINT AUTO_INCREMENT PRIMARY KEY, outsource_no VARCHAR(50), ref_work_order VARCHAR(50), product_code VARCHAR(50), product_name VARCHAR(100), outsource_qty DECIMAL(18,4), complete_qty DECIMAL(18,4), supplier_code VARCHAR(50), supplier_name VARCHAR(100), unit_price DECIMAL(18,4), amount DECIMAL(18,2), send_date DATE, req_complete_date DATE, outsource_status VARCHAR(30), handler VARCHAR(50), created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS prod_process_transfer (id BIGINT AUTO_INCREMENT PRIMARY KEY, transfer_no VARCHAR(50), work_order_no VARCHAR(50), product_code VARCHAR(50), product_name VARCHAR(100), from_process VARCHAR(50), to_process VARCHAR(50), transfer_qty DECIMAL(18,4), defect_qty DECIMAL(18,4), transfer_date DATE, from_team VARCHAR(50), to_team VARCHAR(50), from_person VARCHAR(50), to_person VARCHAR(50), qc_result VARCHAR(30), remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS prod_scrap_main (id BIGINT AUTO_INCREMENT PRIMARY KEY, scrap_no VARCHAR(50), work_order_no VARCHAR(50), product_code VARCHAR(50), product_name VARCHAR(100), scrap_qty DECIMAL(18,4), scrap_reason TEXT, handler VARCHAR(50), scrap_date DATE, status VARCHAR(20), remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS prod_rework_main (id BIGINT AUTO_INCREMENT PRIMARY KEY, rework_no VARCHAR(50), work_order_no VARCHAR(50), product_code VARCHAR(50), product_name VARCHAR(100), rework_qty DECIMAL(18,4), rework_reason TEXT, handler VARCHAR(50), status VARCHAR(20), remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;

-- ===== 补充质量模块 =====
CREATE TABLE IF NOT EXISTS quality_outgoing (id BIGINT AUTO_INCREMENT PRIMARY KEY, inspection_no VARCHAR(50), sales_no VARCHAR(50), customer_name VARCHAR(100), product_code VARCHAR(50), product_name VARCHAR(100), inspect_qty INT, pass_qty INT, fail_qty INT, result VARCHAR(20), inspector VARCHAR(50), inspection_date DATE, status VARCHAR(20), remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS quality_process (id BIGINT AUTO_INCREMENT PRIMARY KEY, inspection_no VARCHAR(50), work_order_no VARCHAR(50), product_code VARCHAR(50), product_name VARCHAR(100), process_name VARCHAR(50), sample_qty INT, pass_qty INT, result VARCHAR(20), inspector VARCHAR(50), inspection_date DATE, status VARCHAR(20), remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS quality_final (id BIGINT AUTO_INCREMENT PRIMARY KEY, inspection_no VARCHAR(50), work_order_no VARCHAR(50), product_code VARCHAR(50), product_name VARCHAR(100), inspect_qty INT, pass_qty INT, fail_qty INT, result VARCHAR(20), inspector VARCHAR(50), inspection_date DATE, status VARCHAR(20), remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS quality_defect_main (id BIGINT AUTO_INCREMENT PRIMARY KEY, defect_no VARCHAR(50), product_code VARCHAR(50), product_name VARCHAR(100), defect_type VARCHAR(30), defect_qty INT, defect_reason TEXT, handler VARCHAR(50), handle_method VARCHAR(50), status VARCHAR(20), remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;

-- ===== 补充 OA 模块 =====
CREATE TABLE IF NOT EXISTS oa_flow_instance (id BIGINT AUTO_INCREMENT PRIMARY KEY, instance_no VARCHAR(50), workflow_code VARCHAR(50), applicant VARCHAR(50), start_date DATE, current_node VARCHAR(50), instance_status VARCHAR(20), remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS oa_flow_task (id BIGINT AUTO_INCREMENT PRIMARY KEY, task_no VARCHAR(50), instance_no VARCHAR(50), task_name VARCHAR(100), assignee VARCHAR(50), create_date DATE, complete_date DATE, task_status VARCHAR(20), remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS oa_flow_log (id BIGINT AUTO_INCREMENT PRIMARY KEY, log_no VARCHAR(50), instance_no VARCHAR(50), operator VARCHAR(50), action VARCHAR(30), action_date DATE, comment TEXT, remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS oa_schedule_main (id BIGINT AUTO_INCREMENT PRIMARY KEY, schedule_no VARCHAR(50), title VARCHAR(200), schedule_date DATE, start_time VARCHAR(10), end_time VARCHAR(10), organizer VARCHAR(50), location VARCHAR(100), status VARCHAR(20), remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;

-- ===== 补充设备管理 =====
CREATE TABLE IF NOT EXISTS equip_spare_parts (id BIGINT AUTO_INCREMENT PRIMARY KEY, spare_code VARCHAR(50), spare_name VARCHAR(100), equip_code VARCHAR(50), qty INT, unit_price DECIMAL(18,2), supplier VARCHAR(50), min_stock INT, remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS equip_repair_record (id BIGINT AUTO_INCREMENT PRIMARY KEY, repair_no VARCHAR(50), equip_code VARCHAR(50), equip_name VARCHAR(100), fault_desc TEXT, repair_date DATE, repair_company VARCHAR(100), repair_cost DECIMAL(18,2), status VARCHAR(20), remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS equip_iot_card (id BIGINT AUTO_INCREMENT PRIMARY KEY, card_no VARCHAR(50), iccid VARCHAR(50), carrier VARCHAR(30), plan_name VARCHAR(100), card_status VARCHAR(20), activate_date DATE, expiry_date DATE, bind_device VARCHAR(50), remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;

-- ===== 补充售后管理 =====
CREATE TABLE IF NOT EXISTS aftersale_claim (id BIGINT AUTO_INCREMENT PRIMARY KEY, claim_no VARCHAR(50), service_no VARCHAR(50), customer_name VARCHAR(100), claim_type VARCHAR(30), claim_amount DECIMAL(18,2), claim_date DATE, status VARCHAR(20), handler VARCHAR(50), remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS aftersale_warranty (id BIGINT AUTO_INCREMENT PRIMARY KEY, warranty_no VARCHAR(50), service_no VARCHAR(50), device_name VARCHAR(100), warranty_start DATE, warranty_end DATE, warranty_type VARCHAR(30), status VARCHAR(20), remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;

-- ===== 补充报表中心 =====
CREATE TABLE IF NOT EXISTS rpt_sales_monthly (id BIGINT AUTO_INCREMENT PRIMARY KEY, report_month VARCHAR(10), product_code VARCHAR(50), product_name VARCHAR(100), sales_qty DECIMAL(18,4), sales_amount DECIMAL(18,2), cost_amount DECIMAL(18,2), gross_profit DECIMAL(18,2), gross_rate DECIMAL(10,4), remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS rpt_purchase_monthly (id BIGINT AUTO_INCREMENT PRIMARY KEY, report_month VARCHAR(10), supplier_name VARCHAR(100), purchase_qty DECIMAL(18,4), purchase_amount DECIMAL(18,2), paid_amount DECIMAL(18,2), unpaid_amount DECIMAL(18,2), remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS rpt_finance_income (id BIGINT AUTO_INCREMENT PRIMARY KEY, report_month VARCHAR(10), income_type VARCHAR(30), amount DECIMAL(18,2), remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;

-- ===== 补充财务 =====
CREATE TABLE IF NOT EXISTS finance_internal_account (id BIGINT AUTO_INCREMENT PRIMARY KEY, account_no VARCHAR(50), account_type VARCHAR(30), ref_no VARCHAR(50), counterparty VARCHAR(100), amount DECIMAL(18,2), cost DECIMAL(18,2), profit DECIMAL(18,2), internal_status VARCHAR(20), account_date DATE, remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS finance_tax_main (id BIGINT AUTO_INCREMENT PRIMARY KEY, tax_no VARCHAR(50), tax_type VARCHAR(30), tax_period VARCHAR(10), taxable_amount DECIMAL(18,2), tax_rate DECIMAL(10,4), tax_amount DECIMAL(18,2), status VARCHAR(20), remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;

-- ===== 补充 OA-审批 =====
CREATE TABLE IF NOT EXISTS oa_expense_approval (id BIGINT AUTO_INCREMENT PRIMARY KEY, approval_no VARCHAR(50), expense_type VARCHAR(30), amount DECIMAL(18,2), applicant VARCHAR(50), approver VARCHAR(50), approval_status VARCHAR(20), remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;

-- 兼容已部署环境：给 oa_approval_main 补 ref_no / amount 两列，给 finance_invoice_main 补 invoice_image 发票图片列（init.sql 新建库已含）
SET @c1 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='oa_approval_main' AND COLUMN_NAME='ref_no');
SET @s1 = IF(@c1=0, 'ALTER TABLE oa_approval_main ADD COLUMN ref_no VARCHAR(50)', 'SELECT 1'); PREPARE st1 FROM @s1; EXECUTE st1; DEALLOCATE PREPARE st1;
SET @c2 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='oa_approval_main' AND COLUMN_NAME='amount');
SET @s2 = IF(@c2=0, 'ALTER TABLE oa_approval_main ADD COLUMN amount DECIMAL(18,2)', 'SELECT 1'); PREPARE st2 FROM @s2; EXECUTE st2; DEALLOCATE PREPARE st2;
SET @c_inv = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='finance_invoice_main' AND COLUMN_NAME='invoice_image');
SET @s_inv = IF(@c_inv=0, 'ALTER TABLE finance_invoice_main ADD COLUMN invoice_image LONGTEXT', 'SELECT 1'); PREPARE st_inv FROM @s_inv; EXECUTE st_inv; DEALLOCATE PREPARE st_inv;
CREATE TABLE IF NOT EXISTS oa_leave_approval (id BIGINT AUTO_INCREMENT PRIMARY KEY, approval_no VARCHAR(50), emp_name VARCHAR(50), leave_type VARCHAR(30), start_date DATE, end_date DATE, leave_days DECIMAL(5,1), approver VARCHAR(50), approval_status VARCHAR(20), remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;

-- ===== 数据库性能索引 =====
CREATE INDEX idx_cust_code ON cust_customer_main(customer_code);
CREATE INDEX idx_prod_code ON trade_inventory_balance(product_code);
CREATE INDEX idx_inv_wh ON trade_inventory_balance(warehouse);
CREATE INDEX idx_in_no ON trade_stock_in_detail(in_no);
CREATE INDEX idx_out_no ON trade_stock_out_detail(out_no);
CREATE INDEX idx_sales_no ON trade_sales_main(sales_no);
CREATE INDEX idx_purchase_no ON trade_purchase_main(purchase_no);
CREATE INDEX idx_voucher_no ON voucher_main(voucher_no);
CREATE INDEX idx_user_status ON sys_user(status);
CREATE INDEX idx_emp_no ON hr_employee_main(emp_no);
CREATE INDEX idx_log_user ON sys_log_operation(username);

-- ============================================================
-- 财务模版系统
-- ============================================================
CREATE TABLE IF NOT EXISTS fin_template (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  company VARCHAR(30) DEFAULT '通用',
  category VARCHAR(20) NOT NULL,
  instance_mode VARCHAR(10) NOT NULL DEFAULT 'multi',
  field_schema TEXT,
  cell_map TEXT,
  template_file LONGBLOB,
  created_by VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fin_instance (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT NOT NULL,
  title VARCHAR(200) NOT NULL,
  data MEDIUMTEXT,
  period VARCHAR(10),
  created_by VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fin_inst_tpl (template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fin_template_perm (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  template_id BIGINT NOT NULL,
  can_view TINYINT(1) NOT NULL DEFAULT 0,
  can_download TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_user_tpl (user_id, template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO fin_template (code, name, company, category, instance_mode, field_schema, cell_map, created_by) VALUES
('inv_semifinished', '半成品-成品统计表', '川蓉', 'inventory', 'single',
 '{"type":"grid","columns":[{"key":"product_name","label":"商品名称","kind":"text"},{"key":"last_year_stock","label":"上年库存","kind":"number"},{"key":"assemble_qty","label":"装配数量","kind":"number"},{"key":"out_total","label":"成品出库总量","kind":"number"},{"key":"remain_stock","label":"剩余库存","kind":"number"},{"key":"m1_assemble","label":"1月装配","group":"1月","kind":"number"},{"key":"m1_out","label":"1月出库","group":"1月","kind":"number"},{"key":"m2_assemble","label":"2月装配","group":"2月","kind":"number"},{"key":"m2_out","label":"2月出库","group":"2月","kind":"number"},{"key":"m3_assemble","label":"3月装配","group":"3月","kind":"number"},{"key":"m3_out","label":"3月出库","group":"3月","kind":"number"},{"key":"m4_assemble","label":"4月装配","group":"4月","kind":"number"},{"key":"m4_out","label":"4月出库","group":"4月","kind":"number"},{"key":"m5_assemble","label":"5月装配","group":"5月","kind":"number"},{"key":"m5_out","label":"5月出库","group":"5月","kind":"number"},{"key":"m6_assemble","label":"6月装配","group":"6月","kind":"number"},{"key":"m6_out","label":"6月出库","group":"6月","kind":"number"},{"key":"m7_assemble","label":"7月装配","group":"7月","kind":"number"},{"key":"m7_out","label":"7月出库","group":"7月","kind":"number"},{"key":"m8_assemble","label":"8月装配","group":"8月","kind":"number"},{"key":"m8_out","label":"8月出库","group":"8月","kind":"number"},{"key":"m9_assemble","label":"9月装配","group":"9月","kind":"number"},{"key":"m9_out","label":"9月出库","group":"9月","kind":"number"},{"key":"m10_assemble","label":"10月装配","group":"10月","kind":"number"},{"key":"m10_out","label":"10月出库","group":"10月","kind":"number"},{"key":"m11_assemble","label":"11月装配","group":"11月","kind":"number"},{"key":"m11_out","label":"11月出库","group":"11月","kind":"number"},{"key":"m12_assemble","label":"12月装配","group":"12月","kind":"number"},{"key":"m12_out","label":"12月出库","group":"12月","kind":"number"}]}',
 '{"startRow":4,"cols":{"product_name":"A","last_year_stock":"B","assemble_qty":"C","out_total":"D","remain_stock":"E","m1_assemble":"F","m1_out":"G","m2_assemble":"H","m2_out":"I","m3_assemble":"J","m3_out":"K","m4_assemble":"L","m4_out":"M","m5_assemble":"N","m5_out":"O","m6_assemble":"P","m6_out":"Q","m7_assemble":"R","m7_out":"S","m8_assemble":"T","m8_out":"U","m9_assemble":"V","m9_out":"W","m10_assemble":"X","m10_out":"Y","m11_assemble":"Z","m11_out":"AA","m12_assemble":"AB","m12_out":"AC"}}',
 'system'),
('inv_finished', '成品出入库统计表', '川蓉', 'inventory', 'single',
 '{"type":"grid","columns":[{"key":"product_name","label":"商品名称","kind":"text"},{"key":"last_month_stock","label":"上月库存","kind":"number"},{"key":"in_total","label":"入库总量","kind":"number"},{"key":"out_total","label":"出库总量","kind":"number"},{"key":"remain_stock","label":"剩余库存","kind":"number"},{"key":"warn_std","label":"预警标准","kind":"number"},{"key":"stock_status","label":"库存状态","kind":"text"}]}',
 '{"startRow":4,"cols":{"product_name":"A","last_month_stock":"B","in_total":"C","out_total":"D","remain_stock":"E","warn_std":"F","stock_status":"G"}}',
 'system'),
('inv_material', '原材料出入库统计表', '川蓉', 'inventory', 'single',
 '{"type":"grid","columns":[{"key":"product_name","label":"商品名称","kind":"text"},{"key":"last_month_stock","label":"上月库存","kind":"number"},{"key":"in_total","label":"入库总量","kind":"number"},{"key":"out_total","label":"出库总量","kind":"number"},{"key":"remain_stock","label":"剩余库存","kind":"number"},{"key":"warn_std","label":"预警标准","kind":"number"},{"key":"stock_status","label":"库存状态","kind":"text"}]}',
 '{"startRow":4,"cols":{"product_name":"A","last_month_stock":"B","in_total":"C","out_total":"D","remain_stock":"E","warn_std":"F","stock_status":"G"}}',
 'system'),
('pay_chengbo', '付款申请表-成博', '成博', 'payment', 'multi',
 '{"type":"form","scalars":[{"key":"contract_name","label":"合同名称","kind":"text"},{"key":"contract_no","label":"合同编号","kind":"text"},{"key":"pay_unit","label":"付款单位","kind":"text"},{"key":"recv_name","label":"收款单位名称","kind":"text"},{"key":"recv_bank","label":"开户行","kind":"text"},{"key":"recv_account","label":"账号","kind":"text"},{"key":"pay_method","label":"付款方式","kind":"text"},{"key":"pay_total","label":"本次支付合计","kind":"number"},{"key":"pay_total_cn","label":"大写","kind":"text"}],"detail":{"key":"items","fields":[{"key":"goods_name","label":"货物名称","kind":"text"},{"key":"factory","label":"厂家","kind":"text"},{"key":"model","label":"型号","kind":"text"},{"key":"qty","label":"数量","kind":"number"},{"key":"unit","label":"单位","kind":"text"},{"key":"unit_price","label":"单价","kind":"number"},{"key":"subtotal","label":"小计","kind":"number"},{"key":"remark","label":"备注","kind":"text"}]}}',
 '{"scalars":{"contract_name":"C2","contract_no":"C3","pay_unit":"C4","recv_name":"C5","recv_bank":"C6","recv_account":"C7","pay_method":"J7","pay_total":"C8","pay_total_cn":"C15"},"detail":{"startRow":10,"cols":{"goods_name":"B","factory":"C","model":"D","qty":"E","unit":"F","unit_price":"G","subtotal":"H","remark":"I"}}}',
 'system'),
('pay_chuanrong', '付款申请表-川蓉', '川蓉', 'payment', 'multi',
 '{"type":"form","scalars":[{"key":"contract_name","label":"合同名称","kind":"text"},{"key":"contract_no","label":"合同编号","kind":"text"},{"key":"pay_unit","label":"付款单位","kind":"text"},{"key":"recv_name","label":"收款单位名称","kind":"text"},{"key":"recv_bank","label":"开户行","kind":"text"},{"key":"recv_account","label":"账号","kind":"text"},{"key":"pay_method","label":"付款方式","kind":"text"},{"key":"pay_total","label":"本次支付合计","kind":"number"},{"key":"pay_total_cn","label":"大写","kind":"text"}],"detail":{"key":"items","fields":[{"key":"goods_name","label":"货物名称","kind":"text"},{"key":"factory","label":"厂家","kind":"text"},{"key":"model","label":"型号","kind":"text"},{"key":"qty","label":"数量","kind":"number"},{"key":"unit","label":"单位","kind":"text"},{"key":"unit_price","label":"单价","kind":"number"},{"key":"subtotal","label":"小计","kind":"number"},{"key":"remark","label":"备注","kind":"text"}]}}',
 '{"scalars":{"contract_name":"C2","contract_no":"C3","pay_unit":"C4","recv_name":"C5","recv_bank":"C6","recv_account":"C7","pay_method":"J7","pay_total":"C8","pay_total_cn":"C15"},"detail":{"startRow":10,"cols":{"goods_name":"B","factory":"C","model":"D","qty":"E","unit":"F","unit_price":"G","subtotal":"H","remark":"I"}}}',
 'system'),
('pay_zhongyiheng', '付款申请表-众一衡', '众一衡', 'payment', 'multi',
 '{"type":"form","scalars":[{"key":"contract_name","label":"合同名称","kind":"text"},{"key":"contract_no","label":"合同编号","kind":"text"},{"key":"pay_unit","label":"付款单位","kind":"text"},{"key":"recv_name","label":"收款单位名称","kind":"text"},{"key":"recv_bank","label":"开户行","kind":"text"},{"key":"recv_account","label":"账号","kind":"text"},{"key":"pay_method","label":"付款方式","kind":"text"},{"key":"pay_total","label":"本次支付合计","kind":"number"},{"key":"pay_total_cn","label":"大写","kind":"text"}],"detail":{"key":"items","fields":[{"key":"goods_name","label":"货物名称","kind":"text"},{"key":"factory","label":"厂家","kind":"text"},{"key":"model","label":"型号","kind":"text"},{"key":"qty","label":"数量","kind":"number"},{"key":"unit","label":"单位","kind":"text"},{"key":"unit_price","label":"单价","kind":"number"},{"key":"subtotal","label":"小计","kind":"number"},{"key":"remark","label":"备注","kind":"text"}]}}',
 '{"scalars":{"contract_name":"C2","contract_no":"C3","pay_unit":"C4","recv_name":"C5","recv_bank":"C6","recv_account":"C7","pay_method":"J7","pay_total":"C8","pay_total_cn":"C15"},"detail":{"startRow":10,"cols":{"goods_name":"B","factory":"C","model":"D","qty":"E","unit":"F","unit_price":"G","subtotal":"H","remark":"I"}}}',
 'system'),
('exp_chengbo', '费用报销表-成博', '成博', 'expense', 'multi',
 '{"type":"form","scalars":[{"key":"reason","label":"费用事由","kind":"text"},{"key":"with_inv","label":"有发票合计","kind":"number"},{"key":"no_inv","label":"无发票合计","kind":"number"},{"key":"total","label":"本次报销合计","kind":"number"},{"key":"total_cn","label":"大写","kind":"text"},{"key":"reimbursor","label":"报销人","kind":"text"},{"key":"reimburse_date","label":"日期","kind":"date"},{"key":"gm_approve","label":"总经理审核","kind":"text"},{"key":"cashier","label":"出纳签字","kind":"text"}],"fixedRows":{"key":"expense","rows":[{"key":"express","label":"快递"},{"key":"office","label":"办公费"},{"key":"local_travel","label":"市内差旅费"},{"key":"out_travel","label":"市外差旅费"},{"key":"meal","label":"茶餐费（业务招待费）"},{"key":"work_meal","label":"工作餐补贴"},{"key":"welfare_meal","label":"公司福利餐费"},{"key":"maintain","label":"维修/保养/年检/保险费等"},{"key":"ad","label":"广告费"},{"key":"cert","label":"检测证书费用"},{"key":"other","label":"其他费用"}]}}',
 '{"scalars":{"reason":"B3","with_inv":"B6","no_inv":"C6","total":"C18","total_cn":"C19","reimbursor":"B21","reimburse_date":"B23","gm_approve":"A26","cashier":"C26"},"fixedRows":{"express":"C7","office":"C8","local_travel":"C9","out_travel":"C10","meal":"C11","work_meal":"C12","welfare_meal":"C13","maintain":"C14","ad":"C15","cert":"C16","other":"C17"}}',
 'system'),
('exp_chuanrong', '费用报销表-川蓉', '川蓉', 'expense', 'multi',
 '{"type":"form","scalars":[{"key":"reason","label":"费用事由","kind":"text"},{"key":"with_inv","label":"有发票合计","kind":"number"},{"key":"no_inv","label":"无发票合计","kind":"number"},{"key":"total","label":"本次报销合计","kind":"number"},{"key":"total_cn","label":"大写","kind":"text"},{"key":"reimbursor","label":"报销人","kind":"text"},{"key":"reimburse_date","label":"日期","kind":"date"},{"key":"gm_approve","label":"总经理审核","kind":"text"},{"key":"cashier","label":"出纳签字","kind":"text"}],"fixedRows":{"key":"expense","rows":[{"key":"express","label":"快递"},{"key":"office","label":"办公费"},{"key":"local_travel","label":"市内差旅费"},{"key":"out_travel","label":"市外差旅费"},{"key":"meal","label":"茶餐费（业务招待费）"},{"key":"work_meal","label":"工作餐补贴"},{"key":"welfare_meal","label":"公司福利餐费"},{"key":"maintain","label":"维修/保养/年检/保险费等"},{"key":"ad","label":"广告费"},{"key":"cert","label":"检测证书费用"},{"key":"other","label":"其他费用"}]}}',
 '{"scalars":{"reason":"B3","with_inv":"B6","no_inv":"C6","total":"C18","total_cn":"C19","reimbursor":"B21","reimburse_date":"B23","gm_approve":"A26","cashier":"C26"},"fixedRows":{"express":"C7","office":"C8","local_travel":"C9","out_travel":"C10","meal":"C11","work_meal":"C12","welfare_meal":"C13","maintain":"C14","ad":"C15","cert":"C16","other":"C17"}}',
 'system'),
('exp_zhongyiheng', '费用报销表-众一衡', '众一衡', 'expense', 'multi',
 '{"type":"form","scalars":[{"key":"reason","label":"费用事由","kind":"text"},{"key":"with_inv","label":"有发票合计","kind":"number"},{"key":"no_inv","label":"无发票合计","kind":"number"},{"key":"total","label":"本次报销合计","kind":"number"},{"key":"total_cn","label":"大写","kind":"text"},{"key":"reimbursor","label":"报销人","kind":"text"},{"key":"reimburse_date","label":"日期","kind":"date"},{"key":"gm_approve","label":"总经理审核","kind":"text"},{"key":"cashier","label":"出纳签字","kind":"text"}],"fixedRows":{"key":"expense","rows":[{"key":"express","label":"快递"},{"key":"office","label":"办公费"},{"key":"local_travel","label":"市内差旅费"},{"key":"out_travel","label":"市外差旅费"},{"key":"meal","label":"茶餐费（业务招待费）"},{"key":"work_meal","label":"工作餐补贴"},{"key":"welfare_meal","label":"公司福利餐费"},{"key":"maintain","label":"维修/保养/年检/保险费等"},{"key":"ad","label":"广告费"},{"key":"cert","label":"检测证书费用"},{"key":"other","label":"其他费用"}]}}',
 '{"scalars":{"reason":"B3","with_inv":"B6","no_inv":"C6","total":"C18","total_cn":"C19","reimbursor":"B21","reimburse_date":"B23","gm_approve":"A26","cashier":"C26"},"fixedRows":{"express":"C7","office":"C8","local_travel":"C9","out_travel":"C10","meal":"C11","work_meal":"C12","welfare_meal":"C13","maintain":"C14","ad":"C15","cert":"C16","other":"C17"}}',
 'system');

-- ============================================================
-- 扩展表：补齐 mockData 中列出但 init/upgrade 尚未创建的业务表
-- 全部使用 IF NOT EXISTS，可重复加载。字段类型按 mockData cols 推断
-- ============================================================
CREATE TABLE IF NOT EXISTS prod_acceptance (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  accept_no VARCHAR(255),
  ref_no VARCHAR(255),
  doc_type VARCHAR(255),
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  spec_model VARCHAR(255),
  inspect_qty DECIMAL(18,4),
  accept_qty DECIMAL(18,4),
  defect_qty DECIMAL(18,4),
  scrap_qty DECIMAL(18,4),
  unit VARCHAR(255),
  accept_date DATE,
  accept_person VARCHAR(255),
  qc_standard VARCHAR(255),
  qc_result VARCHAR(255),
  defect_reason VARCHAR(255),
  handle_method VARCHAR(255),
  warehouse_code VARCHAR(255),
  warehouse_name VARCHAR(255),
  reviewer VARCHAR(255),
  review_date DATE,
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS prod_outsource_recon (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  recon_no VARCHAR(255),
  supplier_code VARCHAR(255),
  supplier_name VARCHAR(255),
  recon_period VARCHAR(255),
  outsource_no VARCHAR(255),
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  spec_model VARCHAR(255),
  outsource_qty DECIMAL(18,4),
  accept_qty DECIMAL(18,4),
  unit_price DECIMAL(18,4),
  payable_amount DECIMAL(18,4),
  paid_amount DECIMAL(18,4),
  unpaid_amount DECIMAL(18,4),
  recon_date DATE,
  handler VARCHAR(255),
  reviewer VARCHAR(255),
  review_date DATE,
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS prod_cost_allocation (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  alloc_no VARCHAR(255),
  work_order_no VARCHAR(255),
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  spec_model VARCHAR(255),
  expense_type VARCHAR(255),
  expense_item VARCHAR(255),
  total_amount DECIMAL(18,4),
  alloc_method VARCHAR(255),
  alloc_rate DECIMAL(18,4),
  alloc_amount DECIMAL(18,4),
  alloc_date DATE,
  handler VARCHAR(255),
  reviewer VARCHAR(255),
  review_date DATE,
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS prod_material_replenish (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  replenish_no VARCHAR(255),
  ref_work_order VARCHAR(255),
  ref_req_no VARCHAR(255),
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  spec_model VARCHAR(255),
  replenish_qty DECIMAL(18,4),
  unit VARCHAR(255),
  warehouse VARCHAR(255),
  reason VARCHAR(255),
  req_date DATE,
  req_person VARCHAR(255),
  reviewer VARCHAR(255),
  review_date DATE,
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_prod_progress (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  work_order_no VARCHAR(255),
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  spec_model VARCHAR(255),
  plan_qty DECIMAL(18,4),
  complete_qty DECIMAL(18,4),
  scrap_qty DECIMAL(18,4),
  complete_rate DECIMAL(18,4),
  start_date DATE,
  plan_end_date DATE,
  expected_end_date DATE,
  actual_end_date DATE,
  current_process VARCHAR(255),
  workshop VARCHAR(255),
  leader VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_material_demand (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  record_no VARCHAR(255),
  work_order_no VARCHAR(255),
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  material_code VARCHAR(255),
  material_name VARCHAR(255),
  material_spec VARCHAR(255),
  unit VARCHAR(255),
  demand_qty DECIMAL(18,4),
  received_qty DECIMAL(18,4),
  in_transit_qty DECIMAL(18,4),
  current_stock DECIMAL(18,4),
  net_demand DECIMAL(18,4),
  expected_arrival DATE,
  supplier_code VARCHAR(255),
  supplier_name VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_prod_daily (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  report_date DATE,
  workshop VARCHAR(255),
  work_order_no VARCHAR(255),
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  spec_model VARCHAR(255),
  plan_daily_qty DECIMAL(18,4),
  actual_qty DECIMAL(18,4),
  scrap_qty DECIMAL(18,4),
  pass_rate DECIMAL(18,4),
  attendance DECIMAL(18,4),
  work_hours DECIMAL(18,4),
  equip_rate DECIMAL(18,4),
  abnormal VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cust_customer_address (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  customer_code VARCHAR(255),
  customer_name VARCHAR(255),
  address_type VARCHAR(255),
  province VARCHAR(255),
  city VARCHAR(255),
  district VARCHAR(255),
  detail VARCHAR(255),
  receiver VARCHAR(255),
  phone VARCHAR(255),
  is_default VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cust_customer_credit (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  customer_code VARCHAR(255),
  customer_name VARCHAR(255),
  credit_type VARCHAR(255),
  credit_limit DECIMAL(18,4),
  used_credit DECIMAL(18,4),
  available_credit DECIMAL(18,4),
  credit_level VARCHAR(255),
  validity_start DATE,
  validity_end DATE,
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cust_customer_category (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  category_code VARCHAR(255),
  category_name VARCHAR(255),
  parent_category VARCHAR(255),
  customer_count DECIMAL(18,4),
  description VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cust_customer_follow (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  follow_no VARCHAR(255),
  customer_code VARCHAR(255),
  customer_name VARCHAR(255),
  follow_type VARCHAR(255),
  follow_content VARCHAR(255),
  follow_date DATE,
  follow_person VARCHAR(255),
  next_follow_date DATE,
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS supp_supplier_contact (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  supplier_code VARCHAR(255),
  supplier_name VARCHAR(255),
  contact_name VARCHAR(255),
  position VARCHAR(255),
  phone VARCHAR(255),
  email VARCHAR(255),
  is_default VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS supp_supplier_bank (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  supplier_code VARCHAR(255),
  supplier_name VARCHAR(255),
  bank_name VARCHAR(255),
  bank_account VARCHAR(255),
  account_name VARCHAR(255),
  is_default VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_warehouse_area (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  area_code VARCHAR(255),
  area_name VARCHAR(255),
  warehouse_code VARCHAR(255),
  warehouse_name VARCHAR(255),
  area_type VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_warehouse_location (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  location_code VARCHAR(255),
  location_name VARCHAR(255),
  warehouse_code VARCHAR(255),
  area_code VARCHAR(255),
  location_type VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_purchase_return (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  return_no VARCHAR(255),
  ref_purchase_no VARCHAR(255),
  supplier_code VARCHAR(255),
  supplier_name VARCHAR(255),
  return_date DATE,
  return_reason VARCHAR(255),
  total_amount DECIMAL(18,4),
  handler VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_sales_return (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  return_no VARCHAR(255),
  ref_sales_no VARCHAR(255),
  customer_code VARCHAR(255),
  customer_name VARCHAR(255),
  return_date DATE,
  return_reason VARCHAR(255),
  total_amount DECIMAL(18,4),
  handler VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_stock_check (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  check_no VARCHAR(255),
  warehouse VARCHAR(255),
  check_date DATE,
  system_qty DECIMAL(18,4),
  actual_qty DECIMAL(18,4),
  diff_qty DECIMAL(18,4),
  diff_amount DECIMAL(18,4),
  checker VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_employee_contract (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  contract_no VARCHAR(255),
  emp_no VARCHAR(255),
  emp_name VARCHAR(255),
  contract_type VARCHAR(255),
  start_date DATE,
  end_date DATE,
  renew_count DECIMAL(18,4),
  sign_date DATE,
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_position_main (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  position_code VARCHAR(255),
  position_name VARCHAR(255),
  department VARCHAR(255),
  position_level VARCHAR(255),
  position_type VARCHAR(255),
  headcount DECIMAL(18,4),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_attendance_overtime (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ot_no VARCHAR(255),
  emp_no VARCHAR(255),
  emp_name VARCHAR(255),
  ot_date DATE,
  ot_hours DECIMAL(18,4),
  ot_type VARCHAR(255),
  reason VARCHAR(255),
  approver VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_recruit_main (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  recruit_no VARCHAR(255),
  position VARCHAR(255),
  department VARCHAR(255),
  recruit_qty DECIMAL(18,4),
  salary_range VARCHAR(255),
  education VARCHAR(255),
  experience VARCHAR(255),
  recruit_status VARCHAR(255),
  hr_person VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_train_main (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  train_no VARCHAR(255),
  train_name VARCHAR(255),
  train_type VARCHAR(255),
  trainer VARCHAR(255),
  train_date DATE,
  train_hours DECIMAL(18,4),
  train_location VARCHAR(255),
  participant_count DECIMAL(18,4),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_receipt_main (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  receipt_no VARCHAR(255),
  customer_code VARCHAR(255),
  customer_name VARCHAR(255),
  amount DECIMAL(18,4),
  account VARCHAR(255),
  receipt_date DATE,
  handler VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_payment_main (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  payment_no VARCHAR(255),
  supplier_code VARCHAR(255),
  supplier_name VARCHAR(255),
  amount DECIMAL(18,4),
  account VARCHAR(255),
  payment_date DATE,
  handler VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_budget_main (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  budget_no VARCHAR(255),
  department VARCHAR(255),
  budget_period VARCHAR(255),
  budget_amount DECIMAL(18,4),
  used_amount DECIMAL(18,4),
  remain_amount DECIMAL(18,4),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS account_trial_balance (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  subject_code VARCHAR(255),
  subject_name VARCHAR(255),
  begin_debit DECIMAL(18,4),
  begin_credit DECIMAL(18,4),
  current_debit DECIMAL(18,4),
  current_credit DECIMAL(18,4),
  end_debit DECIMAL(18,4),
  end_credit DECIMAL(18,4),
  remark TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS account_closing (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  period VARCHAR(255),
  closing_date DATE,
  closing_type VARCHAR(255),
  operator VARCHAR(255),
  closing_status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_sales_by_customer (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  customer_code VARCHAR(255),
  customer_name VARCHAR(255),
  sales_qty DECIMAL(18,4),
  sales_amount DECIMAL(18,4),
  receivable_amount DECIMAL(18,4),
  order_count DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_sales_by_product (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  sales_qty DECIMAL(18,4),
  sales_amount DECIMAL(18,4),
  cost_amount DECIMAL(18,4),
  gross_profit DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_sales_by_person (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  sales_person VARCHAR(255),
  department VARCHAR(255),
  order_count DECIMAL(18,4),
  sales_amount DECIMAL(18,4),
  received_amount DECIMAL(18,4),
  target_amount DECIMAL(18,4),
  completion_rate DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_purchase_by_supplier (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  supplier_code VARCHAR(255),
  supplier_name VARCHAR(255),
  purchase_count DECIMAL(18,4),
  purchase_amount DECIMAL(18,4),
  on_time_rate DECIMAL(18,4),
  quality_rate DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_stock_balance (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  spec_model VARCHAR(255),
  warehouse VARCHAR(255),
  qty DECIMAL(18,4),
  unit_cost DECIMAL(18,4),
  total_value DECIMAL(18,4),
  stock_status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_stock_in_out (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  warehouse VARCHAR(255),
  begin_qty DECIMAL(18,4),
  in_qty DECIMAL(18,4),
  out_qty DECIMAL(18,4),
  end_qty DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_stock_warning (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  warehouse VARCHAR(255),
  current_stock DECIMAL(18,4),
  min_stock DECIMAL(18,4),
  warning_type VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_finance_expense (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  report_month VARCHAR(255),
  expense_type VARCHAR(255),
  amount DECIMAL(18,4),
  budget_amount DECIMAL(18,4),
  diff_amount DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_finance_receivable (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  customer_name VARCHAR(255),
  total_amount DECIMAL(18,4),
  within_30 DECIMAL(18,4),
  days_30_60 DECIMAL(18,4),
  days_60_90 DECIMAL(18,4),
  over_90 DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_comprehensive (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  report_month VARCHAR(255),
  sales_amount DECIMAL(18,4),
  purchase_amount DECIMAL(18,4),
  net_profit DECIMAL(18,4),
  order_count DECIMAL(18,4),
  customer_count DECIMAL(18,4),
  employee_count DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_executive (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  indicator VARCHAR(255),
  target_value DECIMAL(18,4),
  actual_value DECIMAL(18,4),
  completion_rate DECIMAL(18,4),
  yoy_growth DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS oa_workflow_main (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  workflow_code VARCHAR(255),
  workflow_name VARCHAR(255),
  workflow_type VARCHAR(255),
  description VARCHAR(255),
  creator VARCHAR(255),
  create_date DATE,
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_iot_cycle (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  cycle_code VARCHAR(255),
  device_code VARCHAR(255),
  device_name VARCHAR(255),
  cycle_type VARCHAR(255),
  cycle_days DECIMAL(18,4),
  next_exec_date DATE,
  exec_status VARCHAR(255),
  leader VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_maint_content (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  content_code VARCHAR(255),
  equip_type VARCHAR(255),
  maint_level VARCHAR(255),
  maint_item VARCHAR(255),
  maint_content VARCHAR(255),
  maint_standard VARCHAR(255),
  maint_cycle VARCHAR(255),
  ref_hours DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_maint_reminder (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  reminder_no VARCHAR(255),
  equip_code VARCHAR(255),
  equip_name VARCHAR(255),
  maint_type VARCHAR(255),
  plan_maint_date DATE,
  days_to_expire DECIMAL(18,4),
  responsible VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_parts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  record_no VARCHAR(255),
  equip_code VARCHAR(255),
  equip_name VARCHAR(255),
  part_code VARCHAR(255),
  part_name VARCHAR(255),
  spec_model VARCHAR(255),
  qty DECIMAL(18,4),
  unit VARCHAR(255),
  unit_price DECIMAL(18,4),
  supplier VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_maint_daily (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  stat_date DATE,
  equip_code VARCHAR(255),
  equip_name VARCHAR(255),
  maint_item VARCHAR(255),
  maint_result VARCHAR(255),
  executor VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_maint_monthly (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  stat_month VARCHAR(255),
  equip_code VARCHAR(255),
  equip_name VARCHAR(255),
  maint_count DECIMAL(18,4),
  maint_cost DECIMAL(18,4),
  executor VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_maint_yearly (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  stat_year VARCHAR(255),
  equip_code VARCHAR(255),
  equip_name VARCHAR(255),
  maint_count DECIMAL(18,4),
  maint_cost DECIMAL(18,4),
  executor VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_fault_annual (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  stat_year VARCHAR(255),
  equip_code VARCHAR(255),
  equip_name VARCHAR(255),
  fault_count DECIMAL(18,4),
  repair_count DECIMAL(18,4),
  repair_cost DECIMAL(18,4),
  downtime DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS aftersale_business_expense (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  expense_no VARCHAR(255),
  expense_type VARCHAR(255),
  ref_no VARCHAR(255),
  customer_name VARCHAR(255),
  expense_purpose VARCHAR(255),
  expense_amt DECIMAL(18,4),
  applicant VARCHAR(255),
  approver VARCHAR(255),
  approve_status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS aftersale_delivery_template (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  template_no VARCHAR(255),
  template_name VARCHAR(255),
  paper_size VARCHAR(255),
  header_content VARCHAR(255),
  footer_content VARCHAR(255),
  company_name VARCHAR(255),
  is_default VARCHAR(255),
  template_status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS aftersale_customer_system (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  record_no VARCHAR(255),
  customer_name VARCHAR(255),
  system_name VARCHAR(255),
  system_url VARCHAR(255),
  login_account VARCHAR(255),
  login_password VARCHAR(255),
  encrypt_method VARCHAR(255),
  account_status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_warehouse_perm (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  record_no VARCHAR(255),
  user_name VARCHAR(255),
  warehouse_name VARCHAR(255),
  in_perm VARCHAR(255),
  out_perm VARCHAR(255),
  view_perm VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_print_report (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  report_code VARCHAR(255),
  report_name VARCHAR(255),
  report_type VARCHAR(255),
  template_path VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_chart_component (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  component_code VARCHAR(255),
  component_name VARCHAR(255),
  component_type VARCHAR(255),
  data_source VARCHAR(255),
  chart_style VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_command (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  command_code VARCHAR(255),
  command_name VARCHAR(255),
  command_type VARCHAR(255),
  command_content VARCHAR(255),
  trigger_condition VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_unaudit_center (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  record_no VARCHAR(255),
  doc_type VARCHAR(255),
  doc_no VARCHAR(255),
  unaudit_person VARCHAR(255),
  unaudit_date DATE,
  unaudit_reason VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_sms_template (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  template_code VARCHAR(255),
  template_name VARCHAR(255),
  template_type VARCHAR(255),
  template_content VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_process_progress (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  work_order_no VARCHAR(255),
  product_name VARCHAR(255),
  process_code VARCHAR(255),
  process_name VARCHAR(255),
  plan_qty DECIMAL(18,4),
  complete_qty DECIMAL(18,4),
  scrap_qty DECIMAL(18,4),
  operator VARCHAR(255),
  process_status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_process_dispatch (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  dispatch_date DATE,
  work_order_no VARCHAR(255),
  process_name VARCHAR(255),
  dispatch_qty DECIMAL(18,4),
  complete_qty DECIMAL(18,4),
  operator VARCHAR(255),
  equip_code VARCHAR(255),
  plan_hours DECIMAL(18,4),
  actual_hours DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_process_summary (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  summary_date DATE,
  workshop VARCHAR(255),
  process_name VARCHAR(255),
  plan_total_qty DECIMAL(18,4),
  complete_total_qty DECIMAL(18,4),
  pass_rate DECIMAL(18,4),
  wip_qty DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_prod_pick_detail (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  req_no VARCHAR(255),
  req_date DATE,
  material_code VARCHAR(255),
  material_name VARCHAR(255),
  unit VARCHAR(255),
  plan_qty DECIMAL(18,4),
  actual_qty DECIMAL(18,4),
  warehouse VARCHAR(255),
  req_person VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_prod_return_detail (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  return_no VARCHAR(255),
  return_date DATE,
  material_code VARCHAR(255),
  material_name VARCHAR(255),
  unit VARCHAR(255),
  return_qty DECIMAL(18,4),
  reason VARCHAR(255),
  return_person VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cust_customer_visit (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  visit_no VARCHAR(255),
  customer_code VARCHAR(255),
  customer_name VARCHAR(255),
  visit_type VARCHAR(255),
  visit_date DATE,
  visit_person VARCHAR(255),
  visit_content VARCHAR(255),
  visit_result VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cust_quotation_detail (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  quote_no VARCHAR(255),
  line_no VARCHAR(255),
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  spec_model VARCHAR(255),
  qty DECIMAL(18,4),
  unit VARCHAR(255),
  unit_price DECIMAL(18,4),
  amount DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cust_contract_detail (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  contract_no VARCHAR(255),
  line_no VARCHAR(255),
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  qty DECIMAL(18,4),
  unit_price DECIMAL(18,4),
  amount DECIMAL(18,4),
  delivery_date DATE,
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS supp_supplier_address (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  supplier_code VARCHAR(255),
  supplier_name VARCHAR(255),
  address_type VARCHAR(255),
  province VARCHAR(255),
  city VARCHAR(255),
  district VARCHAR(255),
  detail VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_goods_price (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  price_type VARCHAR(255),
  unit_price DECIMAL(18,4),
  start_date DATE,
  end_date DATE,
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_purchase_return_detail (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  return_no VARCHAR(255),
  line_no VARCHAR(255),
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  qty DECIMAL(18,4),
  unit_price DECIMAL(18,4),
  amount DECIMAL(18,4),
  reason VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_sales_return_detail (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  return_no VARCHAR(255),
  line_no VARCHAR(255),
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  qty DECIMAL(18,4),
  unit_price DECIMAL(18,4),
  amount DECIMAL(18,4),
  reason VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_stock_check_detail (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  check_no VARCHAR(255),
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  system_qty DECIMAL(18,4),
  actual_qty DECIMAL(18,4),
  diff_qty DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_employee_education (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  emp_no VARCHAR(255),
  emp_name VARCHAR(255),
  school VARCHAR(255),
  major VARCHAR(255),
  degree VARCHAR(255),
  start_date DATE,
  graduation_date DATE,
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_employee_work_exp (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  emp_no VARCHAR(255),
  emp_name VARCHAR(255),
  company VARCHAR(255),
  position VARCHAR(255),
  start_date DATE,
  end_date DATE,
  description VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_salary_detail (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  salary_no VARCHAR(255),
  emp_no VARCHAR(255),
  item VARCHAR(255),
  amount DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_social_insurance (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  emp_no VARCHAR(255),
  emp_name VARCHAR(255),
  insurance_type VARCHAR(255),
  base_amount DECIMAL(18,4),
  company_amount DECIMAL(18,4),
  personal_amount DECIMAL(18,4),
  month VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_housing_fund (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  emp_no VARCHAR(255),
  emp_name VARCHAR(255),
  base_amount DECIMAL(18,4),
  company_rate DECIMAL(18,4),
  personal_rate DECIMAL(18,4),
  month VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_transfer_main (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  transfer_no VARCHAR(255),
  from_account VARCHAR(255),
  to_account VARCHAR(255),
  amount DECIMAL(18,4),
  transfer_date DATE,
  handler VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_cost_main (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  cost_no VARCHAR(255),
  cost_type VARCHAR(255),
  department VARCHAR(255),
  amount DECIMAL(18,4),
  cost_period VARCHAR(255),
  handler VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_budget_detail (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  budget_no VARCHAR(255),
  item VARCHAR(255),
  budget_amount DECIMAL(18,4),
  actual_amount DECIMAL(18,4),
  diff_amount DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_fixed_asset (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  asset_code VARCHAR(255),
  asset_name VARCHAR(255),
  asset_type VARCHAR(255),
  department VARCHAR(255),
  purchase_date DATE,
  purchase_price DECIMAL(18,4),
  depreciation_method VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_depreciation (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  asset_code VARCHAR(255),
  depreciation_period VARCHAR(255),
  original_value DECIMAL(18,4),
  depreciation_amount DECIMAL(18,4),
  net_value DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_cash_flow (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  period VARCHAR(255),
  inflow_amount DECIMAL(18,4),
  outflow_amount DECIMAL(18,4),
  net_flow DECIMAL(18,4),
  category VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS voucher_template (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  template_code VARCHAR(255),
  template_name VARCHAR(255),
  debit_subject VARCHAR(255),
  credit_subject VARCHAR(255),
  description VARCHAR(255),
  creator VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS account_cost_center (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  center_code VARCHAR(255),
  center_name VARCHAR(255),
  department VARCHAR(255),
  manager VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS account_trial_balance (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  subject_code VARCHAR(255),
  subject_name VARCHAR(255),
  begin_debit DECIMAL(18,4),
  begin_credit DECIMAL(18,4),
  current_debit DECIMAL(18,4),
  current_credit DECIMAL(18,4),
  end_debit DECIMAL(18,4),
  end_credit DECIMAL(18,4),
  remark TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS account_closing (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  period VARCHAR(255),
  closing_date DATE,
  closing_type VARCHAR(255),
  operator VARCHAR(255),
  closing_status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_sales_by_customer (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  customer_code VARCHAR(255),
  customer_name VARCHAR(255),
  sales_amount DECIMAL(18,4),
  receivable_amount DECIMAL(18,4),
  order_count DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_sales_by_product (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  sales_qty DECIMAL(18,4),
  sales_amount DECIMAL(18,4),
  cost_amount DECIMAL(18,4),
  gross_profit DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_sales_by_person (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  sales_person VARCHAR(255),
  department VARCHAR(255),
  order_count DECIMAL(18,4),
  sales_amount DECIMAL(18,4),
  received_amount DECIMAL(18,4),
  completion_rate DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_purchase_by_supplier (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  supplier_code VARCHAR(255),
  supplier_name VARCHAR(255),
  purchase_count DECIMAL(18,4),
  purchase_amount DECIMAL(18,4),
  on_time_rate DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_stock_in_out (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  begin_qty DECIMAL(18,4),
  in_qty DECIMAL(18,4),
  out_qty DECIMAL(18,4),
  end_qty DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_finance_expense (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  report_month VARCHAR(255),
  expense_type VARCHAR(255),
  amount DECIMAL(18,4),
  budget_amount DECIMAL(18,4),
  diff_amount DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_finance_receivable (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  customer_name VARCHAR(255),
  total_amount DECIMAL(18,4),
  within_30 DECIMAL(18,4),
  days_30_60 DECIMAL(18,4),
  days_60_90 DECIMAL(18,4),
  over_90 DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_production_output (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  report_date DATE,
  workshop VARCHAR(255),
  product_name VARCHAR(255),
  plan_qty DECIMAL(18,4),
  actual_qty DECIMAL(18,4),
  complete_rate DECIMAL(18,4),
  pass_rate DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_hr_employee (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  department VARCHAR(255),
  total_count DECIMAL(18,4),
  male_count DECIMAL(18,4),
  female_count DECIMAL(18,4),
  avg_age DECIMAL(18,4),
  avg_salary DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_hr_attendance (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  department VARCHAR(255),
  total_count DECIMAL(18,4),
  actual_count DECIMAL(18,4),
  leave_count DECIMAL(18,4),
  late_count DECIMAL(18,4),
  overtime_hours DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_quality_inspection (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  report_date DATE,
  inspection_type VARCHAR(255),
  total_count DECIMAL(18,4),
  pass_count DECIMAL(18,4),
  fail_count DECIMAL(18,4),
  pass_rate DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_executive (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  indicator VARCHAR(255),
  target_value DECIMAL(18,4),
  actual_value DECIMAL(18,4),
  completion_rate DECIMAL(18,4),
  yoy_growth DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quality_corrective (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  measure_no VARCHAR(255),
  defect_type VARCHAR(255),
  root_cause VARCHAR(255),
  corrective_action VARCHAR(255),
  responsible VARCHAR(255),
  plan_date DATE,
  actual_date DATE,
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quality_sample_standard (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  standard_code VARCHAR(255),
  standard_name VARCHAR(255),
  product_code VARCHAR(255),
  inspection_item VARCHAR(255),
  standard_value VARCHAR(255),
  tolerance VARCHAR(255),
  unit VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quality_instrument_main (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  instrument_code VARCHAR(255),
  instrument_name VARCHAR(255),
  model VARCHAR(255),
  location VARCHAR(255),
  calibration_date DATE,
  next_calibration DATE,
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_commissioning (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  record_no VARCHAR(255),
  equip_code VARCHAR(255),
  equip_name VARCHAR(255),
  commission_date DATE,
  commission_person VARCHAR(255),
  commission_result VARCHAR(255),
  is_qualified VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_refresh_stock_cost (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  op_code VARCHAR(255),
  op_date DATE,
  op_type VARCHAR(255),
  op_scope VARCHAR(255),
  operator VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_voucher_query_template (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  template_code VARCHAR(255),
  template_name VARCHAR(255),
  query_condition VARCHAR(255),
  display_fields VARCHAR(255),
  sort_method VARCHAR(255),
  creator VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_change_pwd (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_code VARCHAR(255),
  user_name VARCHAR(255),
  modify_date DATE,
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_partner_auth (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  record_no VARCHAR(255),
  partner_code VARCHAR(255),
  partner_name VARCHAR(255),
  partner_type VARCHAR(255),
  auth_type VARCHAR(255),
  authorizer VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cust_credit_record (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  customer_code VARCHAR(255),
  customer_name VARCHAR(255),
  credit_score DECIMAL(18,4),
  record_date DATE,
  change_type VARCHAR(255),
  change_amount DECIMAL(18,4),
  operator VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cust_grade (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  grade_code VARCHAR(255),
  grade_name VARCHAR(255),
  discount_rate DECIMAL(18,4),
  credit_limit DECIMAL(18,4),
  min_purchase DECIMAL(18,4),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS supp_supplier_grade (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  grade_code VARCHAR(255),
  grade_name VARCHAR(255),
  quality_standard VARCHAR(255),
  delivery_standard VARCHAR(255),
  payment_terms VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS supp_qualification (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  supplier_code VARCHAR(255),
  supplier_name VARCHAR(255),
  cert_type VARCHAR(255),
  cert_no VARCHAR(255),
  issue_date DATE,
  expiry_date DATE,
  issuing_org VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS supp_cooperation (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  supplier_code VARCHAR(255),
  supplier_name VARCHAR(255),
  cooperation_start DATE,
  total_orders DECIMAL(18,4),
  total_amount DECIMAL(18,4),
  on_time_rate DECIMAL(18,4),
  quality_rate DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_goods_spec (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  spec_code VARCHAR(255),
  spec_name VARCHAR(255),
  spec_value VARCHAR(255),
  unit VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_goods_brand (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  brand_code VARCHAR(255),
  brand_name VARCHAR(255),
  country VARCHAR(255),
  website VARCHAR(255),
  contact_person VARCHAR(255),
  contact_phone VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_warehouse_area (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  area_code VARCHAR(255),
  area_name VARCHAR(255),
  warehouse_code VARCHAR(255),
  warehouse_name VARCHAR(255),
  area_type VARCHAR(255),
  capacity DECIMAL(18,4),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_warehouse_location (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  location_code VARCHAR(255),
  location_name VARCHAR(255),
  warehouse_code VARCHAR(255),
  area_code VARCHAR(255),
  location_type VARCHAR(255),
  max_weight DECIMAL(18,4),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_stock_check (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  check_no VARCHAR(255),
  warehouse VARCHAR(255),
  check_date DATE,
  checker VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_employee_family (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  emp_no VARCHAR(255),
  emp_name VARCHAR(255),
  family_name VARCHAR(255),
  relationship VARCHAR(255),
  phone VARCHAR(255),
  company VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_salary_record (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  salary_no VARCHAR(255),
  emp_no VARCHAR(255),
  emp_name VARCHAR(255),
  pay_date DATE,
  pay_method VARCHAR(255),
  net_salary DECIMAL(18,4),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_recruit_candidate (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  recruit_no VARCHAR(255),
  candidate_name VARCHAR(255),
  phone VARCHAR(255),
  email VARCHAR(255),
  education VARCHAR(255),
  apply_date DATE,
  interview_status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_recruit_interview (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  candidate_name VARCHAR(255),
  interviewer VARCHAR(255),
  interview_date DATE,
  interview_type VARCHAR(255),
  score DECIMAL(18,4),
  result VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_train_record (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  train_no VARCHAR(255),
  emp_no VARCHAR(255),
  emp_name VARCHAR(255),
  attendance VARCHAR(255),
  score DECIMAL(18,4),
  result VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_bank_statement (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  statement_no VARCHAR(255),
  bank_account VARCHAR(255),
  period VARCHAR(255),
  begin_balance DECIMAL(18,4),
  end_balance DECIMAL(18,4),
  statement_date DATE,
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_reconciliation (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  recon_no VARCHAR(255),
  bank_account VARCHAR(255),
  period VARCHAR(255),
  system_balance DECIMAL(18,4),
  bank_balance DECIMAL(18,4),
  diff_amount DECIMAL(18,4),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_asset_transfer (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  transfer_no VARCHAR(255),
  asset_code VARCHAR(255),
  asset_name VARCHAR(255),
  from_dept VARCHAR(255),
  to_dept VARCHAR(255),
  transfer_date DATE,
  handler VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_fund_plan (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  plan_no VARCHAR(255),
  plan_period VARCHAR(255),
  plan_type VARCHAR(255),
  plan_amount DECIMAL(18,4),
  actual_amount DECIMAL(18,4),
  department VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS account_settlement (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  settlement_code VARCHAR(255),
  settlement_name VARCHAR(255),
  settlement_type VARCHAR(255),
  bank_account VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS account_opening_balance (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  subject_code VARCHAR(255),
  subject_name VARCHAR(255),
  year VARCHAR(255),
  begin_debit DECIMAL(18,4),
  begin_credit DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_stock_age (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  warehouse VARCHAR(255),
  within_90 DECIMAL(18,4),
  days_90_180 DECIMAL(18,4),
  days_180_360 DECIMAL(18,4),
  over_360 DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_stock_value (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  warehouse VARCHAR(255),
  qty DECIMAL(18,4),
  unit_cost DECIMAL(18,4),
  total_value DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_stock_turnover (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  begin_stock DECIMAL(18,4),
  end_stock DECIMAL(18,4),
  out_qty DECIMAL(18,4),
  turnover_rate DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_finance_profit (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  report_month VARCHAR(255),
  revenue DECIMAL(18,4),
  cost DECIMAL(18,4),
  expense DECIMAL(18,4),
  gross_profit DECIMAL(18,4),
  net_profit DECIMAL(18,4),
  profit_rate DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_hr_salary (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  department VARCHAR(255),
  total_salary DECIMAL(18,4),
  avg_salary DECIMAL(18,4),
  max_salary DECIMAL(18,4),
  min_salary DECIMAL(18,4),
  employee_count DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_hr_turnover (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  department VARCHAR(255),
  begin_count DECIMAL(18,4),
  hire_count DECIMAL(18,4),
  leave_count DECIMAL(18,4),
  end_count DECIMAL(18,4),
  turnover_rate DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quality_shipping (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  inspection_no VARCHAR(255),
  sales_no VARCHAR(255),
  customer_name VARCHAR(255),
  product_name VARCHAR(255),
  inspect_qty DECIMAL(18,4),
  pass_qty DECIMAL(18,4),
  result VARCHAR(255),
  inspector VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quality_control_plan (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  plan_no VARCHAR(255),
  plan_name VARCHAR(255),
  product_code VARCHAR(255),
  control_point VARCHAR(255),
  control_method VARCHAR(255),
  frequency VARCHAR(255),
  responsible VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_maintain_plan (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  plan_no VARCHAR(255),
  equip_code VARCHAR(255),
  equip_name VARCHAR(255),
  maint_type VARCHAR(255),
  plan_date DATE,
  cycle_days DECIMAL(18,4),
  staff VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_maintain_record (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  record_no VARCHAR(255),
  equip_code VARCHAR(255),
  equip_name VARCHAR(255),
  maint_date DATE,
  maint_content VARCHAR(255),
  staff VARCHAR(255),
  result VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_repair_main (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  repair_no VARCHAR(255),
  equip_code VARCHAR(255),
  equip_name VARCHAR(255),
  fault_desc VARCHAR(255),
  repair_date DATE,
  repair_company VARCHAR(255),
  repair_cost DECIMAL(18,4),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_maint_quarterly (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  quarter VARCHAR(255),
  equip_code VARCHAR(255),
  maint_count DECIMAL(18,4),
  maint_cost DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_force_cost_change (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  modify_date DATE,
  product_code VARCHAR(255),
  before_price DECIMAL(18,4),
  after_price DECIMAL(18,4),
  reason VARCHAR(255),
  handler VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_month_end_param (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  param_code VARCHAR(255),
  param_name VARCHAR(255),
  param_value VARCHAR(255),
  description VARCHAR(255),
  modifier VARCHAR(255),
  modify_date DATE,
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_refresh_cost_record (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  record_no VARCHAR(255),
  op_date DATE,
  op_type VARCHAR(255),
  op_result VARCHAR(255),
  operator VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS prod_outsourcing_main (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  outsourcing_no VARCHAR(255),
  supplier_code VARCHAR(255),
  supplier_name VARCHAR(255),
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  qty DECIMAL(18,4),
  unit_price DECIMAL(18,4),
  amount DECIMAL(18,4),
  expect_date DATE,
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS prod_process_step (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  process_code VARCHAR(255),
  step_no VARCHAR(255),
  step_name VARCHAR(255),
  description VARCHAR(255),
  standard_hours DECIMAL(18,4),
  equip_need VARCHAR(255),
  tool_need VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS prod_hour_record (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  record_no VARCHAR(255),
  work_order_no VARCHAR(255),
  operator VARCHAR(255),
  work_date DATE,
  start_time VARCHAR(255),
  end_time VARCHAR(255),
  hours DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_prod_plan_track (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  plan_code VARCHAR(255),
  product_name VARCHAR(255),
  plan_qty DECIMAL(18,4),
  complete_qty DECIMAL(18,4),
  complete_rate DECIMAL(18,4),
  delay_days DECIMAL(18,4),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_work_order_summary (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  workshop VARCHAR(255),
  total_orders DECIMAL(18,4),
  completed_orders DECIMAL(18,4),
  scrap_rate DECIMAL(18,4),
  avg_duration DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_prod_cost_analysis (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  material_cost DECIMAL(18,4),
  labor_cost DECIMAL(18,4),
  overhead DECIMAL(18,4),
  total_cost DECIMAL(18,4),
  unit_cost DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_delivery_detail (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  delivery_no VARCHAR(255),
  line_no VARCHAR(255),
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  qty DECIMAL(18,4),
  unit VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_cost_allocation (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  alloc_no VARCHAR(255),
  alloc_type VARCHAR(255),
  amount DECIMAL(18,4),
  from_dept VARCHAR(255),
  to_dept VARCHAR(255),
  alloc_date DATE,
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_period (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  period_code VARCHAR(255),
  period_name VARCHAR(255),
  start_date DATE,
  end_date DATE,
  year VARCHAR(255),
  is_closed VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_exchange_rate (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  currency_code VARCHAR(255),
  currency_name VARCHAR(255),
  exchange_rate DECIMAL(18,4),
  effective_date DATE,
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS account_multi_column (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  subject_code VARCHAR(255),
  subject_name VARCHAR(255),
  period VARCHAR(255),
  column1 DECIMAL(18,4),
  column2 DECIMAL(18,4),
  column3 DECIMAL(18,4),
  column4 DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS account_detail_ledger (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  subject_code VARCHAR(255),
  subject_name VARCHAR(255),
  voucher_no VARCHAR(255),
  voucher_date DATE,
  summary VARCHAR(255),
  debit DECIMAL(18,4),
  credit DECIMAL(18,4),
  balance DECIMAL(18,4),
  remark TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS account_cash_book (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  record_date DATE,
  voucher_no VARCHAR(255),
  summary VARCHAR(255),
  income DECIMAL(18,4),
  expense DECIMAL(18,4),
  balance DECIMAL(18,4),
  handler VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS account_bank_book (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  record_date DATE,
  voucher_no VARCHAR(255),
  summary VARCHAR(255),
  income DECIMAL(18,4),
  expense DECIMAL(18,4),
  balance DECIMAL(18,4),
  bank_account VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS account_balance_sheet (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  report_date DATE,
  item VARCHAR(255),
  begin_amount DECIMAL(18,4),
  end_amount DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS account_income_statement (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  report_date DATE,
  item VARCHAR(255),
  current_amount DECIMAL(18,4),
  cumulative_amount DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS account_cash_flow_stmt (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  report_date DATE,
  item VARCHAR(255),
  amount DECIMAL(18,4),
  flow_type VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS account_allocation_rule (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  rule_code VARCHAR(255),
  rule_name VARCHAR(255),
  alloc_method VARCHAR(255),
  alloc_basis VARCHAR(255),
  department VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS voucher_word (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  word_code VARCHAR(255),
  word_name VARCHAR(255),
  description VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS voucher_template_detail (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  template_code VARCHAR(255),
  line_no VARCHAR(255),
  debit_subject VARCHAR(255),
  credit_subject VARCHAR(255),
  proportion DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quality_8d_report (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  report_no VARCHAR(255),
  defect_no VARCHAR(255),
  team_members VARCHAR(255),
  root_cause VARCHAR(255),
  corrective_action VARCHAR(255),
  preventive_action VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quality_audit (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  audit_no VARCHAR(255),
  audit_type VARCHAR(255),
  audit_date DATE,
  auditor VARCHAR(255),
  audit_result VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS oa_meeting_room (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  room_code VARCHAR(255),
  room_name VARCHAR(255),
  capacity DECIMAL(18,4),
  location VARCHAR(255),
  facilities VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS oa_meeting_record (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  meeting_no VARCHAR(255),
  title VARCHAR(255),
  room_name VARCHAR(255),
  organizer VARCHAR(255),
  meeting_date DATE,
  participants VARCHAR(255),
  minutes VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS oa_reimbursement (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  reimbursement_no VARCHAR(255),
  applicant VARCHAR(255),
  amount DECIMAL(18,4),
  expense_type VARCHAR(255),
  submit_date DATE,
  approver VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_insurance (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  insurance_no VARCHAR(255),
  equip_code VARCHAR(255),
  insurance_company VARCHAR(255),
  insurance_amount DECIMAL(18,4),
  start_date DATE,
  end_date DATE,
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_lease (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  lease_no VARCHAR(255),
  equip_code VARCHAR(255),
  lessor VARCHAR(255),
  start_date DATE,
  end_date DATE,
  monthly_rent DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_scrap (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  scrap_no VARCHAR(255),
  equip_code VARCHAR(255),
  equip_name VARCHAR(255),
  scrap_date DATE,
  scrap_reason VARCHAR(255),
  handler VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_check_plan (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  plan_no VARCHAR(255),
  equip_code VARCHAR(255),
  check_item VARCHAR(255),
  check_cycle VARCHAR(255),
  responsible VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_check_record (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  record_no VARCHAR(255),
  equip_code VARCHAR(255),
  check_date DATE,
  check_item VARCHAR(255),
  check_result VARCHAR(255),
  checker VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_lubrication_plan (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  plan_no VARCHAR(255),
  equip_code VARCHAR(255),
  point VARCHAR(255),
  oil_type VARCHAR(255),
  cycle VARCHAR(255),
  responsible VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_calibration_record (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  record_no VARCHAR(255),
  equip_code VARCHAR(255),
  calibrate_date DATE,
  calibrator VARCHAR(255),
  result VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_lubrication_record (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  record_no VARCHAR(255),
  equip_code VARCHAR(255),
  point VARCHAR(255),
  oil_type VARCHAR(255),
  exec_date DATE,
  executor VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_calibration_plan (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  plan_no VARCHAR(255),
  equip_code VARCHAR(255),
  calibrate_item VARCHAR(255),
  calibrate_cycle VARCHAR(255),
  responsible VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_transfer (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  transfer_no VARCHAR(255),
  equip_code VARCHAR(255),
  from_dept VARCHAR(255),
  to_dept VARCHAR(255),
  transfer_date DATE,
  handler VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_document (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  doc_no VARCHAR(255),
  equip_code VARCHAR(255),
  doc_type VARCHAR(255),
  doc_name VARCHAR(255),
  file_path VARCHAR(255),
  upload_date DATE,
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_spare_main (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  spare_code VARCHAR(255),
  spare_name VARCHAR(255),
  equip_code VARCHAR(255),
  qty DECIMAL(18,4),
  unit_price DECIMAL(18,4),
  supplier VARCHAR(255),
  min_stock DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_spare_stock (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  spare_code VARCHAR(255),
  warehouse VARCHAR(255),
  qty DECIMAL(18,4),
  location VARCHAR(255),
  last_check DATE,
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_parameter (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  equip_code VARCHAR(255),
  param_name VARCHAR(255),
  param_value VARCHAR(255),
  unit VARCHAR(255),
  normal_range VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_category (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  category_code VARCHAR(255),
  category_name VARCHAR(255),
  parent_code VARCHAR(255),
  description VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_charge_item (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  item_code VARCHAR(255),
  item_name VARCHAR(255),
  item_type VARCHAR(255),
  unit_price DECIMAL(18,4),
  unit VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_asset_disposal (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  disposal_no VARCHAR(255),
  asset_code VARCHAR(255),
  disposal_type VARCHAR(255),
  disposal_amount DECIMAL(18,4),
  disposal_date DATE,
  handler VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_budget_execution (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  budget_no VARCHAR(255),
  department VARCHAR(255),
  budget_amount DECIMAL(18,4),
  executed_amount DECIMAL(18,4),
  remain_amount DECIMAL(18,4),
  execution_rate DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_settle_account (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  account_code VARCHAR(255),
  account_name VARCHAR(255),
  bank_name VARCHAR(255),
  bank_account VARCHAR(255),
  currency VARCHAR(255),
  is_default VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_attendance_trip (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  trip_no VARCHAR(255),
  emp_no VARCHAR(255),
  emp_name VARCHAR(255),
  destination VARCHAR(255),
  start_date DATE,
  end_date DATE,
  reason VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_position_main (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  position_code VARCHAR(255),
  position_name VARCHAR(255),
  department VARCHAR(255),
  position_level VARCHAR(255),
  headcount DECIMAL(18,4),
  current_count DECIMAL(18,4),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS prod_mrp_plan (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  plan_no VARCHAR(255),
  plan_date DATE,
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  demand_qty DECIMAL(18,4),
  plan_status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS prod_workstation (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  station_code VARCHAR(255),
  station_name VARCHAR(255),
  workshop VARCHAR(255),
  production_line VARCHAR(255),
  process_code VARCHAR(255),
  operator VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS prod_quality_check (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  check_no VARCHAR(255),
  work_order_no VARCHAR(255),
  product_name VARCHAR(255),
  check_qty DECIMAL(18,4),
  pass_qty DECIMAL(18,4),
  fail_qty DECIMAL(18,4),
  inspector VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_prod_quality (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  report_date DATE,
  workshop VARCHAR(255),
  total_qty DECIMAL(18,4),
  pass_qty DECIMAL(18,4),
  defect_qty DECIMAL(18,4),
  pass_rate DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_prod_efficiency (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  work_order_no VARCHAR(255),
  workshop VARCHAR(255),
  plan_hours DECIMAL(18,4),
  actual_hours DECIMAL(18,4),
  efficiency DECIMAL(18,4),
  overtime DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_material_consumption (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  material_code VARCHAR(255),
  material_name VARCHAR(255),
  plan_qty DECIMAL(18,4),
  actual_qty DECIMAL(18,4),
  diff_qty DECIMAL(18,4),
  diff_rate DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_purchase_plan (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  plan_no VARCHAR(255),
  material_code VARCHAR(255),
  material_name VARCHAR(255),
  plan_qty DECIMAL(18,4),
  plan_date DATE,
  buyer VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_purchase_inquiry (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  inquiry_no VARCHAR(255),
  material_name VARCHAR(255),
  supplier_code VARCHAR(255),
  supplier_name VARCHAR(255),
  quoted_price DECIMAL(18,4),
  inquiry_date DATE,
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_sales_forecast (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  forecast_no VARCHAR(255),
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  forecast_qty DECIMAL(18,4),
  forecast_date DATE,
  forecast_person VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_sales_contract (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  contract_no VARCHAR(255),
  customer_name VARCHAR(255),
  product_name VARCHAR(255),
  qty DECIMAL(18,4),
  amount DECIMAL(18,4),
  sign_date DATE,
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_inventory_transfer (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  transfer_no VARCHAR(255),
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  qty DECIMAL(18,4),
  from_warehouse VARCHAR(255),
  to_warehouse VARCHAR(255),
  handler VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_stock_adjust (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  adjust_no VARCHAR(255),
  product_code VARCHAR(255),
  before_qty DECIMAL(18,4),
  after_qty DECIMAL(18,4),
  adjust_reason VARCHAR(255),
  handler VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_receiving (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  receive_no VARCHAR(255),
  purchase_no VARCHAR(255),
  supplier_name VARCHAR(255),
  product_name VARCHAR(255),
  receive_qty DECIMAL(18,4),
  receive_date DATE,
  handler VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_shipping (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  shipping_no VARCHAR(255),
  sales_no VARCHAR(255),
  customer_name VARCHAR(255),
  shipping_date DATE,
  carrier VARCHAR(255),
  tracking_no VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_performance (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  evaluation_no VARCHAR(255),
  emp_no VARCHAR(255),
  emp_name VARCHAR(255),
  period VARCHAR(255),
  score DECIMAL(18,4),
  grade VARCHAR(255),
  evaluator VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_contract_renewal (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  contract_no VARCHAR(255),
  emp_name VARCHAR(255),
  old_end DATE,
  new_end DATE,
  renew_date DATE,
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_transfer_record (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  record_no VARCHAR(255),
  emp_name VARCHAR(255),
  change_type VARCHAR(255),
  from_dept VARCHAR(255),
  to_dept VARCHAR(255),
  change_date DATE,
  reason VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_exchange_main (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  exchange_no VARCHAR(255),
  currency VARCHAR(255),
  exchange_rate DECIMAL(18,4),
  exchange_date DATE,
  amount DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_other_income (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  income_no VARCHAR(255),
  income_type VARCHAR(255),
  amount DECIMAL(18,4),
  income_date DATE,
  department VARCHAR(255),
  handler VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_expense_budget (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  budget_no VARCHAR(255),
  department VARCHAR(255),
  expense_item VARCHAR(255),
  budget_amount DECIMAL(18,4),
  period VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_loan (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  loan_no VARCHAR(255),
  borrower VARCHAR(255),
  amount DECIMAL(18,4),
  loan_date DATE,
  repay_date DATE,
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS account_currency (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  currency_code VARCHAR(255),
  currency_name VARCHAR(255),
  exchange_rate DECIMAL(18,4),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS account_transfer_record (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  record_no VARCHAR(255),
  transfer_type VARCHAR(255),
  from_subject VARCHAR(255),
  to_subject VARCHAR(255),
  amount DECIMAL(18,4),
  transfer_date DATE,
  operator VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quality_preventive (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  measure_no VARCHAR(255),
  potential_risk VARCHAR(255),
  preventive_action VARCHAR(255),
  responsible VARCHAR(255),
  plan_date DATE,
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quality_sample_plan (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  plan_code VARCHAR(255),
  plan_name VARCHAR(255),
  sample_size DECIMAL(18,4),
  accept_level VARCHAR(255),
  reject_level VARCHAR(255),
  standard VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS oa_overtime_approval (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  approval_no VARCHAR(255),
  emp_name VARCHAR(255),
  ot_date DATE,
  ot_hours DECIMAL(18,4),
  reason VARCHAR(255),
  approver VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS oa_document (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  doc_no VARCHAR(255),
  doc_name VARCHAR(255),
  doc_type VARCHAR(255),
  uploader VARCHAR(255),
  upload_date DATE,
  file_size DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_backup_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  log_no VARCHAR(255),
  backup_type VARCHAR(255),
  backup_time DATE,
  file_size DECIMAL(18,4),
  operator VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_message (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  msg_no VARCHAR(255),
  sender VARCHAR(255),
  receiver VARCHAR(255),
  title VARCHAR(255),
  content VARCHAR(255),
  send_time DATE,
  is_read VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_schedule_task (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  task_code VARCHAR(255),
  task_name VARCHAR(255),
  cron_expression VARCHAR(255),
  task_class VARCHAR(255),
  status VARCHAR(255),
  last_run DATE,
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS prod_bom_version (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  bom_code VARCHAR(255),
  version VARCHAR(255),
  change_reason VARCHAR(255),
  effective_date DATE,
  approver VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS prod_machine_record (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  record_no VARCHAR(255),
  work_order_no VARCHAR(255),
  equip_code VARCHAR(255),
  start_time VARCHAR(255),
  end_time VARCHAR(255),
  operator VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS prod_schedule_detail (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  schedule_no VARCHAR(255),
  work_order_no VARCHAR(255),
  equip_code VARCHAR(255),
  start_time VARCHAR(255),
  end_time VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cust_contract_change (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  change_no VARCHAR(255),
  contract_no VARCHAR(255),
  change_type VARCHAR(255),
  change_content VARCHAR(255),
  change_date DATE,
  handler VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_price_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_code VARCHAR(255),
  old_price DECIMAL(18,4),
  new_price DECIMAL(18,4),
  change_date DATE,
  reason VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trade_stock_allocation (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  alloc_no VARCHAR(255),
  sales_no VARCHAR(255),
  product_code VARCHAR(255),
  alloc_qty DECIMAL(18,4),
  alloc_date DATE,
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_employee_cert (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  emp_no VARCHAR(255),
  cert_name VARCHAR(255),
  cert_no VARCHAR(255),
  issue_date DATE,
  expiry_date DATE,
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_recruit_offer (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  offer_no VARCHAR(255),
  candidate_name VARCHAR(255),
  position VARCHAR(255),
  salary DECIMAL(18,4),
  entry_date DATE,
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_invoice_detail (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  invoice_no VARCHAR(255),
  line_no VARCHAR(255),
  item VARCHAR(255),
  qty DECIMAL(18,4),
  unit_price DECIMAL(18,4),
  amount DECIMAL(18,4),
  tax_rate DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_tax_return (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  return_no VARCHAR(255),
  tax_type VARCHAR(255),
  tax_period VARCHAR(255),
  tax_amount DECIMAL(18,4),
  submit_date DATE,
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS account_check_main (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  check_no VARCHAR(255),
  check_type VARCHAR(255),
  period VARCHAR(255),
  check_date DATE,
  checker VARCHAR(255),
  status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS account_year_close (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  year VARCHAR(255),
  close_date DATE,
  operator VARCHAR(255),
  close_status VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_prod_scrap (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  report_date DATE,
  workshop VARCHAR(255),
  product_name VARCHAR(255),
  scrap_qty DECIMAL(18,4),
  scrap_rate DECIMAL(18,4),
  scrap_cost DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_inventory_detail (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  warehouse VARCHAR(255),
  begin_qty DECIMAL(18,4),
  in_qty DECIMAL(18,4),
  out_qty DECIMAL(18,4),
  end_qty DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_finance_cost (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_code VARCHAR(255),
  product_name VARCHAR(255),
  material_cost DECIMAL(18,4),
  labor_cost DECIMAL(18,4),
  overhead DECIMAL(18,4),
  total_cost DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rpt_production_schedule (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  work_order_no VARCHAR(255),
  product_name VARCHAR(255),
  plan_qty DECIMAL(18,4),
  complete_qty DECIMAL(18,4),
  progress DECIMAL(18,4),
  delay DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quality_instrument_calibration (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  record_no VARCHAR(255),
  instrument_code VARCHAR(255),
  calibrate_date DATE,
  calibrator VARCHAR(255),
  result VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quality_spc_data (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  sample_date DATE,
  product_code VARCHAR(255),
  measure_value DECIMAL(18,4),
  ucl DECIMAL(18,4),
  lcl DECIMAL(18,4),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equip_maintain_cost (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  equip_code VARCHAR(255),
  maintain_type VARCHAR(255),
  cost DECIMAL(18,4),
  cost_date DATE,
  staff VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_data_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  log_no VARCHAR(255),
  table_name VARCHAR(255),
  operation VARCHAR(255),
  operator VARCHAR(255),
  operate_time DATE,
  detail VARCHAR(255),
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- RBAC 角色权限矩阵（菜单粒度=模块粒度，向后兼容 sys_user.permissions JSON）
-- ============================================================
CREATE TABLE IF NOT EXISTS sys_role (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  role_code VARCHAR(20) NOT NULL UNIQUE,
  role_name VARCHAR(50) NOT NULL,
  description VARCHAR(200),
  status VARCHAR(20) DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_menu (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  menu_code VARCHAR(50) NOT NULL UNIQUE,
  menu_name VARCHAR(50) NOT NULL,
  parent_code VARCHAR(50),
  module VARCHAR(50) NOT NULL,
  sort INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_role_menu (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  role_id BIGINT NOT NULL,
  menu_id BIGINT NOT NULL,
  can_view TINYINT(1) NOT NULL DEFAULT 0,
  can_add TINYINT(1) NOT NULL DEFAULT 0,
  can_edit TINYINT(1) NOT NULL DEFAULT 0,
  can_delete TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_role_menu (role_id, menu_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_user_role (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  UNIQUE KEY uk_user_role (user_id, role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 预置 8 个角色
INSERT IGNORE INTO sys_role (role_code, role_name, description) VALUES
('admin','系统管理员','全部权限'),
('sales','销售','客户供应商/进销存/报表中心'),
('aftersale','售后','售后管理/报表中心'),
('warehouse','仓管','进销存管理/报表中心'),
('accounting','会计','财务管理/会计凭证/报表中心'),
('production','生产','生产模块/质量管理/设备管理/报表中心'),
('hr','人事','人力资源/协同办公/报表中心'),
('procurement','采购','客户供应商/进销存/报表中心');

-- 预置 12 个菜单（粒度=模块）
INSERT IGNORE INTO sys_menu (menu_code, menu_name, module, sort) VALUES
('prod','生产模块','生产模块',1),
('cust','客户供应商','客户供应商',2),
('trade','进销存管理','进销存管理',3),
('hr','人力资源','人力资源',4),
('finance','财务管理','财务管理',5),
('voucher','会计凭证','会计凭证',6),
('report','报表中心','报表中心',7),
('quality','质量管理','质量管理',8),
('oa','协同办公','协同办公',9),
('equip','设备管理','设备管理',10),
('aftersale','售后管理','售后管理',11),
('sys','系统维护','系统维护',12);

-- 预置角色-菜单矩阵（admin 全开，其余按 AuthController.parsePerms 默认规则）
-- admin 全部模块 can_view/can_add/can_edit/can_delete=1
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, can_view, can_add, can_edit, can_delete)
SELECT r.id, m.id, 1, 1, 1, 1 FROM sys_role r, sys_menu m WHERE r.role_code='admin';
-- sales: 客户供应商/进销存/报表中心 (只读)
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, can_view, can_add, can_edit, can_delete)
SELECT r.id, m.id, 1, 0, 0, 0 FROM sys_role r, sys_menu m WHERE r.role_code='sales' AND m.menu_code IN ('cust','trade','report');
-- aftersale: 售后/报表中心
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, can_view, can_add, can_edit, can_delete)
SELECT r.id, m.id, 1, 0, 0, 0 FROM sys_role r, sys_menu m WHERE r.role_code='aftersale' AND m.menu_code IN ('aftersale','report');
-- warehouse: 进销存/报表中心
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, can_view, can_add, can_edit, can_delete)
SELECT r.id, m.id, 1, 0, 0, 0 FROM sys_role r, sys_menu m WHERE r.role_code='warehouse' AND m.menu_code IN ('trade','report');
-- accounting: 财务/会计凭证/报表中心
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, can_view, can_add, can_edit, can_delete)
SELECT r.id, m.id, 1, 0, 0, 0 FROM sys_role r, sys_menu m WHERE r.role_code='accounting' AND m.menu_code IN ('finance','voucher','report');
-- production: 生产/质量/设备/报表中心
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, can_view, can_add, can_edit, can_delete)
SELECT r.id, m.id, 1, 0, 0, 0 FROM sys_role r, sys_menu m WHERE r.role_code='production' AND m.menu_code IN ('prod','quality','equip','report');
-- hr: 人力/协同办公/报表中心
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, can_view, can_add, can_edit, can_delete)
SELECT r.id, m.id, 1, 0, 0, 0 FROM sys_role r, sys_menu m WHERE r.role_code='hr' AND m.menu_code IN ('hr','oa','report');
-- procurement: 客户/进销存/报表中心
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, can_view, can_add, can_edit, can_delete)
SELECT r.id, m.id, 1, 0, 0, 0 FROM sys_role r, sys_menu m WHERE r.role_code='procurement' AND m.menu_code IN ('cust','trade','report');
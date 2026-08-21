-- ============================================================
-- ERP 数据基础重构脚本 v2 (upgrade2.sql)  — 幂等，可重复加载
-- 依赖：先加载 init.sql + upgrade.sql
-- 内容：
--   1) 元数据基础表：sys_dict_type / sys_dict_item / sys_dict_column / sys_table_registry
--   2) 状态字典种子数据（颜色/排序，前端按此渲染）
--   3) 核心单据表数据清洗（空单号置 NULL、重复单号去重、孤儿明细删除）
--   4) 唯一键 + 二级索引 + 主从外键（ON DELETE CASCADE）
--   5) 字段类型修正（计数列 DECIMAL → INT）
-- 配套：registry_seed.sql（表注册表 319 张表种子，自动生成）
-- ============================================================
USE erp_system;
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

-- ========== 1. 元数据基础表 ==========
CREATE TABLE IF NOT EXISTS sys_dict_type (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  dict_code  VARCHAR(64)  NOT NULL UNIQUE COMMENT '字典编码，如 doc.status',
  dict_name  VARCHAR(100) NOT NULL COMMENT '字典名称',
  remark     VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='字典类型';

CREATE TABLE IF NOT EXISTS sys_dict_item (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  dict_code  VARCHAR(64)  NOT NULL COMMENT '所属字典编码',
  item_value VARCHAR(64)  NOT NULL COMMENT '存库值',
  item_label VARCHAR(100) NOT NULL COMMENT '显示名',
  color      VARCHAR(20)  NULL COMMENT '前端颜色主题: green/amber/red/blue/gray',
  sort_no    INT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_dict_item (dict_code, item_value)
) ENGINE=InnoDB COMMENT='字典项';

CREATE TABLE IF NOT EXISTS sys_dict_column (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  table_name  VARCHAR(64) NOT NULL,
  column_name VARCHAR(64) NOT NULL,
  dict_code   VARCHAR(64) NOT NULL COMMENT '该列取值必须命中 sys_dict_item',
  UNIQUE KEY uk_dict_column (table_name, column_name)
) ENGINE=InnoDB COMMENT='列级字典绑定（写入时校验取值）';

CREATE TABLE IF NOT EXISTS sys_table_registry (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  table_name VARCHAR(64)  NOT NULL UNIQUE COMMENT '物理表名',
  cn_name    VARCHAR(100) NOT NULL COMMENT '中文表名',
  module     VARCHAR(50)  NOT NULL COMMENT '一级模块（菜单/权限粒度）',
  sub_module VARCHAR(50)  NOT NULL COMMENT '二级分类',
  sort_no    INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='表注册表：/meta 元数据端点与前端菜单的真源';

-- ========== 2. 状态字典种子 ==========
INSERT IGNORE INTO sys_dict_type(dict_code, dict_name) VALUES
('doc.status',   '单据通用状态'),
('common.enable','启用停用'),
('stock.status', '库存状态'),
('common.yesno', '是否');

INSERT IGNORE INTO sys_dict_item(dict_code, item_value, item_label, color, sort_no) VALUES
('doc.status','草稿','草稿','gray',1),
('doc.status','待审核','待审核','amber',2),
('doc.status','已审核','已审核','blue',3),
('doc.status','已入库','已入库','green',4),
('doc.status','已出库','已出库','green',5),
('doc.status','已发货','已发货','green',6),
('doc.status','已完成','已完成','green',7),
('doc.status','进行中','进行中','blue',8),
('doc.status','已驳回','已驳回','red',9),
('doc.status','已取消','已取消','red',10),
('doc.status','已关闭','已关闭','gray',11),
('common.enable','启用','启用','green',1),
('common.enable','停用','停用','red',2),
('stock.status','正常','正常','green',1),
('stock.status','预警','预警','amber',2),
('stock.status','呆滞','呆滞','gray',3),
('common.yesno','是','是','blue',1),
('common.yesno','否','否','gray',2);

-- 列级字典绑定（写入口按此校验；新值需先入字典）
INSERT IGNORE INTO sys_dict_column(table_name, column_name, dict_code) VALUES
('trade_sales_main','sales_status','doc.status'),
('trade_purchase_main','purchase_status','doc.status'),
('trade_stock_in_main','status','doc.status'),
('trade_stock_out_main','status','doc.status'),
('trade_delivery_main','status','doc.status'),
('trade_inventory_balance','stock_status','stock.status'),
('voucher_main','voucher_status','doc.status'),
('trade_goods_main','status','common.enable'),
('cust_customer_main','status','common.enable'),
('supp_supplier_main','status','common.enable');

-- ========== 3. 幂等 DDL 辅助过程 ==========
DROP PROCEDURE IF EXISTS erp_meta_ddl;
DELIMITER $$
CREATE PROCEDURE erp_meta_ddl(IN p_kind VARCHAR(10), IN p_tbl VARCHAR(64), IN p_name VARCHAR(64), IN p_ddl VARCHAR(500))
-- p_kind: INDEX | FK | COLUMN
proc_:BEGIN
  IF p_kind = 'INDEX' THEN
    IF EXISTS (SELECT 1 FROM information_schema.statistics
               WHERE table_schema = DATABASE() AND table_name = p_tbl AND index_name = p_name) THEN LEAVE proc_; END IF;
  ELSEIF p_kind = 'FK' THEN
    IF EXISTS (SELECT 1 FROM information_schema.referential_constraints
               WHERE constraint_schema = DATABASE() AND table_name = p_tbl AND constraint_name = p_name) THEN LEAVE proc_; END IF;
  ELSEIF p_kind = 'COLUMN' THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = DATABASE() AND table_name = p_tbl AND column_name = p_name) THEN LEAVE proc_; END IF;
  END IF;
  SET @ddl = CONCAT('ALTER TABLE `', p_tbl, '` ADD ', p_ddl);
  PREPARE st FROM @ddl; EXECUTE st; DEALLOCATE PREPARE st;
END$$
DELIMITER ;

-- ========== 4. 核心表数据清洗（加唯一键/外键的前置条件）==========
-- 4.1 空字符串单号统一置 NULL（否则唯一键把多条空单号视为重复）
UPDATE trade_sales_main     SET sales_no     = NULL WHERE sales_no     = '';
UPDATE trade_purchase_main  SET purchase_no  = NULL WHERE purchase_no  = '';
UPDATE trade_stock_in_main  SET in_no        = NULL WHERE in_no        = '';
UPDATE trade_stock_out_main SET out_no       = NULL WHERE out_no       = '';
UPDATE voucher_main         SET voucher_no   = NULL WHERE voucher_no   = '';

-- 4.2 重复单号去重（保留最早一条），保证单号可加唯一键
DELETE m FROM trade_sales_main     m JOIN (SELECT sales_no, MIN(id) keep_id FROM trade_sales_main     WHERE sales_no IS NOT NULL GROUP BY sales_no     HAVING COUNT(*) > 1) d ON m.sales_no = d.sales_no     AND m.id > d.keep_id;
DELETE m FROM trade_purchase_main  m JOIN (SELECT purchase_no, MIN(id) keep_id FROM trade_purchase_main WHERE purchase_no IS NOT NULL GROUP BY purchase_no HAVING COUNT(*) > 1) d ON m.purchase_no = d.purchase_no AND m.id > d.keep_id;
DELETE m FROM trade_stock_in_main  m JOIN (SELECT in_no, MIN(id) keep_id FROM trade_stock_in_main  WHERE in_no IS NOT NULL GROUP BY in_no HAVING COUNT(*) > 1) d ON m.in_no = d.in_no AND m.id > d.keep_id;
DELETE m FROM trade_stock_out_main m JOIN (SELECT out_no, MIN(id) keep_id FROM trade_stock_out_main WHERE out_no IS NOT NULL GROUP BY out_no HAVING COUNT(*) > 1) d ON m.out_no = d.out_no AND m.id > d.keep_id;
DELETE m FROM voucher_main         m JOIN (SELECT voucher_no, MIN(id) keep_id FROM voucher_main WHERE voucher_no IS NOT NULL GROUP BY voucher_no HAVING COUNT(*) > 1) d ON m.voucher_no = d.voucher_no AND m.id > d.keep_id;

-- 4.3 孤儿明细删除（明细单号在主表不存在），保证外键可创建
DELETE d FROM trade_sales_detail     d LEFT JOIN trade_sales_main     m ON d.sales_no    = m.sales_no     WHERE d.sales_no    IS NOT NULL AND m.id IS NULL;
DELETE d FROM trade_purchase_detail  d LEFT JOIN trade_purchase_main  m ON d.purchase_no = m.purchase_no  WHERE d.purchase_no IS NOT NULL AND m.id IS NULL;
DELETE d FROM trade_stock_in_detail  d LEFT JOIN trade_stock_in_main  m ON d.in_no       = m.in_no        WHERE d.in_no       IS NOT NULL AND m.id IS NULL;
DELETE d FROM trade_stock_out_detail d LEFT JOIN trade_stock_out_main m ON d.out_no      = m.out_no       WHERE d.out_no      IS NOT NULL AND m.id IS NULL;
DELETE d FROM voucher_detail         d LEFT JOIN voucher_main         m ON d.voucher_no  = m.voucher_no   WHERE d.voucher_no  IS NOT NULL AND m.id IS NULL;
-- 空单号明细（无归属）一并清理
DELETE FROM trade_sales_detail     WHERE sales_no    IS NULL OR sales_no    = '';
DELETE FROM trade_purchase_detail  WHERE purchase_no IS NULL OR purchase_no = '';
DELETE FROM trade_stock_in_detail  WHERE in_no       IS NULL OR in_no       = '';
DELETE FROM trade_stock_out_detail WHERE out_no      IS NULL OR out_no      = '';
DELETE FROM voucher_detail         WHERE voucher_no  IS NULL OR voucher_no  = '';

-- ========== 5. 唯一键（单号唯一 = 库层防重单）==========
CALL erp_meta_ddl('INDEX','trade_sales_main','uk_sales_no','UNIQUE INDEX uk_sales_no (sales_no)');
CALL erp_meta_ddl('INDEX','trade_purchase_main','uk_purchase_no','UNIQUE INDEX uk_purchase_no (purchase_no)');
CALL erp_meta_ddl('INDEX','trade_stock_in_main','uk_in_no','UNIQUE INDEX uk_in_no (in_no)');
CALL erp_meta_ddl('INDEX','trade_stock_out_main','uk_out_no','UNIQUE INDEX uk_out_no (out_no)');
CALL erp_meta_ddl('INDEX','voucher_main','uk_voucher_no','UNIQUE INDEX uk_voucher_no (voucher_no)');
CALL erp_meta_ddl('INDEX','trade_goods_main','uk_product_code','UNIQUE INDEX uk_product_code (product_code)');
CALL erp_meta_ddl('INDEX','cust_customer_main','uk_customer_code','UNIQUE INDEX uk_customer_code (customer_code)');
CALL erp_meta_ddl('INDEX','supp_supplier_main','uk_supplier_code','UNIQUE INDEX uk_supplier_code (supplier_code)');
CALL erp_meta_ddl('INDEX','prod_work_order','uk_work_order_no','UNIQUE INDEX uk_work_order_no (work_order_no)');
CALL erp_meta_ddl('INDEX','hr_employee_main','uk_emp_no','UNIQUE INDEX uk_emp_no (emp_no)');
-- 库存结存：同商品同仓库只允许一行（真源唯一性）
CALL erp_meta_ddl('INDEX','trade_inventory_balance','uk_prod_wh','UNIQUE INDEX uk_prod_wh (product_code, warehouse)');

-- ========== 6. 关联列二级索引（主从/高频检索）==========
CALL erp_meta_ddl('INDEX','trade_sales_detail','idx_tsd_sales_no','INDEX idx_tsd_sales_no (sales_no)');
CALL erp_meta_ddl('INDEX','trade_purchase_detail','idx_tpd_purchase_no','INDEX idx_tpd_purchase_no (purchase_no)');
CALL erp_meta_ddl('INDEX','trade_stock_in_detail','idx_tsid_in_no','INDEX idx_tsid_in_no (in_no)');
CALL erp_meta_ddl('INDEX','trade_stock_out_detail','idx_tsod_out_no','INDEX idx_tsod_out_no (out_no)');
CALL erp_meta_ddl('INDEX','voucher_detail','idx_vd_voucher_no','INDEX idx_vd_voucher_no (voucher_no)');
CALL erp_meta_ddl('INDEX','trade_stock_log','idx_tsl_product','INDEX idx_tsl_product (product_code, warehouse)');
CALL erp_meta_ddl('INDEX','trade_stock_log','idx_tsl_ref','INDEX idx_tsl_ref (ref_no)');
CALL erp_meta_ddl('INDEX','trade_sales_main','idx_tsm_date','INDEX idx_tsm_date (sales_date)');
CALL erp_meta_ddl('INDEX','trade_purchase_main','idx_tpm_date','INDEX idx_tpm_date (purchase_date)');
CALL erp_meta_ddl('INDEX','trade_sales_detail','idx_tsd_product','INDEX idx_tsd_product (product_code)');
CALL erp_meta_ddl('INDEX','trade_purchase_detail','idx_tpd_product','INDEX idx_tpd_product (product_code)');
CALL erp_meta_ddl('INDEX','prod_bom_structure','idx_pbs_product','INDEX idx_pbs_product (product_code)');
CALL erp_meta_ddl('INDEX','account_general_ledger','idx_agl_voucher','INDEX idx_agl_voucher (voucher_no)');
CALL erp_meta_ddl('INDEX','account_subject_balance','idx_asb_period','INDEX idx_asb_period (period, subject_code)');

-- ========== 7. 主从外键（ON DELETE CASCADE：删主单连带明细）==========
CALL erp_meta_ddl('FK','trade_sales_detail','fk_tsd_main','CONSTRAINT fk_tsd_main FOREIGN KEY (sales_no) REFERENCES trade_sales_main (sales_no) ON DELETE CASCADE');
CALL erp_meta_ddl('FK','trade_purchase_detail','fk_tpd_main','CONSTRAINT fk_tpd_main FOREIGN KEY (purchase_no) REFERENCES trade_purchase_main (purchase_no) ON DELETE CASCADE');
CALL erp_meta_ddl('FK','trade_stock_in_detail','fk_tsid_main','CONSTRAINT fk_tsid_main FOREIGN KEY (in_no) REFERENCES trade_stock_in_main (in_no) ON DELETE CASCADE');
CALL erp_meta_ddl('FK','trade_stock_out_detail','fk_tsod_main','CONSTRAINT fk_tsod_main FOREIGN KEY (out_no) REFERENCES trade_stock_out_main (out_no) ON DELETE CASCADE');
CALL erp_meta_ddl('FK','voucher_detail','fk_vd_main','CONSTRAINT fk_vd_main FOREIGN KEY (voucher_no) REFERENCES voucher_main (voucher_no) ON DELETE CASCADE');

-- ========== 8. 字段类型修正（upgrade.sql 推断型空壳的典型病灶）==========
DELIMITER $$
DROP PROCEDURE IF EXISTS erp_fix_type $$
CREATE PROCEDURE erp_fix_type(IN p_tbl VARCHAR(64), IN p_col VARCHAR(64), IN p_check_suffix VARCHAR(64), IN p_ddl VARCHAR(500))
proc_:BEGIN
  -- 仅当列存在且当前类型不是目标类型时执行
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = p_tbl AND column_name = p_col
               AND UPPER(COLUMN_TYPE) NOT LIKE CONCAT('%', UPPER(p_check_suffix), '%')) THEN
    SET @ddl = CONCAT('ALTER TABLE `', p_tbl, '` MODIFY ', p_ddl);
    PREPARE st FROM @ddl; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END$$
DELIMITER ;
CALL erp_fix_type('hr_employee_contract','renew_count','int','`renew_count` INT NULL DEFAULT 0 COMMENT ''续签次数''');
DROP PROCEDURE IF EXISTS erp_fix_type;

DROP PROCEDURE IF EXISTS erp_meta_ddl;

-- ========== 9. 表注册表种子（自动生成文件，319 张表）==========
-- SOURCE registry_seed.sql;  -- 请单独执行: mysql --default-character-set=utf8mb4 erp_system < registry_seed.sql

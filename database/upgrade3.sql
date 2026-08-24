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

-- 状态列字典绑定补齐（前端彩色签 & 写入口校验）
INSERT IGNORE INTO sys_dict_column(table_name, column_name, dict_code) VALUES
('trade_sales_main','shipping_status','doc.status');

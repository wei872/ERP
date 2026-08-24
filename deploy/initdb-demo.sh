#!/bin/sh
# MySQL 首次初始化时按 SEED_DEMO_DATA 开关决定是否装载演示数据
# （仅在数据卷为空、执行 docker-entrypoint-initdb.d 时运行一次）
set -e
if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
  echo "[initdb] 正在装载演示数据集（9个月全链路自洽数据）..."
  mysql --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" erp_system < /tmp/demo_data.sql
  echo "[initdb] 演示数据装载完成"
else
  echo "[initdb] SEED_DEMO_DATA != true，跳过演示数据"
fi

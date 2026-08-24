#!/bin/sh
# ============================================================
# ERP 数据库自动备份脚本（配合 docker compose 部署）
# 用法：
#   1) chmod +x deploy/backup.sh
#   2) crontab -e 添加（每天凌晨 2 点）：
#      0 2 * * * /路径/erp/deploy/backup.sh >> /路径/erp/deploy/backup.log 2>&1
# 环境变量（可选）：
#   BACKUP_DIR  备份目录（默认 ./backups）
#   KEEP_DAYS   保留天数（默认 30）
#   DB_CONTAINER 数据库容器名（默认 erp-db）
# ============================================================
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HERE/backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
DB_CONTAINER="${DB_CONTAINER:-erp-db}"
STAMP="$(date +%F_%H%M%S)"

mkdir -p "$BACKUP_DIR"

echo "[$(date '+%F %T')] 开始备份 $DB_CONTAINER ..."
docker exec "$DB_CONTAINER" sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers erp_system | gzip -6' \
  > "$BACKUP_DIR/erp_$STAMP.sql.gz"

SIZE="$(du -h "$BACKUP_DIR/erp_$STAMP.sql.gz" | cut -f1)"
echo "[$(date '+%F %T')] 备份完成: erp_$STAMP.sql.gz ($SIZE)"

# 清理过期备份
find "$BACKUP_DIR" -name 'erp_*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "[$(date '+%F %T')] 已清理 $KEEP_DAYS 天前的旧备份"

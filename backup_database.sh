#!/bin/bash
# Backup script for Torlan POS Cloud SQL Database
# This script exports the entire database to a local SQL file

# Configuration
PROJECT_ID="pos-torlan"
INSTANCE_NAME="torlan-mysql"
DATABASE_NAME="torlan_pos"
BACKUP_DIR="./database_backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/torlan_pos_backup_${TIMESTAMP}.sql"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "🔄 Starting database backup..."
echo "📅 Timestamp: $TIMESTAMP"
echo "📁 Backup file: $BACKUP_FILE"
echo ""

# Export database using Cloud SQL Proxy or direct connection
# Option 1: Using gcloud (recommended for Cloud SQL)
echo "Exporting database from Cloud SQL..."
gcloud sql export sql "$INSTANCE_NAME" "gs://pos-torlan-backups/backup_${TIMESTAMP}.sql" \
  --database="$DATABASE_NAME" \
  --project="$PROJECT_ID"

if [ $? -eq 0 ]; then
    echo "✅ Cloud backup created successfully!"
    echo "📦 Location: gs://pos-torlan-backups/backup_${TIMESTAMP}.sql"
    echo ""
    echo "To download locally, run:"
    echo "gsutil cp gs://pos-torlan-backups/backup_${TIMESTAMP}.sql $BACKUP_FILE"
else
    echo "❌ Backup failed!"
    exit 1
fi

# Option 2: Local backup using mysqldump (if you have local MySQL access)
# Uncomment the following lines if you want to create a local backup
# echo "Creating local backup..."
# mysqldump -h 127.0.0.1 -u torlan_user -p torlan_pos > "$BACKUP_FILE"
# 
# if [ $? -eq 0 ]; then
#     echo "✅ Local backup created successfully!"
#     echo "📦 Location: $BACKUP_FILE"
#     SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
#     echo "💾 Size: $SIZE"
# else
#     echo "❌ Local backup failed!"
#     exit 1
# fi

echo ""
echo "🎉 Backup process completed!"

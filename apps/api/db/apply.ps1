# PostgreSQL に DDL とシードを適用する補助スクリプト。
# Spring Boot を起動せずに DDL だけ流したい場合に使う。
#
# 前提:
#   docker compose -f apps/api-spring/docker-compose.yaml up -d
#
# 使い方:
#   pwsh apps/api/db/apply.ps1

param(
  [string]$DbUrl  = "postgres://resident:resident@localhost:5432/resident",
  [string]$DdlDir = "apps/api-spring/src/main/resources/db/migration"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  Write-Host "psql コマンドが見つかりません。PostgreSQL クライアントを PATH に追加してください。"
  exit 1
}

Get-ChildItem -Path $DdlDir -Filter "V*.sql" | Sort-Object Name | ForEach-Object {
  Write-Host "==> Applying $($_.Name)"
  psql $DbUrl -v ON_ERROR_STOP=1 -f $_.FullName
}

Write-Host "Done."

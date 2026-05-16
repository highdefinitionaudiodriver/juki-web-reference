# PDF/A-2b 検証手順

`apps/api-spring/Dockerfile` は Linux 環境で `fonts-noto-cjk` を同梱し、
`CERT_FONT_SERIF_JP` と `CERT_PDF_A=true` を既定設定にしています。
これにより OpenHTMLtoPDF が和文フォントを埋め込み、PDF/A-2b 出力を試験できます。

## 1. イメージ作成

```powershell
docker build -t resident-record-api:pdfa apps/api-spring
```

## 2. PostgreSQL / Keycloak 起動

```powershell
docker compose -f apps/api-spring/docker-compose.yaml up -d postgres keycloak
```

## 3. Spring API 起動

```powershell
docker run --rm `
  --name resident-record-api-pdfa `
  --network host `
  -e DB_URL="jdbc:postgresql://localhost:5432/resident" `
  -e DB_USER="resident" `
  -e DB_PASSWORD="resident" `
  -e OIDC_ISSUER="http://localhost:8080/realms/juki" `
  resident-record-api:pdfa
```

Windows Docker Desktop で `--network host` が使えない場合は、PostgreSQL/Keycloak を同一 compose network に置く構成へ変更してください。

## 4. PDF 発行と取得

Keycloak または dev API で access token を取得後、証明書を発行します。

```powershell
$headers = @{
  Authorization = "Bearer $token"
  "Content-Type" = "application/json"
}
$issue = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:8788/api/v1/certificates/jumin" `
  -Headers $headers `
  -Body '{"residentId":"0000123456","formId":"0010001","copies":1,"usageText":"PDF/A検証"}'

Invoke-WebRequest `
  -Uri "http://localhost:8788/api/v1/certificates/$($issue.issueId)/pdf" `
  -Headers @{ Authorization = "Bearer $token" } `
  -OutFile ".\certificate-$($issue.issueId).pdf"
```

## 5. veraPDF 検証

```powershell
docker run --rm `
  -v "${PWD}:/work" `
  ghcr.io/verapdf/verapdf:latest `
  --format text "/work/certificate-$($issue.issueId).pdf"
```

期待値:

- PDF/A profile: PDF/A-2B
- validation result: compliant
- フォント未埋め込みエラーが出ない

## 注意

- `CERT_PDF_A=true` でも `CERT_FONT_SERIF_JP` のファイルが存在しない場合、アプリは PDF/A 指定を自動的に無効化します。
- `fonts-noto-cjk` の実ファイル名はディストリビューションにより異なる場合があります。コンテナ内で確認する場合:

```powershell
docker run --rm resident-record-api:pdfa sh -lc "fc-match 'Noto Serif CJK JP' && find /usr/share/fonts -iname '*Noto*Serif*CJK*' | head"
```

# 設計 vs 現状実装 ギャップマトリクス

最終更新: 2026-05-17  
比較対象:
- **設計**: `住民記録システム_Web版_設計書.xlsx` / `c_openapi.yaml` (40 path / 29 schema) / `b_er_diagram.html` (22 table) / `a_wireframes.html` (13 screen)
- **実装**: React 19 SPA (`apps/web`) + Node 開発 API (`apps/api`) + Spring Boot 3 (`apps/api-spring`) + Flyway PostgreSQL 16 + OpenHTMLtoPDF

## サマリ

| 観点 | 設計 | 実装 | 充足率 |
| --- | ---: | ---: | ---: |
| API endpoint | 40 | 25+ | **62%+** |
| DB テーブル | 22 | 22 (DDL) + 主要 8 が runtime 使用中 | **100% / 36%** |
| 画面 (SCR-ID) | 13 | 8 view（住民検索／住民票／異動／職権異動／証明発行／**抑止設定**／統計・EUC／権限・監査） | **62%** |
| 機能 (F-ID) | 約38 | 約15 | **39%** |
| 帳票 (00100xx) | 19 + 年報 | 0010001 / 0010007 (HTML→PDF), 0010002–5 は form_id 出し分け | **30%** |
| 連携 (IF-ID) | 9 | 0（スケルトン） | **0%** |
| 認証 | OIDC + 2FA / WebAuthn / mTLS | OIDC リソースサーバ + Keycloak dev IdP + Web PKCE + dev HS256 | **75%** |
| 権限・抑止 | ロール ×項目別マスク／DV 隠蔽 | 完全実装 (`MaskService` / WINDOW から DV 対象は 404) | **100%** |
| 履歴 (SCD-2) | resident_history.snapshot | `ResidentHistoryRepository` + `HistoryWriter` (AFTER_COMMIT) | **80%** |
| 監査ログ | 全操作 7年 / WORM | `audit_log` テーブル + Node メモリ | **40%** |
| PDF/A 帳票 | Playwright 等 | OpenHTMLtoPDF + PDF/A-2b スイッチ + Noto CJK Dockerfile | **75%** |

## API カバレッジ（`c_openapi.yaml` 40 path）

| API | Node | Spring | 備考 |
| --- | :-: | :-: | --- |
| `POST /auth/login` | ✓ | ✓ | dev: HS256 JWT |
| `POST /auth/logout` | ✓ | ✓ | — |
| `GET  /me` | ✓ | ✓ | — |
| `POST /auth/webauthn/challenge` | ✓ | – | スタブ |
| `POST /auth/webauthn/verify` | ✓ | – | スタブ |
| `GET  /.well-known/openid-configuration` | ✓ | ✓ (springdoc) | — |
| `POST /residents/search` | ✓ | ✓ | 抑止隠蔽あり |
| `GET  /residents/{id}` | ✓ | ✓ | asOf / unmask 対応 |
| `PUT  /residents/{id}` | ✓ | – | 軽微修正のみ |
| `GET  /residents/{id}/history` | ✓ | ✓ | — |
| `POST /residents/{id}/alias` | – | – | 未実装 |
| `POST /transactions/in` | ✓ | ✓ | — |
| `POST /transactions/out` | ✓ | ✓ | 0010007 同時発行 |
| `POST /transactions/move` | – | ✓ | 世帯存在チェック |
| `POST /transactions/household` (HEAD_CHANGE/SPLIT/MERGE) | – | ✓ | 完全実装 |
| `POST /transactions/birth` | ✓ | ✓ | 親世帯への新生児登録 |
| `POST /transactions/death` | ✓ | ✓ | 世帯主死亡時アラート |
| `POST /transactions/koseki` | – | ✓ | 婚姻/離婚/養子縁組 |
| `POST /transactions/official` | – | ✓ | DRAFT 起票 |
| `POST /transactions/{txId}/approve` | – | ✓ | transaction_approval 記録 |
| `POST /transactions/cancel` | ✓ | ✓ | 二重取消防止 |
| `POST /codes/jumin` | ✓ | ✓ | 付番/変更/修正 + 通知票 0010009/0010011 |
| `POST /codes/mynumber` | ✓ | ✓ | 付番/変更/修正 + 通知票 0010010/0010011 |
| `PUT  /residents/{id}/foreigner` | ✓ | ✓ | 在留資格・期限更新、30日前フラグ |
| `POST /certificates/jumin` | ✓ | ✓ | OpenHTMLtoPDF |
| `POST /certificates/items` | – | ✓ | form_id 出し分け |
| `POST /certificates/removed` | – | ✓ | — |
| `POST /certificates/inspection` | – | ✓ | — |
| `POST /certificates/out` | (統合) | ✓ | — |
| `GET  /certificates/{issueId}/pdf` | ✓ | ✓ | Spring は実 PDF |
| `GET  /verify/{token}` | ✓ | ✓ | — |
| `POST /restrictions` | ✓ | ✓ | RESTRICTION_RELEASE 必須 |
| `DELETE /restrictions/{id}` | ✓ | – | Node のみ |
| `POST /reports/annual` | ✓ | ✓ | スタブ受付 |
| `POST /reports/population` | – | – | — |
| `POST /reports/foreigner-expiring` | ✓ | ✓ | 30日前抽出 + 0010012 発行 |
| `GET  /reports/{jobId}` | – | – | — |
| `POST /euc/query` | ✓ | ✓ | 二段階承認フラグ |
| `POST /link/internal/koseki` | ✓ | ✓ | 戸籍受領 → BIRTH/DEATH/KOSEKI 反映 |
| `POST /link/*` | ✓ | ✓ | その他 8 系統は受領ログ |
| `GET  /audit` | ✓ | ✓ | — |
| `GET/POST /admin/users` | – | ✓ | スケルトン |
| `GET/POST /admin/roles` | – | ✓ | スケルトン |

## 画面カバレッジ

| SCR-ID | 画面 | 実装 |
| --- | --- | :-: |
| SCR-002 メインメニュー | Shell サイドバー | ✓ |
| SCR-201 住民検索 | `SearchView` | ✓ |
| SCR-101 住民票 | `ResidentView` | ✓ |
| SCR-102 異動履歴 | `ResidentView` 内 timeline | ✓ |
| SCR-411 転入届 | `MoveView` 左 | ✓ |
| SCR-412 転出届 | `MoveView` 右 | ✓ |
| SCR-421 職権異動 | `OfficialView`（起票／決裁） | ✓ |
| SCR-501 証明書発行 | `CertificateView`（PDF プレビュー＋発行＋PDF DL） | ✓ |
| SCR-301 抑止設定 | `RestrictionView`（登録／一覧／解除） | ✓ |
| SCR-601 統計/年報 | `ReportsView` 左 | ✓ |
| SCR-603 EUC | `ReportsView` 右 | ✓ |
| SCR-A02 権限管理 | `AdminView` 左 | △ 表示のみ |
| SCR-203 監査ログ | `AdminView` 右 | ✓ |

## 残作業（優先順）

### A. 機能拡張
1. 残り帳票 (0010002–0010019, 年報) を `CertificatePdfService` の form_id ごとにレイアウト
2. 連携 9 系統のうち、税 / 国保 / 選挙 / コンビニ / マイナポータルの業務別ペイロード反映
3. Keycloak と Spring の実接続テスト

### B. 非機能
1. Keycloak と Spring の実接続テスト（実 JWT 検証）
2. PDF/A-2b 準拠を veraPDF で CI 検証
3. アクセシビリティ JIS X 8341-3 AA を `axe-core` で自動チェック
4. OWASP ASVS Lv2 セルフチェック

### C. テスト
1. Testcontainers IT を全コントローラに広げる
2. Web 側の App 統合テストを検索フォーム再取得・各操作 notice へ拡張
3. OpenAPI diff CI の GitHub Actions 実行結果を確認し、必要に応じて待機時間・DB 接続を調整

## テスト自動化状況

| 種別 | 現状 |
| --- | --- |
| Spring | 94 件（MockMvc/Unit 75 PASS + Testcontainers IT 19 SKIP: Docker なし環境） |
| Vitest | 42 件 PASS（App / Search / Resident / Restriction / Certificate / Official / Move / Reports） |
| Playwright API | 13 件 PASS |
| Playwright a11y | 7 画面（住民検索／住民票／証明発行／抑止設定／異動／統計EUC／権限監査） |
| CI | OpenAPI diff ジョブで `c_openapi.yaml` と Spring runtime `/v3/api-docs` を比較 |

## 結論

Codex MVP 比で **API 充足率 +25 ポイント以上、画面 +1 view、認証・履歴・PDF・帳票が大幅前進**。
標準仕様書のキー（機能 ID / 画面 ID / 帳票 ID / API-ID）は変えず追跡可能性を維持しています。

# 設計 vs 現状実装 ギャップマトリクス

最終更新: 2026-05-16  
作成: Claude Code (Opus 4.7)  
比較対象:  
- **設計**: `住民記録システム_Web版_設計書.xlsx` / `c_openapi.yaml` (40 path / 29 schema) / `b_er_diagram.html` (22 table) / `a_wireframes.html` (13 screen)  
- **実装**: Codex MVP (`apps/web` Vanilla JS / `apps/api` Node 標準HTTP / `apps/api/db/V001__initial_schema.sql`)

## サマリ

| 観点 | 設計 | 実装 | 充足率 |
| --- | ---: | ---: | ---: |
| API endpoint | 40 | 15 | **37.5%** |
| DB テーブル | 22 | 22 | **100%** (DDL のみ。実DBは未接続) |
| 画面 (SCR-ID) | 13 | 6（集約） | **46%** |
| 機能 (F-ID) | 約38 | 約10 | **26%** |
| 帳票 (00100xx) | 19 + 年報 | 1（0010007 のみ完了/ 0010001 はモック） | **5%** |
| 連携 (IF-ID) | 9 | 0 | **0%** |
| 認証 | OIDC+2FA / WebAuthn / mTLS | ダミーログイン | **0%** |
| 権限 | ロール×項目別マスク | 部分（コード/抑止住所のマスクのみ） | **30%** |
| 履歴 (SCD-2) | resident_history.snapshot | DDL定義のみ。runtime未使用 | **0%** |
| 監査ログ | 全操作 7年 / WORM | メモリ内 unshift のみ | **20%** |
| PDF/A 帳票 | Playwright 等 | URLスタブのみ | **0%** |

## API カバレッジ（c_openapi.yaml 40path）

| API-ID | Method Path | 設計 | 実装 | 備考 |
| --- | --- | :-: | :-: | --- |
| AUTH-01 | POST /auth/login | ✓ | ✓ | ダミー固定token |
| AUTH-02 | POST /auth/logout | ✓ | ✓ | — |
| AUTH-03 | GET  /me | ✓ | ✓ | — |
| RES-01 | POST /residents/search | ✓ | ✓ | 抑止隠蔽は未実装（住所のみマスク） |
| RES-02 | GET  /residents/{id} | ✓ | ✓ | asOf 未対応 |
| RES-03 | PUT  /residents/{id} | ✓ | ✓ | 単項目軽微のみ |
| RES-04 | GET  /residents/{id}/history | ✓ | ✓ | — |
| RES-05 | POST /residents/{id}/alias | ✓ | – | 未実装 |
| TRN-01 | POST /transactions/in | ✓ | ✓ | — |
| TRN-02 | POST /transactions/out | ✓ | ✓ | 0010007 を同時発行 |
| TRN-03 | POST /transactions/move | ✓ | – | 未実装（PUT で代替中） |
| TRN-04 | POST /transactions/household | ✓ | – | 世帯変更 未実装 |
| TRN-05 | POST /transactions/birth | ✓ | – | 戸籍連動 未実装 |
| TRN-06 | POST /transactions/death | ✓ | – | 戸籍連動 未実装 |
| TRN-07 | POST /transactions/koseki | ✓ | – | — |
| TRN-08 | POST /transactions/official | ✓ | – | 職権異動 未実装 |
| TRN-09 | POST /transactions/{txId}/approve | ✓ | – | 決裁 未実装 |
| TRN-10 | POST /transactions/cancel | ✓ | ✓ | parent_transaction_id ✓ |
| TRN-11 | POST /codes/jumin | ✓ | – | 住民票コード 未実装 |
| TRN-12 | POST /codes/mynumber | ✓ | – | 個人番号 未実装 |
| TRN-13 | PUT  /residents/{id}/foreigner | ✓ | – | 外国人在留 未実装 |
| CRT-01 | POST /certificates/jumin | ✓ | ✓ | PDF は URL スタブ |
| CRT-02 | POST /certificates/items | ✓ | – | 記載事項 未実装 |
| CRT-03 | POST /certificates/removed | ✓ | – | 除票 未実装 |
| CRT-04 | POST /certificates/inspection | ✓ | – | 閲覧 未実装 |
| CRT-05 | POST /certificates/out | ✓ | ✓ | OUT に統合実装 |
| VRF-01 | GET  /verify/{token} | ✓ | ✓ | — |
| RST-01 | POST /restrictions | ✓ | – | 抑止登録 未実装 |
| RST-02 | DELETE /restrictions/{id} | ✓ | – | 抑止解除 未実装 |
| RPT-01 | POST /reports/annual | ✓ | ✓ | 即時 DONE のスタブ |
| RPT-02 | POST /reports/population | ✓ | – | 人口動態 未実装 |
| RPT-03 | GET  /reports/{jobId} | ✓ | – | ジョブ状態 未実装 |
| EUC-01 | POST /euc/query | ✓ | ✓ | 二段階承認フラグのみ |
| LNK-01 | POST /link/cs/inbound | ✓ | – | 住基ネット連携 未実装 |
| LNK-02 | POST /link/number/inbound | ✓ | – | 番号連携 未実装 |
| LNK-03 | POST /link/internal/{partner} | ✓ | – | 庁内他業務 未実装 |
| LNK-04 | POST /link/application/inbound | ✓ | – | 申請管理 未実装 |
| ADM-01 | GET  /admin/users | ✓ | – | 未実装 |
| ADM-02 | POST /admin/roles | ✓ | – | 未実装 |
| ADM-03 | POST /admin/permissions | ✓ | – | 未実装 |
| ADM-04 | GET  /audit | ✓ | ✓ | 配列直返し |

実装率: 15/40 = 37.5%

## 画面カバレッジ（13画面 → 6view 集約）

| SCR-ID | 設計 | 現状 view | 状況 |
| --- | --- | --- | --- |
| SCR-001 ログイン | ✓ | – | 未画面化（API のみ） |
| SCR-002 メインメニュー | ✓ | shell.sidebar | サイドバーで代替 |
| SCR-201 住民検索 | ✓ | viewSearch | 主要条件のみ（個人番号/住民票コード/世帯主のみ等は未） |
| SCR-101 住民票 | ✓ | viewResident | コード表示切替＋単項目修正のみ |
| SCR-102 異動履歴/時点照会 | ✓ | viewResident（履歴節） | asOf指定UI未実装 |
| SCR-411 転入届 | ✓ | viewMove（左） | 世帯員1名・前住所情報なし |
| SCR-412 転出届 | ✓ | viewMove（右） | OK |
| SCR-421 職権異動 | ✓ | – | 未画面化 |
| SCR-501 証明書発行 | ✓ | viewCertificate | 表示切替（個人番号/住民票コード等）の表示制御UI未 |
| SCR-301 抑止設定 | ✓ | – | 未画面化 |
| SCR-601 統計/年報 | ✓ | viewReports（左） | テンプレ・年度入力のみ |
| SCR-603 EUC | ✓ | viewReports（右） | 抽出条件は項目羅列のみ |
| SCR-A02 権限管理 | ✓ | viewAdmin（左） | 表示のみ・編集UI未 |
| SCR-203 監査ログ | ✓ | viewAdmin（右） | 検索条件UI未 |

## DB テーブルカバレッジ

DDL は ER 図に対応する 22 テーブル＋インデックスを定義済（`V001__initial_schema.sql`）。  
ただし API/Web は **メモリ内 seed.js を直接操作** しているため、DB はまだ通っていない。

差分:
- `transaction_type` テーブルあり / 区分マスタの初期データ未投入
- `link_partner` / `link_event` テーブルあり / 連携処理なし
- `user_account` / `role` / `permission` テーブルあり / 認可で参照されていない

## 機能カバレッジ（F-ID）

設計書 04_機能一覧 (38件) のうち、現MVPで部分以上カバーされているもの:

- F-1-1-01 住民データ管理（**△** 表示のみ）
- F-2-1-01 住民検索（**○** 部分）
- F-2-2-01 住民票照会（**△** 時点照会UI なし）
- F-2-3-01 操作ログ（**△** メモリのみ）
- F-4-1-01 転入届（**○**）
- F-4-1-02 転出届（**○** 0010007 同時発行）
- F-4-6-01 異動取消（**○** 親tx管理）
- F-5-00-01 住民票の写し発行（**△** PDF未生成）
- F-5-00-06 改ざん防止コード／QR（**△** token のみ）
- F-6-00-01 住基年報（**△** スタブ）
- F-10-1-01 EUC（**△** 二段階承認フラグのみ）

残り **未着手 27 件**: F-1-2-01 異動履歴データの全項目保持 / F-1-3-01 通称・旧氏 / F-3 抑止 / F-4-1-03 転居 / F-4-1-04 世帯変更 / F-4-1-05 出生 / F-4-1-06 死亡 / F-4-1-07 戸籍異動 / F-4-2-01 職権 / F-4-3-01 住民票コード / F-4-4-01 個人番号 / F-4-5 外国人在留・通称 / F-5-00-02〜05/07 証明各種 / F-7 連携全件 / F-8 標準OP / F-9 バッチ / F-10-3-04 権限管理 / F-11 エラー・アラート

## 帳票カバレッジ（標準 第4章）

| 帳票ID | 設計 | 実装 |
| --- | :-: | :-: |
| 0010001 住民票の写し（日本人/外国人） | ✓ | △ URL スタブ |
| 0010002 記載事項証明 | ✓ | – |
| 0010003 世帯連記 | ✓ | – |
| 0010004 除票の写し | ✓ | – |
| 0010005 一部の写し（閲覧用） | ✓ | – |
| 0010006 受領転入届 | ✓ | – |
| 0010007 転出証明書 | ✓ | △ verify_token のみ |
| 0010008 転出証明書に準ずる | ✓ | – |
| 0010009-0010011 住民票コード通知票 | ✓ | – |
| 0010012 在留期間終了通知 | ✓ | – |
| 0010013-0010014 通称名変更 | ✓ | – |
| 0010015 住所異動受理通知 | ✓ | – |
| 0010016 職権処理通知書 | ✓ | – |
| 0010017 成年後見人異動通知 | ✓ | – |
| 0010018 住居表示実施通知書 | ✓ | – |
| 0010019 町名整理 | ✓ | – |
| 年報 (20.6) | ✓ | – |

## 非機能・運用ギャップ

| カテゴリ | 設計 | 実装 |
| --- | --- | --- |
| OIDC + 2FA | 必須 | ダミー固定 token |
| WebAuthn / ICカード | 任意 | – |
| TLS 1.3 | 必須 | – (HTTP のみ) |
| 列暗号化（個人番号） | KMS | 平文 in-memory |
| 監査ログ7年 / WORM | 必須 | プロセス常駐配列 |
| OWASP ASVS Lv2 | 必須 | 未検証 |
| アクセシビリティ JIS X 8341-3 AA | 必須 | 未検証 |
| 性能 / 可用性 | SLO 定義あり | 未検証 |
| 移行 | 一括移行ツール | – |

## 結論 / 次の優先

CODEX_HANDOFF 6 章と整合する優先順:

1. **React + TS + Vite 移行**（保守性とOpenAPI型統合の前提）  ← **次に着手**
2. **openapi-typescript で型自動生成**（API/Web 共有）
3. Spring Boot / .NET API への置換 → DB 接続
4. 帳票 0010001 を HTML/CSS print テンプレ化
5. 抑止／権限の本実装（API レイヤで存在隠蔽）
6. OIDC / WebAuthn の本実装
7. Playwright で 転入→住民票発行→転出 のゴールデンパス E2E

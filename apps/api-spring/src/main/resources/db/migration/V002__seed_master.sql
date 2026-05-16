-- 区分マスタおよびテスト用シード
insert into transaction_type (code, name, category) values
  ('IN',          '転入',     '届出'),
  ('OUT',         '転出',     '届出'),
  ('MOVE',        '転居',     '届出'),
  ('HOUSEHOLD',   '世帯変更', '届出'),
  ('BIRTH',       '出生',     '連動'),
  ('DEATH',       '死亡',     '連動'),
  ('KOSEKI',      '戸籍異動', '連動'),
  ('OFFICIAL',    '職権',     '職権'),
  ('CANCEL',      '取消',     '取消')
on conflict do nothing;

insert into role (role_id, name, description) values
  ('WINDOW',              '窓口担当',     '住民検索、証明発行'),
  ('REVIEW',              '異動審査',     '届出審査・職権起票'),
  ('RESTRICTION_RELEASE', '抑止解除権限', 'DV等支援措置対象の閲覧解除'),
  ('ADMIN',               'システム管理者', 'ユーザ・権限・連携設定の管理')
on conflict do nothing;

insert into link_partner (partner_id, name) values
  ('CS',         '住基ネットCS'),
  ('NUMBER',     '番号連携サーバ'),
  ('KOSEKI',     '戸籍システム'),
  ('TAX',        '税システム'),
  ('INSURANCE',  '国保・後期高齢'),
  ('ELECTION',   '選挙人名簿'),
  ('APPLICATION','申請管理システム'),
  ('CVS',        'コンビニ交付センター'),
  ('MYNAPORTAL', 'マイナポータル')
on conflict do nothing;

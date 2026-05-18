-- PDF/A CI ジョブ用の最小 fixture。
-- 証明書 0010001 を発行するために必要な user_account / household / resident /
-- household_member を投入する。
-- psql -h localhost -U resident -d resident -v ON_ERROR_STOP=1 -f この SQL

insert into user_account (user_id, employee_no, department, full_name)
values ('system', 'SYS', 'CI', 'CI System')
on conflict (user_id) do nothing;

insert into household (household_id, address_text, established_date)
values ('H-PDFA', '東京都サンプル市PDF1-1', '2020-01-01')
on conflict (household_id) do nothing;

insert into resident
  (resident_id, household_id, family_name_kanji, given_name_kanji, family_name_kana, given_name_kana,
   birth_date, sex, address_text, moved_in_date, restricted_flag, valid_from)
values ('R-PDFA', 'H-PDFA', '検証', '太郎', 'ケンショウ', 'タロウ',
        '1985-04-01', 'M', '東京都サンプル市PDF1-1', '2020-01-01', false, now())
on conflict (resident_id) do nothing;

insert into household_member (household_id, resident_id, relation_to_head, joined_date)
values ('H-PDFA', 'R-PDFA', '本人', '2020-01-01')
on conflict do nothing;

update household set head_resident_id = 'R-PDFA' where household_id = 'H-PDFA';

-- 投入確認（CI ログで可視化）
select 'seed_check' as check, count(*) as residents from resident where resident_id = 'R-PDFA';

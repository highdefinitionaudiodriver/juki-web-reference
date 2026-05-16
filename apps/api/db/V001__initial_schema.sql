create table resident (
  resident_id varchar(20) primary key,
  household_id varchar(20) not null,
  family_name_kanji varchar(120) not null,
  given_name_kanji varchar(120) not null,
  family_name_kana varchar(120) not null,
  given_name_kana varchar(120) not null,
  birth_date date not null,
  sex char(1) not null check (sex in ('M', 'F', 'U')),
  nationality varchar(120),
  address_code varchar(20),
  address_text varchar(500) not null,
  moved_in_date date not null,
  moved_out_date date,
  restricted_flag boolean not null default false,
  valid_from timestamptz not null,
  valid_to timestamptz
);
create table resident_foreigner (resident_id varchar(20) primary key references resident(resident_id), residence_status varchar(120), residence_period_end date, passport_no varchar(80), nationality_full varchar(120), alias_kanji varchar(240), special_permanent_resident boolean not null default false);
create table household (household_id varchar(20) primary key, head_resident_id varchar(20) references resident(resident_id), address_code varchar(20), address_text varchar(500) not null, established_date date not null, closed_date date);
create table household_member (household_id varchar(20) references household(household_id), resident_id varchar(20) references resident(resident_id), relation_to_head varchar(80) not null, joined_date date not null, left_date date, primary key (household_id, resident_id, joined_date));
create table resident_history (resident_id varchar(20) references resident(resident_id), valid_from timestamptz not null, valid_to timestamptz, snapshot jsonb not null, transaction_id varchar(30), primary key (resident_id, valid_from));
create table alias_name (alias_id bigserial primary key, resident_id varchar(20) not null references resident(resident_id), kind varchar(30) not null check (kind in ('ALIAS', 'FORMER_FAMILY')), value_kanji varchar(240) not null, value_kana varchar(240), valid_from date not null, valid_to date);
create table jumin_code (id bigserial primary key, resident_id varchar(20) not null references resident(resident_id), code varchar(11) not null, valid_from date not null, valid_to date, event varchar(30) not null);
create table my_number (id bigserial primary key, resident_id varchar(20) not null references resident(resident_id), number_ciphertext text not null, valid_from date not null, valid_to date, event varchar(30) not null);
create table restriction (restriction_id bigserial primary key, resident_id varchar(20) not null references resident(resident_id), category varchar(30) not null, start_date date not null, end_date date, scope varchar(30) not null, release_role varchar(80) not null, note text);
create table transaction_type (code varchar(30) primary key, name varchar(120) not null, category varchar(30) not null);
create table transaction (transaction_id varchar(30) primary key, resident_id varchar(20) references resident(resident_id), household_id varchar(20) references household(household_id), type_code varchar(30) not null references transaction_type(code), reason_code varchar(80), event_date date not null, processed_date date not null, receiver_office varchar(120) not null, status varchar(30) not null, parent_transaction_id varchar(30) references transaction(transaction_id));
create table transaction_item (transaction_id varchar(30) references transaction(transaction_id), field varchar(120) not null, value_before text, value_after text, primary key (transaction_id, field));
create table transaction_approval (id bigserial primary key, transaction_id varchar(30) not null references transaction(transaction_id), step int not null, role varchar(80) not null, approver_user_id varchar(80), status varchar(30) not null, comment text, acted_at timestamptz);
create table certificate_issue (issue_id bigserial primary key, resident_id varchar(20) not null references resident(resident_id), transaction_id varchar(30) references transaction(transaction_id), form_id varchar(20) not null, copies int not null default 1, usage_text varchar(240), fee int not null default 0, verify_token varchar(80) not null unique, issued_at timestamptz not null, issuer_user_id varchar(80) not null, channel varchar(30) not null);
create table user_account (user_id varchar(80) primary key, oidc_subject varchar(240) unique, employee_no varchar(80) not null, department varchar(120) not null, full_name varchar(120) not null, active boolean not null default true);
create table role (role_id varchar(80) primary key, name varchar(120) not null, description text);
create table user_role (user_id varchar(80) references user_account(user_id), role_id varchar(80) references role(role_id), valid_from date not null, valid_to date, primary key (user_id, role_id, valid_from));
create table permission (role_id varchar(80) references role(role_id), resource varchar(120) not null, action varchar(40) not null, mask varchar(80), primary key (role_id, resource, action));
create table audit_log (log_id bigserial primary key, user_id varchar(80) references user_account(user_id), ip inet, action varchar(80) not null, resource_type varchar(80) not null, resource_id varchar(120) not null, occurred_at timestamptz not null, details jsonb not null default '{}'::jsonb);
create table link_partner (partner_id varchar(80) primary key, name varchar(120) not null);
create table link_event (event_id bigserial primary key, partner_id varchar(80) not null references link_partner(partner_id), transaction_id varchar(30) references transaction(transaction_id), direction varchar(20) not null, status varchar(30) not null, payload jsonb not null, occurred_at timestamptz not null);
create table report_request (request_id bigserial primary key, template_id varchar(80) not null, requester_user_id varchar(80) not null references user_account(user_id), status varchar(30) not null, params jsonb not null, requested_at timestamptz not null, result_url text);
create index idx_resident_name_kana on resident(family_name_kana, given_name_kana);
create index idx_resident_birth on resident(birth_date);
create index idx_resident_address on resident(address_code);
create index idx_resident_history_period on resident_history(resident_id, valid_from, valid_to);
create index idx_transaction_resident_date on transaction(resident_id, event_date desc);
create index idx_audit_log_occurred_at on audit_log(occurred_at desc);

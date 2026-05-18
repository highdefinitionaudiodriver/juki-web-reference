create table report_approval (
  approval_id bigserial primary key,
  request_id bigint not null references report_request(request_id),
  step int not null,
  role varchar(80) not null,
  approver_user_id varchar(80) not null references user_account(user_id),
  action varchar(30) not null check (action in ('APPROVE', 'REJECT')),
  comment text,
  acted_at timestamptz not null
);

create unique index uq_report_approval_request_step on report_approval(request_id, step);
create index idx_report_approval_request on report_approval(request_id, acted_at desc);

create table report_event (
  event_id bigserial primary key,
  request_id bigint not null references report_request(request_id),
  event_type varchar(80) not null,
  actor_user_id varchar(80) references user_account(user_id),
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null
);

create index idx_report_event_request on report_event(request_id, occurred_at desc);

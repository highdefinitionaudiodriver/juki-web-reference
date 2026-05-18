alter table report_request
  add column required_approvals int not null default 1;

alter table report_request
  add constraint chk_report_request_required_approvals
  check (required_approvals >= 1);


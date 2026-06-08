import type { Me, ViewId } from "../types";

type Props = {
  me: Me | null;
  nav: Array<[ViewId, string]>;
  view: ViewId;
  title: string;
  subtitle: string;
  notice: { kind: "info" | "err"; message: string } | null;
  onChangeView: (view: ViewId) => void;
  onLoginOidc: () => void;
  onLogout: () => void;
  children: React.ReactNode;
};

export function Shell({ me, nav, view, title, subtitle, notice, onChangeView, onLoginOidc, onLogout, children }: Props) {
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <div className="brand-mark">住</div>
          <div>
            <strong>住民記録</strong>
            <span>Web版</span>
          </div>
        </div>
        <nav>
          {nav.map(([id, label]) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => onChangeView(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="operator">
          <span>{me?.department ?? ""}</span>
          <strong>{me?.fullName ?? ""}</strong>
          <div className="auth-actions">
            <button onClick={onLoginOidc}>OIDC</button>
            <button onClick={onLogout}>Logout</button>
          </div>
        </div>
      </aside>
      <main className="main" id="maincontent">
        <header className="topbar">
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="status-pill">ChromeOS Flex / Chromium 対応</div>
        </header>
        {notice && <div className={notice.kind === "err" ? "notice err" : "notice"}>{notice.message}</div>}
        {children}
      </main>
    </div>
  );
}

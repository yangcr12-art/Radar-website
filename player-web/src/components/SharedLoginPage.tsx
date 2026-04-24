import React from "react";

type SharedLoginPageProps = {
  username: string;
  password: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
  error: string;
};

function SharedLoginPage({
  username,
  password,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
  submitting,
  error
}: SharedLoginPageProps) {
  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-eyebrow">共享工作台登录</div>
        <h1>进入数据分析工作台</h1>
        <p className="login-copy">登录后才能访问页面。关闭浏览器后再次打开，需要重新登录。</p>
        <form className="login-form" onSubmit={onSubmit}>
          <label className="login-field">
            <span>共享账号</span>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => onUsernameChange(event.target.value)}
              disabled={submitting}
            />
          </label>
          <label className="login-field">
            <span>密码</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              disabled={submitting}
            />
          </label>
          {error ? <div className="login-error">{error}</div> : null}
          <button className="login-submit" type="submit" disabled={submitting}>
            {submitting ? "登录中..." : "登录"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default SharedLoginPage;

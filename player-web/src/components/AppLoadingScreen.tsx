import React from "react";

function AppLoadingScreen() {
  return (
    <div className="login-shell">
      <div className="login-card login-card-loading">
        <div className="login-eyebrow">共享工作台登录</div>
        <h1>正在准备工作台</h1>
        <p className="login-copy">正在校验登录状态并同步服务器数据。</p>
      </div>
    </div>
  );
}

export default AppLoadingScreen;

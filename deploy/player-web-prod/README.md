# player-web 生产部署（Ubuntu 24.04 / IP 直连）

本目录提供 `player-web` 的最小生产部署方案，目标是：

- 保持现有功能与接口不变
- 让 `3` 人可同时打开并共享同一套服务器数据
- 让后端常驻、崩溃自动重启、服务器重启后自动恢复
- 通过 `Nginx + gunicorn(1 worker) + systemd` 上线
- 通过 `Nginx Basic Auth` 为整个站点增加共享账号密码

## 1. 方案边界

- 对外入口：`http://<服务器公网 IP>/`
- 浏览器访问前会先弹出用户名/密码框
- 前端：静态构建产物，由 `Nginx` 提供
- 后端：`gunicorn` 单进程绑定 `127.0.0.1:8787`
- 反向代理：`Nginx` 将 `/api/*` 转发到 `127.0.0.1:8787`
- 数据目录：沿用 `player-web/server/data/`
- 数据语义：保持当前共享工作台行为，所有访问者共享导入数据、映射表、预设

为什么强制 `1 worker`：

- 当前后端 JSON 持久化只做了“进程内锁”
- 若开启多个 Python worker，多个进程同时写 `player-web/server/data/*.json` 有损坏风险

## 2. 上线前准备

1. 把整个仓库上传或 `git clone` 到云服务器，例如：

```bash
git clone <your-repo-url> /srv/player-web-repo
cd /srv/player-web-repo
```

2. 以可用 `sudo` 的账号执行安装脚本：

```bash
sudo bash deploy/player-web-prod/scripts/install_player_web_prod.sh
```

脚本默认：

- 运行用户：当前执行者
- 站点根目录：当前仓库目录
- 对外端口：`80`
- API 反代：`127.0.0.1:8787`
- 访问账号：默认用户名 `player`；若未显式传入密码，安装脚本会自动生成一组初始密码并打印到终端

## 3. 安装脚本会做什么

- 安装系统依赖：`python3-venv`、`python3-pip`、`nodejs`、`npm`、`nginx`、`curl`
- 安装 `apache2-utils`，用于生成 `Nginx Basic Auth` 密码文件
- 创建后端虚拟环境 `player-web/server/.venv`
- 安装后端依赖与 `gunicorn`
- 安装前端依赖并以 `VITE_STORAGE_API_BASE=/` 构建
- 生成并安装：
  - `systemd` 服务：`player-web-backend.service`
  - `nginx` 站点：`player-web`
  - 访问密码文件：`/etc/nginx/.htpasswd-player-web`
- 启用防火墙规则：
  - 允许 `OpenSSH`
  - 允许 `Nginx Full`
  - 不暴露 `8787`
- 执行健康检查：

```bash
curl -s http://127.0.0.1:8787/api/health
curl -s http://127.0.0.1/api/health
```

## 4. 日常更新

仓库代码更新后，在服务器仓库根目录执行：

```bash
sudo bash deploy/player-web-prod/scripts/update_player_web_prod.sh
```

脚本会：

- 更新 Python 依赖
- 更新前端依赖
- 重新构建前端
- 重启后端
- 重载 `nginx`
- 再做本机健康检查
- 若访问密码文件缺失，会自动生成一组初始共享账号密码

## 4.1 修改访问用户名/密码

推荐直接运行：

```bash
sudo bash deploy/player-web-prod/scripts/set_player_web_basic_auth.sh
```

也可用环境变量非交互设置：

```bash
sudo PLAYER_WEB_BASIC_AUTH_USER=player \
  PLAYER_WEB_BASIC_AUTH_PASSWORD='your-strong-password' \
  bash deploy/player-web-prod/scripts/set_player_web_basic_auth.sh
```

修改完成后执行：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 5. 备份数据

手动备份当前共享数据：

```bash
sudo bash deploy/player-web-prod/scripts/backup_player_web_data.sh
```

默认备份目录：

```text
/var/backups/player-web/
```

备份内容：

- `player-web/server/data/`

## 6. 运维命令

查看后端状态：

```bash
sudo systemctl status player-web-backend
```

查看后端日志：

```bash
sudo journalctl -u player-web-backend -n 200 --no-pager
```

重启后端：

```bash
sudo systemctl restart player-web-backend
```

检查 `nginx`：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 7. 验收

至少确认：

```bash
curl -s http://127.0.0.1:8787/api/health
curl -I http://127.0.0.1/api/health
curl -I http://<服务器公网IP>/
```

浏览器验收：

- 未输入用户名/密码前，站点返回 `401 Unauthorized`
- 输入正确用户名/密码后可进入页面
- 3 个浏览器标签页可同时打开站点
- 导航、页面和导入功能与本地一致
- 导入后刷新页面，数据仍存在
- 服务重启后数据仍存在

## 8. 后续扩展

如果后续切域名和 HTTPS：

- 保持当前目录和 `systemd` 服务不变
- 仅补充 DNS、`server_name` 和证书配置即可

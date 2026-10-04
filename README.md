# FluteBuddy — 长笛练习分析网站

上传乐谱 PDF + 演奏录音，自动识谱、分析节奏/音准/音质，展示扣分明细与谱面定位。

**仓库（公开）：** https://github.com/dymusiques/flute-practice-buddy

---

## 最快用法（约 2 分钟）

**前置：** Python 3.11+、Node.js 18+，以及仓库所有者**私下发来的 Google API Key**。

```bash
git clone https://github.com/dymusiques/flute-practice-buddy.git
cd flute-practice-buddy
cp share.env.example share.env
# 编辑 share.env，把 GOOGLE_API_KEY 换成私下收到的密钥
chmod +x scripts/start-all.sh
./scripts/start-all.sh
```

脚本会自动安装依赖、启动前后端，并打开 http://localhost:3000/practice

停止服务：`./scripts/stop-all.sh`

---

## API Key 说明

- **不会**把密钥提交到 GitHub（`share.env` 已在 `.gitignore`）
- 协作者向仓库所有者**私聊索取** Key，填入本地 `share.env` 即可
- 获取 Key：https://aistudio.google.com/apikey（若所有者允许自行申请）

---

## 关于「只发 README 能不能直接打开？」

| 方式 | 说明 |
|------|------|
| 只发 README 链接 | ❌ 不会自动在你电脑上启动程序 |
| clone + 填 Key + `./scripts/start-all.sh` | ✅ 一条命令启动（需先配置 `share.env`） |
| 部署到云的网址 | ✅ 点链接即用（需额外部署） |

---

## 手动启动（可选）

**终端 1：**

```bash
cp share.env .env
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
./scripts/start-backend.sh
```

**终端 2：**

```bash
cd frontend && npm install && npm run dev
```

---

## 项目结构

```
backend/              FastAPI（8000）
frontend/             Next.js（3000）
share.env.example     环境变量模板（提交到 git）
share.env             本地密钥（不提交，自行创建）
scripts/start-all.sh  一键启动
```

---

## 常见问题

**启动脚本报错「请填写 GOOGLE_API_KEY」** — 先 `cp share.env.example share.env` 并填入私下收到的密钥

**「后端服务未响应」** — 确认 `./scripts/start-all.sh` 成功：`curl http://127.0.0.1:8000/api/health`

**识谱失败 / 429** — Key 无效或配额用尽，联系仓库所有者

---

## 发给对方（复制粘贴）

```
仓库：https://github.com/dymusiques/flute-practice-buddy

1. 安装 Node.js（若还没有）：https://nodejs.org
2. 我会私聊发你 Google API Key
3. 终端执行：
   git clone https://github.com/dymusiques/flute-practice-buddy.git
   cd flute-practice-buddy
   cp share.env.example share.env
   # 把 share.env 里的 GOOGLE_API_KEY 换成我发你的密钥
   chmod +x scripts/start-all.sh && ./scripts/start-all.sh
4. 浏览器会自动打开练习页
```

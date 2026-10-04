# FluteBuddy — 长笛练习分析网站

面向儿童友好的长笛练习助手：上传乐谱 PDF 与演奏录音，自动识谱、分析节奏/音准/音质等维度，展示扣分明细与谱面定位，并支持 AI 追问教练。

**技术栈：** Next.js 16（前端，3000 端口）+ FastAPI（后端，8000 端口）+ Google Gemini API（识谱与 AI 对话）

---

## 仓库结构

```
project0/
├── backend/           # FastAPI 后端（分析、评分、媒体服务）
├── frontend/          # Next.js 前端
├── scripts/
│   └── start-backend.sh
├── .env.example       # 环境变量模板（复制为 .env 后填写）
└── README.md          # 本文件
```

---

## 环境要求

| 依赖 | 版本建议 | 用途 |
|------|----------|------|
| **Python** | 3.11+（推荐 3.13） | 后端与音频分析 |
| **Node.js** | 18+（推荐 20 LTS 或更高） | 前端开发服务器 |
| **macOS `afconvert`** | 系统自带 | 将 m4a 等格式转为 WAV 供分析（非 macOS 需自行安装 ffmpeg 并改代码） |
| **Google API Key** | [Google AI Studio](https://aistudio.google.com/apikey) | 谱面识别与 AI 教练 |

---

## 快速开始（克隆后本地运行）

### 1. 克隆仓库

```bash
git clone https://github.com/dymusiques/flute-practice-buddy.git
cd flute-practice-buddy
```

> 若仓库为私有，协作者需先被添加为 GitHub Collaborator，或使用 SSH：`git clone git@github.com:dymusiques/flute-practice-buddy.git`

### 2. 配置 API 密钥

```bash
cp .env.example .env
```

编辑项目根目录的 `.env`，填入你的 Google API 密钥：

```env
GOOGLE_API_KEY=你的密钥
GOOGLE_TTS_ENABLED=false

# 推荐：配额更省、识谱稳定
GOOGLE_MODEL=gemini-3.5-flash-lite
```

**重要：** `.env` 不会提交到 Git，每位使用者需自行创建并填写。

### 3. 安装并启动后端（终端 1）

在项目根目录执行：

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt

# 启动（8000 端口）
./scripts/start-backend.sh
```

验证后端是否正常：

```bash
curl http://127.0.0.1:8000/api/health
# 期望返回 JSON，含 "status":"ok" 之类字段
```

### 4. 安装并启动前端（终端 2）

```bash
cd frontend
npm install
npm run dev
```

浏览器打开：**http://localhost:3000**

前端会把 `/api/*` 和 `/media/*` 代理到 `http://localhost:8000`，因此**必须同时运行后端**，否则页面上会出现「后端服务未响应」。

### 5. 使用练习分析页

1. 打开 http://localhost:3000/practice  
2. 上传乐谱 PDF 与演奏录音（支持 m4a / wav 等）  
3. 填写演奏 BPM（与录音内节拍器一致时，节奏检测更准确）  
4. 等待分析完成，查看总分、各维度得分与扣分明细  
5. 点击谱面缩略图可放大；扣分明细旁可「听此处片段」

---

## 评分维度说明

| 维度 | 权重 | 说明 |
|------|------|------|
| 节奏 | 30 | 对照录音内节拍器咔哒与正拍对齐 |
| 音质 | 25 | 音色、气息等 |
| 音名对错 | 20 | 演奏音高与谱面音符是否一致 |
| 音准 | 15 | 音高偏差程度 |
| 姿势 | 10 | 基于视频/图像（若上传） |

修改分析逻辑后需**重新上传并分析**，不要只点「重新计分」，否则可能仍显示旧 session 的结果。

---

## 常见问题

### 「后端服务未响应」

- 确认终端 1 中 `./scripts/start-backend.sh` 仍在运行  
- 执行 `curl http://127.0.0.1:8000/api/health` 检查  
- 8000 端口被占用时：`lsof -iTCP:8000 -sTCP:LISTEN` 查看并结束旧进程

### 识谱失败 / API 429 配额用尽

- 检查 `.env` 中 `GOOGLE_API_KEY` 是否正确  
- 建议使用 `GOOGLE_MODEL=gemini-3.5-flash-lite`  
- 在 [Google AI Studio](https://aistudio.google.com/) 查看配额与账单

### 「听此处片段」无声

- 多为后端未运行或 session 为旧数据；重启后端并重新上传分析

### 节奏扣分明细仍是旧文案

- 后端需带最新代码重启；分析流程会走 `metronome_align` 模块，不再使用「相邻两音时长比例」类描述

---

## 开发说明

- **后端热重载（可选）：**  
  `.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload`
- **上传文件目录：** `uploads/`（已在 `.gitignore`，不会进仓库）
- **CORS：** 默认允许 `http://localhost:3000`，可在 `.env` 中设置 `CORS_ORIGINS`

---

## 分享给协作者 checklist

1. 将对方添加为 GitHub 仓库 **Collaborator**（私有仓库）或设为 **Public**  
2. 发送仓库链接：`https://github.com/dymusiques/flute-practice-buddy`  
3. 告知对方需自备 **Google API Key**（不要分享你的 `.env`）  
4. 对方按本文「快速开始」两终端启动即可访问本地网站  

---

## 许可证

私有项目；使用前请与仓库所有者确认授权范围。

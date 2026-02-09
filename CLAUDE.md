# CLAUDE.md

## Project Overview

CodePilot — Claude Code 的原生桌面 GUI 客户端，基于 Electron + Next.js。

## Release Checklist

**发版前必须更新版本号：**

1. `package.json` 中的 `"version"` 字段
2. `package-lock.json` 中的对应版本（运行 `npm install` 会自动同步）
3. 构建命令：`npm run electron:pack:mac`（macOS）/ `npm run electron:pack:win`（Windows）
4. 上传产物到 GitHub Release 并编写 release notes（格式见下方 Release Notes 规范）

## Development Rules

**提交前必须详尽测试：**
- 每次提交代码前，必须在开发环境中充分测试所有改动的功能，确认无回归
- 涉及前端 UI 的改动需要实际启动应用验证（`npm run dev` 或 `npm run electron:dev`）
- 涉及构建/打包的改动需要完整执行一次打包流程验证产物可用
- 涉及多平台的改动需要考虑各平台的差异性

**新增功能前必须详尽调研：**
- 新增功能前必须充分调研相关技术方案、API 兼容性、社区最佳实践
- 涉及 Electron API 需确认目标版本支持情况
- 涉及第三方库需确认与现有依赖的兼容性
- 涉及 Claude Code SDK 需确认 SDK 实际支持的功能和调用方式
- 对不确定的技术点先做 POC 验证，不要直接在主代码中试错

## Release Notes 规范

每次发布 GitHub Release 时，必须包含以下内容：

**标题格式**: `CodePilot v{版本号}`

**正文结构**:

```markdown
## New Features / Bug Fixes（按实际内容选择标题）

- **功能/修复标题** — 简要描述改动内容和原因

## Downloads

- **CodePilot-{版本}-arm64.dmg** — macOS Apple Silicon (M1/M2/M3/M4)
- **CodePilot-{版本}-x64.dmg** — macOS Intel

## Installation

1. 下载对应芯片架构的 DMG 文件
2. 打开 DMG，将 CodePilot 拖入 Applications 文件夹
3. 首次打开时如遇安全提示，前往 **系统设置 → 隐私与安全性** 点击"仍要打开"
4. 在 Settings 页面配置 Anthropic API Key 或环境变量

## Requirements

- macOS 12.0+
- Anthropic API Key 或已配置 `ANTHROPIC_API_KEY` 环境变量
- 如需使用代码相关功能，建议安装 Claude Code CLI

## Changelog (since v{上一版本})

| Commit | Description |
|--------|-------------|
| `{hash}` | {commit message} |
```

**注意事项**:
- 大版本（功能更新）用 `## New Features` + `## Bug Fixes` 分区
- 小版本（纯修复）用 `## Bug Fix` 即可
- Downloads、Installation、Requirements 每次都要写，方便新用户
- Changelog 表格列出自上一版本以来的所有 commit

## Build Notes

### better-sqlite3 预构建

- 项目使用系统 Node.js（而非 Electron 的 Node.js）来避免 macOS Dock 图标重复问题
- 构建前会自动运行 `npm run build:sqlite3` 生成预构建二进制到 `/tmp/better-sqlite3-node22/`
- 如果预构建二进制不存在，构建会失败并提示运行 `npm run build:sqlite3`
- 预构建二进制只需构建一次，除非 better-sqlite3 版本更新或 Node.js 版本变化

### 构建流程

- macOS 构建产出 DMG（arm64 + x64），Windows 产出 NSIS 安装包或 zip
- `scripts/after-pack.js` 会在打包时将预构建的 better-sqlite3 二进制复制到应用包中
- 构建前清理 `rm -rf release/ .next/` 可避免旧产物污染
- 构建 Windows 包后需要 `npm rebuild better-sqlite3` 恢复本地开发环境
- macOS 交叉编译 Windows 需要 Wine（Apple Silicon 上可能不可用），可用 zip 替代 NSIS

### 手动构建 better-sqlite3

如果需要重新构建预构建二进制：

```bash
# 删除旧的预构建二进制
rm -rf /tmp/better-sqlite3-node22

# 重新构建
npm run build:sqlite3
```

**注意**: 构建需要系统安装了编译工具（macOS: Xcode Command Line Tools, Linux: build-essential）

## Port Management

### 开发环境端口管理

CodePilot 开发环境使用 3000 端口（Next.js 默认端口）。为避免端口冲突，项目提供了安全的端口清理机制。

**自动清理**：
- 运行 `npm run electron:dev` 时会自动执行 `preelectron:dev` 钩子
- 该钩子会调用 `scripts/free-port.sh` 清理 3000 端口上的监听进程
- 只清理 **LISTEN** 状态的进程，不影响 **ESTABLISHED** 状态的客户端连接

**手动清理**：
```bash
# 清理 3000 端口
bash scripts/free-port.sh 3000

# 清理其他端口
bash scripts/free-port.sh 8080
```

### 重要说明：LISTEN vs ESTABLISHED

**LISTEN 状态**：
- 进程在本地监听端口，等待连接（如 Next.js 开发服务器）
- 会与 CodePilot 冲突，需要清理

**ESTABLISHED 状态**：
- 进程作为客户端连接到远程服务器（如 Claude Code CLI 连接到远程服务器）
- 不会与 CodePilot 冲突，**不应清理**

**示例**：
```bash
# Claude Code CLI 连接到远程服务器（不冲突）
node     12345  user  TCP 127.0.0.1:xxxxx->175.178.49.176:3000 (ESTABLISHED)

# Next.js 监听本地 3000 端口（会冲突）
node     67890  user  TCP 127.0.0.1:3000 (LISTEN)
```

**警告**：
- 不要手动 kill Claude Code CLI 进程
- 不要使用 `lsof -i :3000` 查找进程（会包含 ESTABLISHED 连接）
- 始终使用 `scripts/free-port.sh` 进行安全清理

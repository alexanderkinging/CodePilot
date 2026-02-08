# CLAUDE.md

## Project Overview

CodePilot — Claude Code 的原生桌面 GUI 客户端，基于 Electron + Next.js。

## Release Checklist

**发版前必须更新版本号：**

1. `package.json` 中的 `"version"` 字段
2. `package-lock.json` 中的对应版本（运行 `npm install` 会自动同步）
3. 构建命令：`npm run electron:pack:mac`（macOS）/ `npm run electron:pack:win`（Windows）
4. 上传产物到 GitHub Release 并编写 release notes

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

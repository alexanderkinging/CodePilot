# CodePilot 构建脚本说明

本目录包含 CodePilot 项目的构建和安装脚本。

---

## 📁 脚本列表

### 1. `build-sqlite3.js`

**用途**: 自动构建 better-sqlite3 预构建二进制

**功能**:
- 检测已存在的预构建二进制（避免重复构建）
- Node.js 版本检查和警告
- 从源码构建 better-sqlite3
- 二进制完整性验证（大小检查）
- 详细的错误处理和故障排除提示

**使用方法**:
```bash
npm run build:sqlite3
```

**输出位置**: `/tmp/better-sqlite3-node22/`

**重新构建**:
```bash
rm -rf /tmp/better-sqlite3-node22
npm run build:sqlite3
```

---

### 2. `after-pack.js`

**用途**: electron-builder 的 afterPack 钩子

**功能**:
- 验证预构建二进制存在性
- 验证二进制大小（防止损坏）
- 将系统 Node.js 编译的 better-sqlite3 复制到应用包
- 构建失败时停止打包流程

**触发时机**: 在 `electron-builder` 打包过程中自动运行

**注意事项**:
- 如果预构建二进制不存在，构建会失败并���示错误消息
- 必须先运行 `npm run build:sqlite3` 创建预构建二进制

---

### 3. `install-local.sh` ✨ 新增

**用途**: 本地安装脚本，简化开发测试流程

**功能**:
- 将构建好的应用复制到 `/Applications`
- 自动移除 quarantine 属性（避免 Gatekeeper 阻止）
- 显示应用版本信息
- 检测并替换已安装的版本
- 可选：安装后自动打开应用

**使用方法**:

```bash
# 方式 1: 使用 npm 脚本（推荐）
npm run install:local

# 方式 2: 直接运行脚本
./scripts/install-local.sh

# 方式 3: 构建并安装（一步到位）
npm run electron:pack:mac && npm run install:local
```

**前提条件**:
- 必须先构建应用：`npm run electron:pack:mac`
- 需要 sudo 权限（用于移除 quarantine 属性）

**交互式提示**:
1. 如果应用已安装，会询问是否替换
2. 安装完成后，会询问是否立即打开应用

---

### 4. `build-electron.mjs`

**用途**: 编译 Electron 主进程和预加载脚本

**功能**:
- 使用 esbuild 编译 TypeScript
- 生成 `dist-electron/main.js` 和 `dist-electron/preload.js`

**触发时机**: 在 `npm run electron:build` 中自动运行

---

## 🚀 完整构建流程

### 开发环境

```bash
# 1. 启动开发服务器
npm run electron:dev
```

### 生产构建（macOS）

```bash
# 1. 清理旧构建产物（可选）
rm -rf release/ .next/ dist-electron/

# 2. 构建应用（包含自动构建 better-sqlite3）
npm run electron:pack:mac

# 3. 安装到本地 /Applications
npm run install:local

# 4. 测试应用
open /Applications/CodePilot.app
```

### 一键构建并安装

```bash
npm run electron:pack:mac && npm run install:local
```

---

## 🛠️ 故障排除

### 问题 1: better-sqlite3 构建失败

**错误消息**:
```
[build-sqlite3] ❌ FATAL: Failed to build better-sqlite3
```

**解决方案**:
```bash
# macOS: 安装 Xcode Command Line Tools
xcode-select --install

# 确保 Python 已安装（node-gyp 需要）
python --version

# 清理并重新构建
rm -rf /tmp/better-sqlite3-node22
npm run build:sqlite3
```

---

### 问题 2: 应用无法打开（Gatekeeper 阻止）

**错误消息**:
```
"CodePilot.app" cannot be opened because the developer cannot be verified.
```

**解决方案**:

**方式 1: 使用安装脚本（推荐）**
```bash
npm run install:local
# 脚本会自动移除 quarantine 属性
```

**方式 2: 手动移除 quarantine 属性**
```bash
sudo xattr -rd com.apple.quarantine /Applications/CodePilot.app
```

**方式 3: 右键打开**
```
右键点击应用 → "打开" → 确认打开
```

---

### 问题 3: 预构建二进制不存在

**错误消息**:
```
[afterPack] ❌ FATAL: Pre-built better-sqlite3 binary not found
```

**解决方案**:
```bash
npm run build:sqlite3
```

---

### 问题 4: Node.js 版本不匹配

**警告消息**:
```
[build-sqlite3] ⚠️  WARNING: Node.js version is not v22.
```

**说明**:
- 预构建二进制是为 Node.js v22 编译的（MODULE_VERSION 127）
- 如果系统 Node.js 不是 v22，可能导致 ABI 不匹配
- 建议使用 nvm 切换到 Node.js v22

**解决方案**:
```bash
# 使用 nvm 安装 Node.js v22
nvm install 22
nvm use 22

# 重新构建预构建二进制
rm -rf /tmp/better-sqlite3-node22
npm run build:sqlite3
```

---

## 📚 相关文档

- **项目配置**: `CLAUDE.md` - 发版检查清单和构建说明
- **实施文档**: `BUILD_SQLITE3_IMPLEMENTATION.md` - better-sqlite3 自动构建实施完成报告
- **测试报告**: `BUILD_SQLITE3_TEST_REPORT.md` - 构建脚本测试报告
- **改进建议**: `IMPROVEMENT_SUGGESTIONS.md` - 项目改进建议
- **验证报告**: `VERIFICATION_REPORT.md` - 代码验证报告

---

## 🔗 快速参考

| 命令 | 用途 |
|------|------|
| `npm run electron:dev` | 启动开发服务器 |
| `npm run electron:pack:mac` | 构建 macOS 应用 |
| `npm run build:sqlite3` | 构建 better-sqlite3 预构建二进制 |
| `npm run install:local` | 安装应用到 /Applications |
| `rm -rf release/ .next/` | 清理构建产物 |
| `npm rebuild better-sqlite3` | 恢复本地开发环境 |

---

**最后更新**: 2026-02-08

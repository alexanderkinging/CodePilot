# CodePilot 改进建议

**日期**: 2026-02-08
**基于**: 代码验证报告

---

## 1. 增强 better-sqlite3 构建验证 ⚠️ 高优先级

### 问题描述

当前 `scripts/after-pack.js` 依赖 `/tmp/better-sqlite3-node22/` 目录中的预构建二进制文件。如果该文件不存在，构建会发出警告但继续，可能导致打包后的应用无法启动。

**当前代码** (lines 26-29):
```javascript
if (!fs.existsSync(rebuiltSource)) {
  console.warn('[afterPack] Rebuilt better_sqlite3.node not found at', rebuiltSource);
  return; // 静默返回，构建继续
}
```

### 建议的改进

#### 方案 1: 添加严格验证（推荐）

```javascript
if (!fs.existsSync(rebuiltSource)) {
  console.error('[afterPack] FATAL: Pre-built better-sqlite3 binary not found at', rebuiltSource);
  console.error('[afterPack] The application will fail to start without this binary.');
  console.error('[afterPack] Please ensure the binary exists before building.');
  console.error('[afterPack] Expected location:', rebuiltSource);
  process.exit(1); // 停止构建
}
```

**优点**:
- 防止构建出无法启动的应用
- 明确的错误消息帮助开发者快速定位问题
- 避免浪费时间调试运行时错误

**缺点**:
- 需要确保预构建二进制在构建前存在

---

#### 方案 2: 添加自动构建脚本

创建 `scripts/build-sqlite3.js`:

```javascript
/**
 * Build better-sqlite3 for system Node.js v22
 * This script should be run before electron:pack:mac
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const targetDir = '/tmp/better-sqlite3-node22';
const targetBinary = path.join(targetDir, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');

// Check if binary already exists
if (fs.existsSync(targetBinary)) {
  console.log('[build-sqlite3] Binary already exists at', targetBinary);
  console.log('[build-sqlite3] Skipping build. Delete the directory to rebuild.');
  process.exit(0);
}

console.log('[build-sqlite3] Building better-sqlite3 for system Node.js v22...');

// Create temp directory
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Initialize package.json
const packageJson = {
  name: 'better-sqlite3-node22',
  version: '1.0.0',
  dependencies: {
    'better-sqlite3': '^12.6.2'
  }
};

fs.writeFileSync(
  path.join(targetDir, 'package.json'),
  JSON.stringify(packageJson, null, 2)
);

// Install and build
try {
  execSync('npm install', {
    cwd: targetDir,
    stdio: 'inherit',
    env: { ...process.env, npm_config_build_from_source: 'true' }
  });

  // Verify binary was created
  if (!fs.existsSync(targetBinary)) {
    console.error('[build-sqlite3] FATAL: Binary was not created at', targetBinary);
    process.exit(1);
  }

  console.log('[build-sqlite3] Successfully built better-sqlite3 binary');
  console.log('[build-sqlite3] Location:', targetBinary);

  // Check Node.js version
  const nodeVersion = process.version;
  console.log('[build-sqlite3] Built with Node.js', nodeVersion);

} catch (err) {
  console.error('[build-sqlite3] FATAL: Failed to build better-sqlite3:', err.message);
  process.exit(1);
}
```

在 `package.json` 中添加脚本:

```json
{
  "scripts": {
    "build:sqlite3": "node scripts/build-sqlite3.js",
    "prebuild:mac": "npm run build:sqlite3",
    "electron:pack:mac": "npm run prebuild:mac && next build && electron-builder --mac --config electron-builder.yml"
  }
}
```

**优点**:
- 自动化构建流程
- 确保预构建二进制始终存在
- 可以在 CI/CD 中使用

**缺点**:
- 增加构建时间（首次构建）
- 需要系统 Node.js v22

---

#### 方案 3: 回退到 electron-rebuild（不推荐）

恢复 commit b42d3d2 的方案，使用 `electron-rebuild`:

```javascript
const { execSync } = require('child_process');

module.exports = async function afterPack(context) {
  const appOutDir = context.appOutDir;
  const resourcesDir = path.join(appOutDir, 'CodePilot.app', 'Contents', 'Resources');

  console.log('[afterPack] Rebuilding better-sqlite3 for Electron...');

  try {
    execSync('npx electron-rebuild -f -w better-sqlite3', {
      cwd: resourcesDir,
      stdio: 'inherit'
    });
    console.log('[afterPack] Successfully rebuilt better-sqlite3');
  } catch (err) {
    console.error('[afterPack] FATAL: Failed to rebuild better-sqlite3:', err.message);
    process.exit(1);
  }
};
```

**优点**:
- 不依赖外部预构建二进制
- 自动匹配 Electron ABI

**缺点**:
- 会导致 macOS Dock 图标重复问题（这是为什么改用系统 Node.js 的原因）
- 不适用于当前架构

---

### 推荐方案

**方案 1 + 方案 2 组合**:

1. 添加 `scripts/build-sqlite3.js` 自动构建脚本
2. 在 `scripts/after-pack.js` 中添加严格验证
3. 在 `package.json` 中添加 `prebuild:mac` 钩子

这样可以确保：
- 构建前自动生成预构建二进制
- 如果预构建二进制不存在，构建会失败并显示明确的错误消息
- 开发者可以手动运行 `npm run build:sqlite3` 来重新构建

---

## 2. 添加构建前检查脚本 📋 中优先级

### 问题描述

当前没有构建前检查，可能导致构建失败或产生不完整的产物。

### 建议的改进

创建 `scripts/pre-build-check.js`:

```javascript
/**
 * Pre-build checks for CodePilot
 * Verifies all prerequisites before building
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const checks = [];

// Check 1: Verify package.json version
function checkVersion() {
  const pkg = require('../package.json');
  const version = pkg.version;

  if (!version || version === '0.0.0') {
    return {
      name: 'Version Check',
      passed: false,
      message: `Invalid version in package.json: ${version}`
    };
  }

  return {
    name: 'Version Check',
    passed: true,
    message: `Version: ${version}`
  };
}

// Check 2: Verify better-sqlite3 pre-built binary
function checkSqliteBinary() {
  const binaryPath = '/tmp/better-sqlite3-node22/node_modules/better-sqlite3/build/Release/better_sqlite3.node';

  if (!fs.existsSync(binaryPath)) {
    return {
      name: 'SQLite Binary Check',
      passed: false,
      message: `Pre-built binary not found at ${binaryPath}. Run: npm run build:sqlite3`
    };
  }

  const stats = fs.statSync(binaryPath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

  return {
    name: 'SQLite Binary Check',
    passed: true,
    message: `Binary found (${sizeMB} MB)`
  };
}

// Check 3: Verify Node.js version
function checkNodeVersion() {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0]);

  if (major < 18) {
    return {
      name: 'Node.js Version Check',
      passed: false,
      message: `Node.js ${version} is too old. Requires v18 or higher.`
    };
  }

  return {
    name: 'Node.js Version Check',
    passed: true,
    message: `Node.js ${version}`
  };
}

// Check 4: Verify git status (no uncommitted changes)
function checkGitStatus() {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' });

    if (status.trim()) {
      return {
        name: 'Git Status Check',
        passed: false,
        message: 'Uncommitted changes detected. Commit or stash before building.',
        warning: true // Non-fatal warning
      };
    }

    return {
      name: 'Git Status Check',
      passed: true,
      message: 'Working directory clean'
    };
  } catch (err) {
    return {
      name: 'Git Status Check',
      passed: true,
      message: 'Not a git repository (skipped)'
    };
  }
}

// Check 5: Verify CLAUDE.md exists
function checkClaudeMd() {
  const claudeMdPath = path.join(__dirname, '..', 'CLAUDE.md');

  if (!fs.existsSync(claudeMdPath)) {
    return {
      name: 'CLAUDE.md Check',
      passed: false,
      message: 'CLAUDE.md not found. This file contains important build instructions.',
      warning: true
    };
  }

  return {
    name: 'CLAUDE.md Check',
    passed: true,
    message: 'CLAUDE.md found'
  };
}

// Run all checks
async function runChecks() {
  console.log('🔍 Running pre-build checks...\n');

  const results = [
    checkVersion(),
    checkSqliteBinary(),
    checkNodeVersion(),
    checkGitStatus(),
    checkClaudeMd()
  ];

  let hasErrors = false;
  let hasWarnings = false;

  for (const result of results) {
    const icon = result.passed ? '✅' : (result.warning ? '⚠️' : '❌');
    console.log(`${icon} ${result.name}: ${result.message}`);

    if (!result.passed && !result.warning) {
      hasErrors = true;
    }
    if (!result.passed && result.warning) {
      hasWarnings = true;
    }
  }

  console.log('');

  if (hasErrors) {
    console.error('❌ Pre-build checks failed. Please fix the errors above before building.');
    process.exit(1);
  }

  if (hasWarnings) {
    console.warn('⚠️  Pre-build checks passed with warnings. Consider fixing them before building.');
  } else {
    console.log('✅ All pre-build checks passed!');
  }
}

runChecks().catch(err => {
  console.error('Fatal error during pre-build checks:', err);
  process.exit(1);
});
```

在 `package.json` 中添加:

```json
{
  "scripts": {
    "precheck": "node scripts/pre-build-check.js",
    "electron:pack:mac": "npm run precheck && npm run build:sqlite3 && next build && electron-builder --mac --config electron-builder.yml"
  }
}
```

---

## 3. 改进错误处理和日志 📝 低优先级

### 问题描述

当前代码中有一些静默错误处理，可能导致问题难以调试。

### 建议的改进

#### 3.1 在 `src/app/settings/page.tsx` 中改进错误处理

**当前代码** (lines 304-305):
```typescript
} catch {
  // Handle error silently
}
```

**改进后**:
```typescript
} catch (err) {
  console.error('[Settings] Failed to save settings:', err);
  setStatus({
    type: 'error',
    message: err instanceof Error ? err.message : 'Failed to save settings'
  });
}
```

---

#### 3.2 在 `src/lib/db.ts` 中添加更详细的日志

**当前代码** (lines 40-44):
```typescript
console.log(`[db] Migrated database from ${oldPath}`);
break;
} catch (err) {
  console.warn(`[db] Failed to migrate from ${oldPath}:`, err);
}
```

**改进后**:
```typescript
console.log(`[db] Successfully migrated database from ${oldPath}`);
console.log(`[db] New location: ${DB_PATH}`);
console.log(`[db] Database size: ${(fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(2)} MB`);
break;
} catch (err) {
  console.error(`[db] Failed to migrate from ${oldPath}:`, err);
  console.error(`[db] Error details:`, err instanceof Error ? err.message : String(err));
}
```

---

## 4. 添加自动化测试 🧪 低优先级

### 问题描述

当前项目没有自动化测试，依赖手动测试来验证功能。

### 建议的改进

#### 4.1 添加单元测试

创建 `tests/unit/db.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, createSession, getSession, getAllSessions } from '@/lib/db';
import fs from 'fs';
import path from 'path';

describe('Database Operations', () => {
  const testDbPath = path.join(__dirname, 'test.db');

  beforeEach(() => {
    process.env.CLAUDE_GUI_DATA_DIR = __dirname;
  });

  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should create a new session', () => {
    const session = createSession('Test Session', 'claude-sonnet-4-5', '', '/test/path');
    expect(session).toBeDefined();
    expect(session.title).toBe('Test Session');
    expect(session.model).toBe('claude-sonnet-4-5');
  });

  it('should retrieve a session by ID', () => {
    const session = createSession('Test Session');
    const retrieved = getSession(session.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(session.id);
  });

  it('should list all sessions', () => {
    createSession('Session 1');
    createSession('Session 2');
    const sessions = getAllSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(2);
  });
});
```

在 `package.json` 中添加:

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run",
    "test:watch": "vitest watch"
  },
  "devDependencies": {
    "vitest": "^1.0.0",
    "@vitest/ui": "^1.0.0"
  }
}
```

---

#### 4.2 添加集成测试

创建 `tests/integration/import.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { POST } from '@/app/api/chat/import/route';

describe('Claude CLI History Import', () => {
  it('should import history from ~/.claude/history.jsonl', async () => {
    const request = new Request('http://localhost:3000/api/chat/import', {
      method: 'POST'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty('imported');
    expect(data).toHaveProperty('messagesImported');
  });
});
```

---

## 5. 改进文档 📚 低优先级

### 建议的改进

#### 5.1 添加开发者指南

创建 `DEVELOPMENT.md`:

```markdown
# CodePilot 开发指南

## 环境要求

- Node.js v18 或更高（推荐 v22）
- npm v9 或更高
- macOS 12+ (for macOS builds)
- Windows 10+ (for Windows builds)

## 开发环境设置

1. 克隆仓库:
   ```bash
   git clone https://github.com/yourusername/CodePilot.git
   cd CodePilot
   ```

2. 安装依赖:
   ```bash
   npm install
   ```

3. 构建 better-sqlite3 预构建二进制:
   ```bash
   npm run build:sqlite3
   ```

4. 启动开发环境:
   ```bash
   npm run electron:dev
   ```

## 构建流程

### macOS

1. 运行构建前检查:
   ```bash
   npm run precheck
   ```

2. 构建 DMG:
   ```bash
   npm run electron:pack:mac
   ```

3. 产物位置: `release/CodePilot-0.2.3-arm64.dmg` 或 `release/CodePilot-0.2.3-x64.dmg`

### Windows

1. 运行构建前检查:
   ```bash
   npm run precheck
   ```

2. 构建安装包:
   ```bash
   npm run electron:pack:win
   ```

3. 产物位置: `release/CodePilot Setup 0.2.3.exe`

## 常见问题

### Q: 构建失败，提示 "Pre-built better-sqlite3 binary not found"

A: 运行 `npm run build:sqlite3` 来构建预构建二进制。

### Q: macOS 上出现重复的 Dock 图标

A: 确保使用系统 Node.js 而非 Electron 的 Node.js。检查 `electron/main.ts` 中的 `nodePath` 逻辑。

### Q: Windows 上找不到 Claude CLI

A: 确保 Claude CLI 安装在标准位置（`%APPDATA%\npm\claude.cmd` 或 `%LOCALAPPDATA%\npm\claude.cmd`）。

## 调试技巧

### 查看 Electron 主进程日志

```bash
npm run electron:dev
# 查看终端输出
```

### 查看渲染进程日志

1. 启动应用
2. 打开开发者工具: `Cmd+Option+I` (macOS) 或 `Ctrl+Shift+I` (Windows)
3. 查看 Console 标签

### 查看数据库内容

```bash
sqlite3 ~/.codepilot/codepilot.db
.tables
SELECT * FROM chat_sessions;
```

## 贡献指南

1. Fork 仓库
2. 创建功能分支: `git checkout -b feature/my-feature`
3. 提交更改: `git commit -m 'Add my feature'`
4. 推送到分支: `git push origin feature/my-feature`
5. 创建 Pull Request

## 发版流程

参考 `CLAUDE.md` 中的 Release Checklist。
```

---

#### 5.2 添加故障排除指南

创建 `TROUBLESHOOTING.md`:

```markdown
# CodePilot 故障排除指南

## 构建问题

### 问题: "Pre-built better-sqlite3 binary not found"

**症状**: 构建失败，显示错误消息 "Pre-built better-sqlite3 binary not found at /tmp/better-sqlite3-node22/..."

**原因**: 预构建的 better-sqlite3 二进制文件不存在。

**解决方案**:
```bash
npm run build:sqlite3
```

---

### 问题: "Module version mismatch"

**症状**: 应用启动失败，显示错误 "Module version mismatch. Expected 127, got XXX."

**原因**: better-sqlite3 二进制文件的 MODULE_VERSION 与系统 Node.js 不匹配。

**解决方案**:
1. 确保系统 Node.js 版本为 v22
2. 重新构建预构建二进制:
   ```bash
   rm -rf /tmp/better-sqlite3-node22
   npm run build:sqlite3
   ```

---

## 运行时问题

### 问题: macOS 上出现重复的 Dock 图标

**症状**: 启动应用后，Dock 中出现两个 CodePilot 图标。

**原因**: 使用了 Electron 的 Node.js 而非系统 Node.js。

**解决方案**:
1. 检查 `electron/main.ts` 中的 `nodePath` 逻辑
2. 确保系统 Node.js 存在于 `/usr/local/bin/node` 或 `/opt/homebrew/bin/node`
3. 重新构建应用

---

### 问题: Claude CLI 历史导入失败

**症状**: 点击"导入历史"按钮后，显示错误消息。

**原因**: `~/.claude/history.jsonl` 文件不存在或格式错误。

**解决方案**:
1. 确保 Claude CLI 已安装并登录
2. 检查 `~/.claude/history.jsonl` 文件是否存在:
   ```bash
   ls -la ~/.claude/history.jsonl
   ```
3. 如果文件存在但导入失败，检查文件格式是否为有效的 JSONL

---

### 问题: Skills 列表无法滚动

**症状**: Skills 列表中有很多项目，但无法滚动查看。

**原因**: ScrollArea 组件的 flex 布局问题。

**解决方案**:
1. 确保 `SkillsManager.tsx` 中的 ScrollArea 使用了 `min-h-0` 类
2. 检查代码:
   ```tsx
   <ScrollArea className="flex-1 min-h-0">
   ```

---

## 数据库问题

### 问题: 数据库迁移失败

**症状**: 启动应用后，旧数据丢失。

**原因**: 数据库迁移逻辑失败。

**解决方案**:
1. 检查旧数据库位置:
   ```bash
   ls -la ~/Library/Application\ Support/CodePilot/codepilot.db
   ```
2. 手动复制到新位置:
   ```bash
   cp ~/Library/Application\ Support/CodePilot/codepilot.db ~/.codepilot/codepilot.db
   ```
3. 重新启动应用

---

### 问题: "database is locked"

**症状**: 应用启动失败，显示 "database is locked" 错误。

**原因**: 另一个进程正在使用数据库。

**解决方案**:
1. 关闭所有 CodePilot 实例
2. 删除 WAL 和 SHM 文件:
   ```bash
   rm ~/.codepilot/codepilot.db-wal
   rm ~/.codepilot/codepilot.db-shm
   ```
3. 重新启动应用

---

## 获取帮助

如果以上解决方案都无法解决问题，请:

1. 查看应用日志（开发者工具 Console）
2. 在 GitHub 上创建 Issue: https://github.com/yourusername/CodePilot/issues
3. 提供以下信息:
   - 操作系统和版本
   - Node.js 版本
   - CodePilot 版本
   - 错误消息和堆栈跟踪
   - 重现步骤
```

---

## 总结

### 立即实施（高优先级）

1. ✅ **增强 better-sqlite3 构建验证**
   - 添加 `scripts/build-sqlite3.js` 自动构建脚本
   - 在 `scripts/after-pack.js` 中添加严格验证
   - 在 `package.json` 中添加 `prebuild:mac` 钩子

### 短期实施（中优先级）

2. ✅ **添加构建前检查脚本**
   - 创建 `scripts/pre-build-check.js`
   - 验证版本号、预构建二进制、Node.js 版本等

### 长期实施（低优先级）

3. ✅ **改进错误处理和日志**
   - 在关键位置添加详细的错误日志
   - 避免静默错误处理

4. ✅ **添加自动化测试**
   - 单元测试（数据库操作、工具函数）
   - 集成测试（API 路由、历史导入）

5. ✅ **改进文档**
   - 创建 `DEVELOPMENT.md` 开发者指南
   - 创建 `TROUBLESHOOTING.md` 故障排除指南

---

**文档生成时间**: 2026-02-08
**作者**: Claude Sonnet 4.5

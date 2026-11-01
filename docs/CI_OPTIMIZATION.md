# Windows x64 GitHub Actions 构建加速记录

日期：2026-11-01
范围：仅 GitHub Actions / CI 配置与 CI 专用 Tauri 配置，不修改 Vue、LCU、Pinia、Rust IPC 或 UI。

## 1. 优化前测量

最近 4 次 Windows run：

| Run         | 结果                   | 缓存条件                                  |    总耗时 |   Rust check | Rust tests | Tauri NSIS | Post cache |
| ----------- | ---------------------- | ----------------------------------------- | --------: | -----------: | ---------: | ---------: | ---------: |
| 41293745420 | 失败（旧 sysinfo API） | 冷/无有效缓存                             |      4m40 | 3m36（失败） |          — |          — |          — |
| 41294166671 | 成功                   | 冷/无有效缓存                             | **23m14** |         6m09 |       3m13 |      10m11 |       1m46 |
| 41311615922 | 失败（trait import）   | 冷/无有效缓存                             |      3m31 | 0m59（失败） |          — |          — |          — |
| 41312013808 | 成功                   | 部分缓存（restore-key，full match false） | **11m42** |         1m04 |       1m28 |       4m11 |       2m44 |

`41312013808` 的 `Frontend, TypeScript, ESLint, Prettier` 步骤耗时 39s；其中 `pnpm check` 已执行一次 `vite build`。随后 Tauri `beforeBuildCommand: pnpm build` 又执行一次 Vite 构建（日志两次 `✓ built`）。这是明确的重复前端构建。

Rust cache 日志：

```text
Cache hit for restore-key: ... full match: false
Cache restored successfully
Cache Size: ~1080 MB
```

## 2. 优化措施

### 拆分工作流

- [windows-validation.yml](../.github/workflows/windows-validation.yml)
  - push `main` + 手动
  - 仅验证：`pnpm check`（含一次前端 build）、90 前端测试、audit、cargo fmt/check/47 tests
  - `save-if: "false"`：只恢复 Rust 缓存，不保存约 1GB cache
- [windows-release.yml](../.github/workflows/windows-release.yml)
  - 仅手动
  - 验证 + NSIS 打包 + Artifact
  - 不再执行 `pnpm check` 中重复的 build，改为：
    - `pnpm check:baseline`
    - `pnpm typecheck`
    - `pnpm lint`
    - `pnpm test`
    - audit
    - cargo fmt/check/test
    - `pnpm tauri build --config src-tauri/tauri.ci.conf.json`
  - [tauri.ci.conf.json](../src-tauri/tauri.ci.conf.json) 将 `beforeBuildCommand` 改为 `pnpm exec vite build`，因此 Release 只执行一次 Vite 构建，不重复 typecheck。
- 删除旧的 `.github/workflows/windows-build.yml`。

### 缓存

- pnpm：`actions/setup-node@v4` 的 `cache: pnpm`，日志显示 pnpm cache hit。
- Rust：`Swatinem/rust-cache@v2`
  - `workspaces: src-tauri -> target`
  - `shared-key: windows-x64`（validation/release 共享）
  - `key: gameflow-10-2`
  - Rust target `x86_64-pc-windows-msvc`；Cargo.lock 自动进入 rust-cache environment hash。
  - Validation 只 restore，不 save；Release 保存 cache。
- `CARGO_BUILD_JOBS`：**未设置**，使用 Runner 默认并行度；未人为限制。
- Release profile：`src-tauri/Cargo.toml` 没有 `[profile.release]`/LTO 配置；本任务不修改。hot release 的 `Finished release` 为 1m03，没有证据支持调整 LTO。

## 3. 优化后实际结果

### Validation（push main，冷缓存）

- Run：https://github.com/UoMiss/aram-mayhem/actions/runs/41313881342
- 结果：success
- 总耗时：**9m28**
- 无 NSIS、无 Rust cache save；缓存日志 `No cache found.`
- `pnpm check` 90 tests；cargo check 5m04；cargo test 2m52；47 passed。

### Release 第一次（冷缓存）

- Run：https://github.com/UoMiss/aram-mayhem/actions/runs/41314794674
- 结果：success
- 总耗时：**14m55**
- Rust cache 无完整命中；check 4m09；tests 2m12；NSIS 6m24；post cache save 1m08。
- Artifact 成功。

### Release 第二次（热缓存）

- Run：https://github.com/UoMiss/aram-mayhem/actions/runs/41316305870
- 结果：success
- 总耗时：**4m19**
- 步骤：

| 步骤                      |   耗时 |
| ------------------------- | -----: |
| Restore shared Rust cache |    53s |
| Install dependencies      |     8s |
| TypeScript + ESLint       |    14s |
| Frontend tests            |     6s |
| Audit                     |     1s |
| Rust formatting           |     3s |
| Rust Windows check        |    39s |
| Rust Windows tests        |    24s |
| Build Tauri NSIS          |   1m18 |
| Artifact prepare/upload   |     2s |
| Post cache                | **0s** |

缓存日志：

```text
Cache hit for: v0-rust-windows-x64-Windows_NT-x64-e70cdc14-a35f532d
Cache restored successfully
Restored from cache key "...-a35f532d" full match: true.
```

`pnpm` 缓存也命中：

```text
Cache restored from key: node-cache-Windows-x64-pnpm-...
```

## 4. 优化前后对比

| 指标               | 优化前 41312013808（partial cache） | 优化后 hot 41316305870 |              变化 |
| ------------------ | ----------------------------------: | ---------------------: | ----------------: |
| 总耗时             |                               11m42 |               **4m19** | **-7m23（-63%）** |
| Rust check         |                                1m04 |                    39s |              -25s |
| Rust tests         |                                1m28 |                    24s |             -1m04 |
| Tauri NSIS         |                                4m11 |                   1m18 |             -2m53 |
| Post Rust cache    |                                2m44 |                     0s |             -2m44 |
| 前端 Vite 构建次数 |                                   2 |                  **1** |                -1 |

Rust cache 状态不同（优化前 restore-key 非 full match；优化后 full match），因此 4m19 不是单纯 workflow 代码造成的全部收益；但可以确认：

- Release 前端构建从未优化前的 2 次降为 1 次。
- Push main 不再运行 NSIS；validation 9m28，且不保存 1GB cache。
- Release 热缓存总耗时 4m19；cold release 14m55。
- 优化前冷启动成功 run 23m14；优化后 cold release 14m55，且当前测试/依赖更多。

## 5. Artifact 验证

- Run：https://github.com/UoMiss/aram-mayhem/actions/runs/41316305870
- Artifact：`aram-mayhem-windows-x64`（id `13087243783`）
- 下载页：https://github.com/UoMiss/aram-mayhem/actions/runs/41316305870/artifacts/13087243783
- 文件：`aram-mayhem-windows-x64-setup.exe`
- 大小：**4,313,373 bytes**
- SHA-256：

```text
26916b588de478350d7444cc454b9a74dafcecef710e34c3d2e3ac2bcdb02f48
```

- 文件类型：PE32 NSIS self-extracting archive。
- 未签名、未创建 GitHub Release。

## 6. 未解决的构建性能瓶颈

1. 冷缓存仍需要约 14m55；主要耗时是首次 Rust/Tauri 依赖编译，不能通过 workflow 拆分消除。
2. Rust cache 约 1GB；首次保存约 1m08，热缓存 restore 约 53s。
3. Tauri release 编译 1m03（hot）+ NSIS 约 15s（hot），仍是主要固定成本。
4. 未测量/未修改 LTO；当前 Cargo 没有 release profile 覆盖。
5. `cargo check` 与 `cargo test` 分别编译 dev/test profile；为保留编译检查与全部测试，未合并删除。
6. Windows Runner 是 Server 2022，不是 Windows 10/11 桌面；不涉及真实 LCU 验收。

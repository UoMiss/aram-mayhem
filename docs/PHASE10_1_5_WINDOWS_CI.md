# 阶段 10.1.5：GitHub 推送与 Windows x64 CI / NSIS

结论：**Windows CI 构建与自动化测试通过**。
真实 Windows 10/11 桌面安装、运行和 LCU 连接仍未验收。

## 1. 仓库与提交

- 仓库：`https://github.com/UoMiss/aram-mayhem`（私有）
- 分支：`main`
- 代码/CI 成功提交：`5d0c961d1e107779eab9def6b0167b267a36e853`
- 基线：`d85bb44 chore: establish phase 9 Tauri baseline`
- 阶段 10.1：`39bb5b5 feat: add read-only LCU connection foundation`
- CI 配置：`ba246b7 ci: add Windows x64 NSIS build and LCU tests`
- Windows 修复：`5d0c961 fix: handle sysinfo system initialization on Windows`

## 2. Workflow

[.github/workflows/windows-build.yml](../.github/workflows/windows-build.yml)

- `workflow_dispatch` + `push` 到 `main`
- `windows-2022` x64
- Node.js 22 / pnpm 10.34.9
- Rust stable + `x86_64-pc-windows-msvc` + rustfmt
- pnpm store 与 Rust 缓存
- `permissions: contents: read`
- 不连接真实 LOL，不需要 LCU 凭据
- NSIS 构建后上传 `aram-mayhem-windows-x64` Artifact
- 不创建 GitHub Release，不自动签名

## 3. 首次失败与修复

首次运行 `41293745420` 在 `Rust Windows check` 失败：

```text
error[E0599]: no method named `refresh_processes` found for enum `Result<T, E>`
error[E0599]: no method named `processes` found for enum `Result<T, E>`
```

原因：`sysinfo 0.40` 的 `System::new_all()` 返回 `Result`，Windows 条件代码仍按旧 API 使用。

修复：`5d0c961` 使用：

```rust
let mut system = System::new_all()
    .map_err(|_| LcuError::discovery_failed("failed to initialize Windows process discovery"))?;
```

这是 Windows 条件编译代码在 CI 中实际发现并修复的问题。

## 4. 成功运行

- Run：[41294166671](https://github.com/UoMiss/aram-mayhem/actions/runs/41294166671)
- Workflow：`Windows x64 CI`
- 状态：`completed / success`
- 开始：2026-11-01T09:40:49Z
- 完成：2026-11-01T10:04:00Z

关键步骤：

| 步骤                                                                          | 结果                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------- |
| Checkout / pnpm / Node 22 / Rust stable                                       | 成功                                        |
| `pnpm check`（含 82 前端测试、TypeScript、ESLint、Prettier、baseline、build） | 成功                                        |
| `pnpm audit` / `pnpm audit --prod`                                            | 成功，0 漏洞                                |
| `cargo fmt --check`                                                           | 成功                                        |
| `cargo check --target x86_64-pc-windows-msvc`                                 | 成功，6m 09s                                |
| `cargo test --target x86_64-pc-windows-msvc`                                  | **27 passed**，3m 13s                       |
| `pnpm tauri build --target x86_64-pc-windows-msvc --bundles nsis`             | 成功                                        |
| 生成 NSIS                                                                     | `ARAM Mayhem_0.1.0_x64-setup.exe`，3.99 MiB |
| Artifact 上传                                                                 | 成功                                        |

CI 实际日志：

```text
Test Files  17 passed (17)
Tests       82 passed (82)
No known vulnerabilities found
No known vulnerabilities found
running 27 tests
test result: ok. 27 passed; 0 failed
Built application at: ...\release\aram-mayhem.exe
Running makensis to produce ...\ARAM Mayhem_0.1.0_x64-setup.exe
Finished 1 bundle at: ...\ARAM Mayhem_0.1.0_x64-setup.exe (3.99 MiB)
```

## 5. Artifact

- Artifact 名称：`aram-mayhem-windows-x64`
- Artifact id：`13078453720`
- 下载页：https://github.com/UoMiss/aram-mayhem/actions/runs/41294166671/artifacts/13078453720
- Artifact zip 大小：4,164,412 bytes
- 安装包文件名：`aram-mayhem-windows-x64-setup.exe`
- 安装包大小：**4,182,062 bytes**（约 3.99 MiB）
- 安装包 SHA-256：

```text
d08cacced2dde3049860a52fed425752b9748c035c4af14635b5099b57bf205f
```

- Artifact 内同时含 `windows-installer.sha256`。
- 文件类型：`PE32 executable (GUI) Intel 80386, for MS Windows, Nullsoft Installer self-extracting archive`。
- 安装包内部名称来自 Tauri：`ARAM Mayhem_0.1.0_x64-setup.exe`；`productName=ARAM Mayhem`、版本 `0.1.0`、窗口标题 `ARAM: Mayhem`，bundle 使用 `icons/icon.ico`。
- 本阶段不做代码签名；安装包未签名。

## 6. CI 中验证的 Windows 范围

已通过：

- Windows MSVC 条件编译（包括 `sysinfo` Windows 分支）。
- LCU lockfile/PID/discovery 类型检查。
- LCU 状态机、错误映射、单任务/取消/旧 generation/自动重连测试。
- `app_health_check` 与 LCU DTO 序列化测试。
- Tauri NSIS 打包与前端生产资源。
- 不依赖真实 LOL 客户端的全部自动化测试。

未通过（尚未执行）：

- Windows 10/11 真实桌面安装/卸载。
- WebView2 初始化。
- 中文字体/480×900 窗口/调整大小。
- 真实 LCU 进程发现、连接、退出、重启、端口变化。
- Tauri WebView 内图片复制/PNG 下载。
- 无客户端/客户端启动后的真实状态。

**GitHub Windows Server 2022 Runner 通过 ≠ Windows 10/11 桌面验收通过。**

## 7. 安全与发布

- Workflow 权限仅 `contents: read`。
- 没有 GitHub Token、LCU 密码、Authorization、私钥或本地路径写入仓库/日志。
- 没有 GitHub Release、自动发布、签名或更新配置。
- 安装包是 CI Artifact，不是正式发布物。
- LCU 真实连接仍未验证，不能把 CI 结果视为真实客户端已连通。

## 8. 下一步

1. 在真实 Windows 10 x64 / Windows 11 x64 安装 NSIS 包。
2. 在安装/卸载、WebView2、中文 UI、480×900、IPC、图片复制/下载中逐项验收。
3. 启动 LOL 客户端，验证发现、认证、退出、重启、端口变化和自动重连。
4. 修正 Windows 实机差异后，再进行阶段 10.1 正式 LCU 验收。
5. 阶段 10.2 再读取只读 gameflow/房间，不提前写游戏状态。

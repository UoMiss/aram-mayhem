# LCU 凭据发现改进：进程启动参数优先，lockfile 回退

## 背景证据

Windows 实机：

- `LeagueClient.exe` 与 `LeagueClientUx.exe` 同时运行，PID 不同。
- 从 `LeagueClientUx.exe` 目录读取 `lockfile` 遇到 `0x80070020` 共享冲突。
- 改用共享读取后 `ContentLength=0`。
- 两个进程的启动参数尚未验证。

**结论：当前 macOS 环境无法确认 Windows 启动参数，也不能确认真实 LCU HTTPS GET 成功。**

## 参考实现审查

参考：`paidaxn/aram-helper` 的 `find_credentials` / `from_wmic` / `from_powershell_cim` / `from_process_lockfile`。

借鉴：

- 从 `LeagueClientUx.exe` 命令行提取 `--app-port`、`--remoting-auth-token`。
- lockfile 作为回退。

未复制：

- `danger_accept_invalid_certs` 等 TLS 配置；
- 宽泛错误处理；
- 凭据缓存；
- WMIC 唯一路径；
- 无 PID 归属校验的直接凭据使用。

## 参考项目与当前实现差异

| 维度          | 参考项目 `aram-helper`                 | 当前 ARAM: Mayhem                                     | 是否可能导致失败                                          |
| ------------- | -------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| 参数发现顺序  | WMIC → PowerShell CIM → lockfile       | `sysinfo` 进程命令行 → lockfile                       | **可能**：若 `sysinfo` 取不到 cmd，当前没有 WMIC/CIM 回退 |
| 进程选择      | 只找 `LeagueClientUx.exe`              | Ux 优先，LeagueClient 次选                            | 当前覆盖更宽；多实例会报错而非随机选                      |
| 凭据归属      | 未校验 PID                             | 同一 PID 的 port+token；lockfile PID 校验             | 当前更严格，不是失败原因                                  |
| 参数格式      | 整段命令行字符串查找                   | argv 逐项解析，支持 `=`/空格                          | 等价；token 内 `=` 已覆盖                                 |
| lockfile 读取 | 普通 `read_to_string`                  | Windows 共享读 + 重试；空内容不算成功                 | 当前更适合用户遇到的 `0x80070020`/空文件                  |
| 连接探测      | 创建 client，后续查 `current-summoner` | `/riotclient/region-locale` + 兜底 `current-summoner` | **可能**：旧实现只查 region-locale，若该端点 404 会误判   |
| TLS           | 关闭证书校验                           | 专用 loopback client 关闭校验                         | 不是失败原因                                              |
| 错误处理/缓存 | 宽泛错误、凭证缓存                     | 稳定错误码、无凭证缓存                                | 不是失败原因                                              |
| 状态机        | 无本项目状态机                         | 保留 monitor/reconnect/event                          | 已保留                                                    |

### 参考项目成功路径确认状态

**未确认。** 当前环境没有运行参考项目的 Windows 日志，无法证明它实际走的是 WMIC、PowerShell CIM 还是 lockfile。用户已确认参考项目可连接，但这不等于已观测到具体发现分支。

**未复制的部分：** WMIC/PowerShell 源码、TLS 关闭代码、宽泛错误处理、凭据缓存。

### 本轮针对性修复

1. `sysinfo` 使用 `ProcessRefreshKind::everything()` 显式刷新，确保后启动客户端的 cmd 被填充。
2. probe 从单一 `region-locale` 扩展为：
   - `/riotclient/region-locale`（无用户信息）
   - `/lol-summoner/v1/current-summoner`（登录阶段兜底）
   - 401/403 立即认证失败；404/5xx 尝试下一个；成功仍需 JSON/2xx。
3. 仍保留 PID/name 归属校验和共享 lockfile 回退。
4. 未加入 WMIC/PowerShell 回退；如果实机确认 `sysinfo` cmd 为空，应基于脱敏日志再增加 PID-scoped CIM 回退，避免盲目复制和轮询开销。

## 实现差异

### 1. 纯解析器

`src-tauri/src/lcu/discovery.rs` 新增 `LcuProcessCredentials::parse`：

- 支持：
  - `--app-port=54321`
  - `--app-port 54321`
  - `--remoting-auth-token=token`
  - `--remoting-auth-token token`
- 同一命令行必须同时存在 port + token。
- port 必须 1–65535。
- token 不得为空/控制字符/空白。
- 支持 token 中合法的 `-`、`_`、`=`。
- `Debug` 输出 `[REDACTED]`，不输出 token。
- 解析失败返回 `None`，错误信息不包含 token。

### 2. 参数优先与 PID 归属

`discover_windows()`：

1. 扫描 `LeagueClientUx.exe` 的 `sysinfo::Process::cmd()`。
2. 只有同一 PID 的 port + token 才构造 `LcuClient`；客户端记录该 PID/进程名。
3. 若 Ux 无有效参数，再尝试 `LeagueClient.exe`。
4. 多个同组实例暴露凭据时返回错误，不随机选一个。
5. 参数不可用时才进入 lockfile 回退。

没有使用 WMIC/PowerShell；没有新增 Windows 依赖。

### 3. lockfile 共享回退

`read_lockfile_shared`：

- 使用 `OpenOptionsExt::share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)`。
- 短暂重试 3 次（25ms）。
- 空内容/读取失败 → 该进程不作为候选；不伪造连接。
- lockfile PID 必须匹配进程 PID。
- `LeagueClient.exe` 与 `LeagueClientUx.exe` 同安装目录时只读一次，避免重复候选。
- 日志仅输出 source/PID/result/port_present/token_present，不输出 token。

### 4. 保持不变

- Rust 状态机、自动重连、generation/fingerprint；
- HTTP 3s 超时、回环 `127.0.0.1`、HTTPS-only、TLS 策略；
- Tauri Event/Pinia/UI 联动；
- GitHub CI 缓存优化；
- 真实只读 probe 仍是 `/riotclient/region-locale`，args 发现后仍要 probe 成功才 connected。

## 测试

新增跨平台测试：

- 两种参数格式；
- 缺失 port/token；
- 非法 port（0、70000）；
- 空 token、空白/控制字符；
- token 内的 `=`；
- 不同 PID / 不同端口 fingerprint；
- Debug 不泄露 token。

Windows-only 测试：

- 空 lockfile；
- 文件被独占占用时共享读取失败；
- 释放后可共享读取有效 lockfile。

结果：

- Windows CI：Rust **54 passed**（含 Windows-only 共享锁测试）。
- 前端：**102 passed**。
- macOS 本地：Rust **53 passed**；Windows CI 的 Windows-only 测试额外 1 个。

## 需要 Windows 实机确认

启动新包后查看脱敏日志：

```text
[lcu_discovery] source=args pid=<pid> process=LeagueClientUx.exe port_present=true token_present=true
[lcu_discovery] source=lockfile pid=<pid> result=<code>
[lcu_status] status=Connected source=Real code=None monitoring=true
```

如果只有 `source=lockfile result=discovery_failed` 且没有 `source=args`，说明 `sysinfo` 未取得参数或参数不完整；此时不要猜改 lockfile 格式，先提供脱敏日志。

最终必须通过真实 Windows 上的只读 HTTPS GET 才能确认连接成功；CI 测试/编译不能替代。

## Windows CI 与 Artifact

- Commit SHA：`648009c0bc1bdb0834b9a858f73175b824a848c0`
- Validation：https://github.com/UoMiss/aram-mayhem/actions/runs/41585949958
  - 3m51；前端 102、Rust 54、audit；通过
- Release：https://github.com/UoMiss/aram-mayhem/actions/runs/41586391688
  - 5m27；Rust cache full match；NSIS 通过
- Artifact：`aram-mayhem-windows-x64`（id `13208610941`）
- 安装包：`aram-mayhem-windows-x64-setup.exe`
- 大小：**4,321,331 bytes**
- SHA-256：

```text
7668e7e71c594363d162043a00b161be65ca9f5625e57801ed822d73f1140a3e
```

- 下载页：https://github.com/UoMiss/aram-mayhem/actions/runs/41586391688/artifacts/13208610941
- 未签名、未创建 GitHub Release。
- **CI 只证明编译/测试/NSIS，不证明真实 Windows LCU 已连接。**

## 当前验收状态

- 代码、自动化测试、Windows NSIS 构建：通过。
- 参考项目具体成功发现路径：**未确认**。
- Windows 真实 LOL 客户端：**未执行本轮实机测试**。
- 因此不能宣称“ARAM: Mayhem 已能在同一 Windows 客户端成功连接”，阶段 10.1 不能正式通过。

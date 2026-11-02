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

- macOS：Rust **50 passed**（Windows-only 测试不运行）。
- 前端：**102 passed**。
- Windows CI：待运行；Windows-only 测试预计在其中执行。

## 需要 Windows 实机确认

启动新包后查看脱敏日志：

```text
[lcu_discovery] source=args pid=<pid> process=LeagueClientUx.exe port_present=true token_present=true
[lcu_discovery] source=lockfile pid=<pid> result=<code>
[lcu_status] status=Connected source=Real code=None monitoring=true
```

如果只有 `source=lockfile result=discovery_failed` 且没有 `source=args`，说明 `sysinfo` 未取得参数或参数不完整；此时不要猜改 lockfile 格式，先提供脱敏日志。

最终必须通过真实 Windows 上的只读 HTTPS GET 才能确认连接成功；CI 测试/编译不能替代。

# ARAM Mayhem

Windows 桌面助手，基于 Tauri 2、Vue 3 和 TypeScript。连接本机英雄联盟客户端后，可查看账号与对局状态、最近战绩、随机分组和对局结算。结算支持纯伤害、伤害尾数和赛后幸运数字规则。

## 安装和开发

- Windows 安装包在 [GitHub Releases](https://github.com/UoMiss/aram-mayhem/releases) 提供，安装包旁附 SHA-256 校验文件。
- 安装 Node.js 22、pnpm 10 和 Rust stable。Windows 原生构建还需要 MSVC 和 WebView2。
- `pnpm install --frozen-lockfile` 安装前端依赖。
- `pnpm dev` 启动浏览器演示。`pnpm tauri dev` 启动桌面应用。
- `pnpm check` 运行设计基线校验、格式检查、类型检查、Lint、前端测试及生产构建。
- `cargo test --locked --manifest-path src-tauri/Cargo.toml` 运行 Rust 测试。

Windows Release 工作流从版本标签构建 NSIS 安装包，并在 Windows 上验证静默安装与启动。源码仓库保留构建所需资源、测试样本及设计基线。

英雄头像使用 [Riot Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon)。

ARAM Mayhem isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

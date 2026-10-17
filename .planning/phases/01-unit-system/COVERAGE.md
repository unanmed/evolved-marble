# Phase 1 — API Coverage

No external API integration: pure in-process unit data model (no network/SDK).

Phase 1（单位系统）是一个纯粹的无头进程内领域模块：属性、职业/武器/防具常量表、正态随机生成与升级机制，全部由原生 TypeScript 与 `Math` 实现，运行时不引入任何网络、SDK、外部服务或数据反序列化面。唯一的外部依赖是已在 `package.json` 中声明的测试工具链（TypeScript、Vitest），不构成本阶段的 API 集成面。

因此本阶段不产出能力矩阵（capability matrix）——没有需要逐项 INTEGRATE / OPT-OUT 决策的外部 API 能力面。

# Evolved Marble

Evolved Marble 是一个基于强化学习的球球战争项目（可参考 Lost Marbles 等创作者的视频）。

## 需要的工具

-   `node.js >= 18`
-   `pnpm >= 8`
-   `ffmpeg n7.1 >= 2025`
-   `python == 3.9.22`
-   `requirements.txt` 中的 pip 依赖
-   `Chrome >= 94`，不支持 `Firefox`, `Safari` 浏览器

## 运行

```bash
pnpm i
```

然后执行如下代码启动本地服务器并进入游戏画面：

```bash
pnpm dev
```

## 训练

首先在根目录运行：

```bash
python -m model.train
```

然后打开游戏页面。

注意，之后会添加新的训练场景，启动训练的方法会有变化。

# Evolved Marble

Evolved Marble 是一个基于强化学习的球球战争项目（可参考 Lost Marbles 等创作者的视频）。

## 运行

首先确保你已经安装了 `node.js >= 18` 和 `pnpm >= 8`，先执行如下代码安装所需依赖：

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

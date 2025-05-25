from typing import Dict, Any
import logging
import ray
import os
from ray.rllib.algorithms.ppo import PPOConfig, PPO
from ray.rllib.env import ParallelPettingZooEnv
from ray.tune.registry import register_env
from .env import EvolvedMarbleEnv  # 替换为你的环境模块路径
from ray.rllib.algorithms.callbacks import DefaultCallbacks

def env_creator(config: Dict[str, Any]):
    """环境创建函数（RLlib要求）"""
    env = EvolvedMarbleEnv()
    return ParallelPettingZooEnv(env)

def train():
    # 注册自定义环境
    register_env("EvolvedMarble", env_creator)

    # 配置多智能体PPO
    config = (
        PPOConfig()
        .environment(
            env="EvolvedMarble"
        )
        .multi_agent(
            # 所有智能体共享同一策略
            policies={"shared_policy"},
            policy_mapping_fn=lambda agent_id, *args, **kwargs: "shared_policy",
        )
        .training(
            gamma=0.99,
            lr=1e-4,
            train_batch_size=300,
            model={"fcnet_hiddens": [256, 256]},
        )
        .checkpointing(
            checkpoint_trainable_policies_only=True
        )
        .env_runners(
            num_env_runners=0,
            batch_mode='complete_episodes',
            rollout_fragment_length='auto'
        )
    )

    # 启动训练
    algo = config.build_algo()
    print("--------------------")
    for i in range(1000):  # 训练1000轮
        result = algo.train()
        print(
            f"iter: {i + 1} | Red Reward: {result['env_runners']['agent_episode_returns_mean']['red']:.4} | "
            f"Blue Reward: {result['env_runners']['agent_episode_returns_mean']['blue']:.4}"
        )

        # 每100轮保存一次模型
        if (i + 1) % 5 == 0:
            algo.save_checkpoint(f"{os.path.abspath('.')}/checkpoint/{i + 1}")

if __name__ == "__main__":
    ray.init()

    # 开始训练
    train()

    # 关闭Ray
    ray.shutdown()

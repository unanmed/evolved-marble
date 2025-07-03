from typing import Dict, Any
import json
import ray
import os
import argparse
from time import sleep
from ray.rllib.algorithms.ppo import PPOConfig
from ray.rllib.env import ParallelPettingZooEnv
from ray.tune.registry import register_env
from .env import EvolvedMarbleEnv
from .ws import ws
from .frame import start

def env_creator(config: Dict[str, Any]):
    """环境创建函数（RLlib要求）"""
    env = EvolvedMarbleEnv(config)
    return ParallelPettingZooEnv(env)

def train(args):
    # 注册自定义环境
    register_env("EvolvedMarble", env_creator)

    # 配置多智能体 PPO，使用 lstm RNN 模型
    config = (
        PPOConfig()
        .environment(
            env="EvolvedMarble",
        )
        .multi_agent(
            # 所有智能体共享同一策略
            policies={"shared_policy"},
            policy_mapping_fn=lambda agent_id, *args, **kwargs: "shared_policy",
        )
        .training(
            gamma=0.99,
            lr=1e-4,
            train_batch_size=600,
            model={
                "use_lstm": True,
                "lstm_cell_size": 64,
                "max_seq_len": 32,
                "vf_share_layers": True,
            },
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
    
    ws.start()
    print("Waiting for connection.")
    while True:
        if ws.is_connected():
            break
        else:
            sleep(1)
    print("Client connected.")
    
    print("\n--------------------\n")

    # 启动训练
    algo = config.build_algo()
    reset_data = ws.send_and_receive({"type": "resetEpisode"})
    if reset_data["status"] != "success":
        raise RuntimeError("Client reset episode error!")
    if args.resume:
        algo.load_checkpoint(f"{os.path.abspath('.')}/checkpoint/{args.from_state}")
        with open(f"{os.path.abspath('.')}/checkpoint/{args.from_state}/custom.json") as f:
            data = json.load(f)
            load_data = ws.send_and_receive({"type": "load", "data": data})
            if load_data["status"] != "success":
                raise RuntimeError("Client load status error!")

        print("Train from loaded state.")
        
    print("\n--------------------\n")
    for i in range(1000):
        result = algo.train()
        print(
            f"iter: {i + 1} | Red Reward: {result['env_runners']['agent_episode_returns_mean']['red']:.4} | "
            f"Blue Reward: {result['env_runners']['agent_episode_returns_mean']['blue']:.4}"
        )

        # 每100轮保存一次模型
        if (i + 1) % 5 == 0:
            algo.save_checkpoint(f"{os.path.abspath('.')}/checkpoint/{i + 1}")
            save_data = ws.send_and_receive({"type": "save"})["data"]
            with open(f"{os.path.abspath('.')}/checkpoint/{i + 1}/custom.json", 'w') as f:
                json.dump(save_data, f)

if __name__ == "__main__":
    ray.init()
    
    parser = argparse.ArgumentParser()
    parser.add_argument('--resume', type=bool, default=False)
    parser.add_argument('--from_state', type=int, default=0)
    args = parser.parse_args()
    
    start()

    # 开始训练
    train(args)

    # 关闭Ray
    ray.shutdown()

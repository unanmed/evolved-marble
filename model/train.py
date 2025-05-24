import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
from argparse import ArgumentParser
from time import sleep
from .env import EvolvedMarbleEnv

# === 简单的 MLP 模型 ===
class PolicyNet(nn.Module):
    def __init__(self, obs_dim, act_dim):
        super().__init__()
        self.fc = nn.Sequential(
            nn.Linear(obs_dim, 256),
            nn.ReLU(),
            nn.Linear(256, 256),
            nn.ReLU(),
        )
        self.mean_layer = nn.Linear(256, act_dim)
        self.log_std = nn.Parameter(torch.zeros(act_dim))  # 可训练 log_std

    def forward(self, x):
        x = self.fc(x)
        mean = self.mean_layer(x)
        std = torch.exp(self.log_std)  # 确保 std > 0
        return mean, std


def train(args):
    # === 超参数 ===
    obs_dim = 16
    act_dim = 3
    lr = 1e-3
    gamma = 0.99
    n_episodes = 1000

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = PolicyNet(obs_dim, act_dim).to(device)
    optimizer = optim.Adam(model.parameters(), lr=lr)

    # === REINFORCE 策略 ===
    def select_action(obs):
        obs = torch.tensor(obs, dtype=torch.float32).to(device)
        mean, std = model(obs)
        dist = torch.distributions.Normal(mean, std)
        action = dist.sample()
        log_prob = dist.log_prob(action).sum(dim=-1)  # 连续动作多维，记得 sum
        action_clipped = torch.tanh(action)  # 限制动作在 [-1, 1]
        return action_clipped.cpu().numpy(), log_prob

    # === 多智能体并行训练循环 ===
    env = EvolvedMarbleEnv()
    
    print("Waiting for connection.")
    
    while True:
        if env.ws.is_connected():
            break
        else:
            sleep(1)
            
    print("Start to train.")
    
    start_ep = 0
    
    if args.resume:
        data = torch.load(args.from_state, map_location=device)
        model.load_state_dict(data["policy"])
        optimizer.load_state_dict(data["optim"])
        
        if data.get("episode") is not None:
            start_ep = data["episode"]

    for ep in range(n_episodes):
        optimizer.zero_grad()
        env.episode = start_ep + ep + 1
        obs_dict, _ = env.reset()
        termination = {agent: False for agent in obs_dict}

        log_probs = {agent: [] for agent in obs_dict}
        rewards = {agent: [] for agent in obs_dict}
        total_reward = {agent: 0.0 for agent in obs_dict}

        while not all(termination.values()):
            actions = {}
            for agent, obs in obs_dict.items():
                action, log_prob = select_action(obs)
                actions[agent] = action
                log_probs[agent].append(log_prob)

            next_obs, reward, termination, _, _ = env.step(actions)

            for agent in obs_dict:
                rewards[agent].append(reward[agent])
                total_reward[agent] += reward[agent]

            obs_dict = next_obs

        # === 策略更新（共享模型） ===
        all_returns = []
        all_log_probs = []

        for agent in rewards:
            R = 0
            returns = []
            for r in reversed(rewards[agent]):
                R = r + gamma * R
                returns.insert(0, R)
            returns = torch.tensor(returns).to(device)
            log_probs_agent = torch.stack(log_probs[agent])
            all_log_probs.append(log_probs_agent)
            all_returns.append(returns)

        loss = torch.Tensor([0])
        for lp, ret in zip(all_log_probs, all_returns):
            ret = (ret - ret.mean()) / (ret.std() + 1e-8)
            loss += -(lp * ret).sum()

        loss.backward()
        optimizer.step()

        # === 日志 ===
        avg_reward = np.mean(list(total_reward.values()))
        print(
            f"Episode: {ep + 1} | Avg Reward: {avg_reward:.2f} | "
            f"Red Reward: {total_reward["red"]:.2f} | Blue Reward: {total_reward["blue"]:.2f}"
        )
        
        if (ep + 1) % 5 == 0:
            torch.save({
                "policy": model.state_dict(),
                "optim": optimizer.state_dict(),
                "episode": start_ep + ep + 1
            }, f"checkpoint/{ep + 1}.pt")

if __name__ == "__main__":
    parser = ArgumentParser()
    parser.add_argument("--resume", type=bool, default=False)
    parser.add_argument("--from_state", type=str, default="")
    
    args = parser.parse_args()
    train(args)

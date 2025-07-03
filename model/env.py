import asyncio
from typing import Tuple
import numpy as np
from pettingzoo import ParallelEnv
from gymnasium.spaces import Box
from .ws import ws

class EvolvedMarbleEnv(ParallelEnv):
    def __init__(self, config):
        super().__init__()
        self.agents = ["red", "blue"]
        self.possible_agents = self.agents.copy()

        self._observation_space = Box(low=-1.0, high=1.0, shape=(16,), dtype=np.float32)
        self._action_space = Box(low=-1.0, high=1.0, shape=(3,), dtype=np.float32)

    def observation_space(self, agent):
        return self._observation_space

    def action_space(self, agent):
        return self._action_space

    def reset(self, seed=None, options=None):
        self.agents = self.possible_agents.copy()
        reset_payload = {"type": "reset"}
        result = ws.send_and_receive(reset_payload)["data"]
        obs = dict()
        for key, value in result["observation"].items():
            obs[key] = np.array(value, dtype=np.float32)
        return obs, result.get("info", dict())
        
    def step(self, actions):
        payload = {"type": "action", "actions": {}}
        for agent, action in actions.items():
            payload["actions"][agent] = {
                "linear": action[:2].tolist(),
                "angular": float(action[2]),
            }
        result = ws.send_and_receive(payload)["data"]
        obs = dict()
        for key, value in result["observation"].items():
            obs[key] = np.array(value, dtype=np.float32)
            
        self.agents = [
            agent for agent in self.agents
            if not result["termination"].get(agent, False) and 
                not result["truncation"].get(agent, False)
        ]
        
        return (
            obs,
            result["reward"],
            result["termination"],
            result["truncation"],
            result["info"],
        )

    def render(self):
        pass

    def close(self):
        pass

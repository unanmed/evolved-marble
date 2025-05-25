import asyncio
import json
from time import sleep
from typing import Any, Optional, Tuple
import numpy as np
from pettingzoo import ParallelEnv
from gymnasium.spaces import Box
from .ws_client import WebSocketServer


class EvolvedMarbleEnv(ParallelEnv):
    def __init__(self, config):
        super().__init__()
        self.ws = WebSocketServer()
        self.agents = ["red", "blue"]
        self.possible_agents = self.agents.copy()
        self.episode = config["episode"] - 2

        self._observation_space = Box(low=-1.0, high=1.0, shape=(16,), dtype=np.float32)
        self._action_space = Box(low=-1.0, high=1.0, shape=(3,), dtype=np.float32)
        self.ws.start()
        
        print("Waiting for connection.")
        while True:
            if self.ws.is_connected():
                break
            else:
                sleep(1)
        print("Client connected.")

    def observation_space(self, agent):
        return self._observation_space

    def action_space(self, agent):
        return self._action_space

    def reset(self, seed=None, options=None):
        self.episode += 1
        self.agents = self.possible_agents.copy()
        reset_payload = {"type": "reset", "episode": self.episode}
        result = asyncio.get_event_loop().run_until_complete(
            self._send_and_receive(reset_payload)
        )
        obs = dict()
        for key, value in result["observation"].items():
            obs[key] = np.array(value, dtype=np.float32)
        return obs, result.get("info", dict())

    async def step_async(self, actions: dict[str, np.ndarray]) -> Tuple[
        dict[str, np.ndarray],
        dict[str, float],
        dict[str, bool],
        dict[str, bool],
        dict[str, dict],
    ]:
        payload = {"type": "action", "actions": {}}
        for agent, action in actions.items():
            payload["actions"][agent] = {
                "linear": action[:2].tolist(),
                "angular": float(action[2]),
            }
        result = await self._send_and_receive(payload)
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

    def step(self, actions):
        return asyncio.get_event_loop().run_until_complete(self.step_async(actions))

    async def _send_and_receive(self, payload) -> dict:
        try:
            self.ws.send(json.dumps(payload))
            msg = self.ws.recv()
            return json.loads(msg)
        except (ConnectionError, json.JSONDecodeError) as e:
            print(f"WebSocket error: {e}")
            raise

    def render(self):
        pass

    def close(self):
        self.ws.stop()

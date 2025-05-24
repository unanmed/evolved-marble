import asyncio
import json
from typing import Any, Optional, Tuple
import numpy as np
from pettingzoo import ParallelEnv
from gymnasium.spaces import Box
from .ws_client import WebSocketServer


class EvolvedMarbleEnv(ParallelEnv):
    def __init__(self):
        super().__init__()
        self.ws = WebSocketServer()
        self.agents = ["red", "blue"]
        self.possible_agents = self.agents.copy()

        self._observation_space = Box(low=-1.0, high=1.0, shape=(16,), dtype=np.float32)
        self._action_space = Box(low=-1.0, high=1.0, shape=(3,), dtype=np.float32)
        self.ws.start()

    def observation_space(self, agent):
        return self._observation_space

    def action_space(self, agent):
        return self._action_space

    def reset(self, seed=None, options=None):
        reset_payload = {"type": "reset"}
        result = asyncio.get_event_loop().run_until_complete(
            self._send_and_receive(reset_payload)
        )
        return result["observation"], result.get("info", {})

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
        return (
            result["observation"],
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

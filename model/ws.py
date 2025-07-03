import asyncio
import websockets
import threading
import json
from time import sleep
from queue import Queue

class WebSocketServer:
    def __init__(self, host='0.0.0.0', port=7725):
        self.host = host
        self.port = port
        self.message_queue = Queue()
        self.send_queue = Queue()
        self.server_thread = None
        self.loop = None
        self.connections = set()

    async def handler(self, websocket: websockets.ServerConnection):
        self.connections.add(websocket)
        
        while True:
            # 发送队列中的消息
            if not self.send_queue.empty():
                message = self.send_queue.get()
                await websocket.send(message)
            
            # 接收消息
            try:
                message = await asyncio.wait_for(websocket.recv(), timeout=0.1)
                self.message_queue.put(message)
            except asyncio.TimeoutError:
                pass

    async def run_server(self):
        async with websockets.serve(self.handler, self.host, self.port) as server:
            self.server = server
            await asyncio.Future()  # 永久运行

    def start(self):
        def run_in_thread():
            self.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.loop)
            self.loop.run_until_complete(self.run_server())
        
        self.server_thread = threading.Thread(target=run_in_thread, daemon=True)
        self.server_thread.start()

    def send(self, message):
        """主线程调用此方法发送消息"""
        self.send_queue.put(message)

    def recv(self):
        """主线程调用此方法接收消息"""
        while True:
            if not self.message_queue.empty():
                return self.message_queue.get()
            else:
                sleep(0.01)

    def stop(self):
        if self.loop:
            self.loop.call_soon_threadsafe(self.loop.stop)
            self.server_thread.join()
            
    def is_connected(self):
        return len(self.connections) > 0
    
    def send_and_receive(self, payload) -> dict:
        try:
            self.send(json.dumps(payload))
            msg = self.recv()
            return json.loads(msg)
        except (ConnectionError, json.JSONDecodeError) as e:
            print(f"WebSocket error: {e}")
            raise
            
ws = WebSocketServer()

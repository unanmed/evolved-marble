import subprocess
import atexit
import threading
import os
import websockets
import asyncio

ffmpeg_process = subprocess.Popen([
    "ffmpeg",
    "-y",
    "-f", "image2pipe",
    "-framerate", "60",
    "-vcodec", "mjpeg",
    "-i", "-",
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-b:v", "8000k",
    "-pix_fmt", "yuv420p",
    os.path.join(os.getcwd(), 'video/output.mp4')
], stdin=subprocess.PIPE)

def end_frame():
    global ffmpeg_process
    ffmpeg_process.stdin.close()
    ffmpeg_process.wait()
    ffmpeg_process = None
    return {"code": 0}, 200

async def frame_handler(websocket):
    try:
        async for message in websocket:
            try:
                if message == "finish":
                    end_frame()
                elif ffmpeg_process is not None:
                    ffmpeg_process.stdin.write(message)
            except Exception as e:
                print(f"[FFmpeg] 写入失败: {e}")
    except websockets.exceptions.ConnectionClosed:
        print("[WebSocket] 客户端断开连接")

def on_exit():
    end_frame()
    
def start_ws_server():
    async def server():
        print("[WebSocket] 正在启动 ws://localhost:8076")
        async with websockets.serve(frame_handler, "localhost", 8076):
            await asyncio.Future()  # 永不返回

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(server())
    loop.run_forever()

def start():
    atexit.register(on_exit)
    os.makedirs(os.path.join(os.getcwd(), 'video'), exist_ok=True)
    
    thread = threading.Thread(target=start_ws_server, daemon=True)
    thread.start()
    print("[WebSocket] 服务已在独立线程启动")

import subprocess
import atexit
import threading
import logging
import os
from flask import Flask, request

app = Flask(__name__)
UPLOAD_FOLDER = 'frames'


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

@app.route('/upload-frame', methods=['POST'])
def upload_frame():
    data = request.data
    if not ffmpeg_process:
        return {"code": 2}, 500

    try:
        ffmpeg_process.stdin.write(data)
    except Exception as e:
        return {"code": 1}, 500

    return {"code": 0}, 200

@app.route('/end-frame', methods=['POST'])
def end_frame():
    global ffmpeg_process
    ffmpeg_process.stdin.close()
    ffmpeg_process.wait()
    ffmpeg_process = None
    return {"code": 0}, 200

@app.route('/ping', methods=['GET'])
def ping():
    return 'pong', 200

def on_exit():
    end_frame()
    
def run_flask():
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR)
    app.run(port=8075, use_reloader=False)

def start():
    # 注册退出时清理函数
    atexit.register(on_exit)

    # 启动 Flask（后台）
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()
    
    print('Flask server started.')

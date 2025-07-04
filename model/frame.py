import subprocess
import atexit
import threading
import logging
import os
from flask import Flask, request

app = Flask(__name__)
RECORDED_FILE = os.path.join(os.getcwd(), 'video/recorded.webm')
OUTPUT_FILE = os.path.join(os.getcwd(), 'video/output.webm')
chunk_index = 0

@app.route('/upload-chunk', methods=['POST'])
def upload_chunk():
    global chunk_index
    data = request.data
    if not data:
        return {"code": 1}, 400

    with open(RECORDED_FILE, "ab") as f:
        f.write(data)

    chunk_index += 1
    return {"code": 0}, 200

@app.route('/end-frame', methods=['POST'])
def end_frame():
    cmd = f"ffmpeg -i {RECORDED_FILE} -c copy {OUTPUT_FILE}"
    os.system(cmd)

@app.route('/ping-chunk', methods=['GET'])
def ping():
    return 'pong', 200

def on_exit():
    end_frame()
    
def run_flask():
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR)
    app.run(port=8076)

def start():
    os.makedirs(os.path.join(os.getcwd(), 'video'), exist_ok=True)
    # 注册退出时清理函数
    atexit.register(on_exit)
    
    open(RECORDED_FILE, "wb").close()  # 清空文件

    # 启动 Flask（后台）
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()
    
    print('Flask server started.')

import os
import base64

TEXTURES_DIR = "textures"
OUTPUT_PATH = "textures.js"

code = ""

for file_name in os.listdir(TEXTURES_DIR):
    if not file_name.endswith(".png"):
        continue

    path = os.path.join(TEXTURES_DIR, file_name)
    with open(path, "rb") as file:
        texture_bytes = file.read()

    base64_encoding = base64.b64encode(texture_bytes).decode()
    data_uri = "data:image/png;base64," + base64_encoding

    var_name = file_name.replace(".", "_")
    code_line = f"const {var_name} = \"{data_uri}\";\n"
    code += code_line

with open(OUTPUT_PATH, "w") as file:
    file.write(code)

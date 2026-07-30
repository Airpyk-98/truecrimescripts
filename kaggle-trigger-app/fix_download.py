import json

notebook_path = "Youtube-Truecrime-FLUX-Zai-KokoroTTS-T4.ipynb"

with open(notebook_path, 'r', encoding='utf-8') as f:
    nb = json.load(f)

for cell in nb.get('cells', []):
    if cell['cell_type'] == 'code':
        source = cell['source']
        for i, line in enumerate(source):
            if "urllib.request.urlretrieve(urls[0], img_path)" in line:
                # We replace this line with requests.get
                indent = line[:len(line) - len(line.lstrip())]
                
                new_lines = [
                    indent + "img_resp = requests.get(urls[0], headers=headers, timeout=30)\n",
                    indent + "img_resp.raise_for_status()\n",
                    indent + "with open(img_path, 'wb') as f:\n",
                    indent + "    f.write(img_resp.content)\n"
                ]
                
                # Replace the original urlretrieve line
                source = source[:i] + new_lines + source[i+1:]
                cell['source'] = source
                print("Successfully patched urlretrieve.")
                break

with open(notebook_path, 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=2)
print("Notebook saved.")

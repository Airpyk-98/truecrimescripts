import json as json_mod

filepath = 'Youtube-Truecrime-FLUX-Zai-KokoroTTS-T4.ipynb'
with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

# Fix: add json to the import line inside run_phase_1_z_image
old_import = '"    import requests, time, urllib.request\\n",'
new_import = '"    import requests, time, urllib.request, json\\n",'

count = text.count(old_import)
if count == 1:
    text = text.replace(old_import, new_import)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(text)
    print(f"SUCCESS: Fixed json import (replaced {count} occurrence)")
else:
    print(f"WARNING: Found {count} occurrences of the import line")
    if count > 0:
        text = text.replace(old_import, new_import)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(text)
        print("Replaced all occurrences anyway")

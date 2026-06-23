import json

filepath = 'Youtube-Truecrime-FLUX-Zai-KokoroTTS-T4.ipynb'
with open(filepath, 'r', encoding='utf-8') as f:
    data = json.load(f)

for cell in data['cells']:
    if cell['cell_type'] == 'code':
        new_source = []
        skip = 0
        for line in cell['source']:
            if line == 'if USE_Z_IMAGE:\n' and skip == 0:
                # We only want to remove the one that appears before the def run_phase_1_z_image()
                # But wait, how do we know if it's the right one?
                # The rogue one is right after the "# If all images already exist on disk, this block is never executed." line.
                pass
                
        # Better logic:
        # Just remove the rogue 4 lines manually
        new_source = []
        skip_count = 0
        for line in cell['source']:
            if line == 'if USE_Z_IMAGE:\n' and '# This never crashes at startup. The token is only fetched + validated\n' in "".join(cell['source']):
                # If we are in the cell with the lazy auth comment
                # Wait, the whole notebook is just ONE giant code cell!
                pass

# Let's do string replacement on the JSON file directly
with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

# The exact lines inside the json array are:
#         "if USE_Z_IMAGE:\n",
#         "    run_phase_1_z_image()\n",
#         "else:\n",
#         "    run_phase_1_flux()\n",

# We want to replace the first occurrence of this block.
old_block = '        "if USE_Z_IMAGE:\\n",\n        "    run_phase_1_z_image()\\n",\n        "else:\\n",\n        "    run_phase_1_flux()\\n",\n'
new_block = ''

# There are 2 occurrences. The first one is the rogue one.
if text.count(old_block) == 2:
    text = text.replace(old_block, new_block, 1)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)

print("Fixed notebook.")

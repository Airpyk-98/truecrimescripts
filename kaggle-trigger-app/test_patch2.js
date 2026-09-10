const fs = require('fs');

const notebookRaw = fs.readFileSync('Youtube-Truecrime-FLUX-Zai-KokoroTTS-T4.ipynb', 'utf8');
const notebookData = JSON.parse(notebookRaw);
let outputLog = "";

for (let i = 0; i < notebookData.cells.length; i++) {
  const c = notebookData.cells[i];
  if (c.cell_type === 'code') {
    let src = c.source.join("");
    
    // 1. Patch run_phase_1_z_image to save urls
    if (src.includes('def run_phase_1_z_image():') && !src.includes('z_image_urls.json')) {
        src = src.replace('    serials = [str(r["Serial number"])', '    z_image_urls = {}\n    serials = [str(r["Serial number"])');
        src = src.replace('urllib.request.urlretrieve(urls[0], img_path)', 'urllib.request.urlretrieve(urls[0], img_path)\n                            z_image_urls[sn] = urls[0]');
        src = src.replace('zip_path = os.path.join', 'with open(os.path.join(OUTPUTS_DIR if "OUTPUTS_DIR" in globals() else OUTPUT_DIR, "z_image_urls.json"), "w") as f:\n        import json\n        json.dump(z_image_urls, f)\n\n    zip_path = os.path.join');
        c.source = src.split('\n').map((line, idx, arr) => idx === arr.length - 1 ? line : line + '\n');
    }
    
    // 2. Inject run_phase_1c_upscale before phase 2
    let srcStr2 = c.source.join("");
    if (srcStr2.includes('def run_phase_2_audio():') && !srcStr2.includes('def run_phase_1c_upscale():')) {
       outputLog += "MATCHED PHASE 2 AUDIO\\n";
       const upscaleCode = `
# ============================================================
# PHASE 1C — Upscale Images
# ============================================================
def run_phase_1c_upscale():
    pass
`;
       const upLines = upscaleCode.split('\n').map((line, idx, arr) => idx === arr.length - 1 ? line : line + '\n');
       const newLines = [];
       for (let line of c.source) {
           if (line.includes('def run_phase_2_audio():')) newLines.push(...upLines);
           newLines.push(line);
       }
       c.source = newLines;
    }

    // 3. Patch execution block
    let srcStr = c.source.join("");
    if (srcStr.includes('run_phase_5_final(stitched)') && !srcStr.includes('run_pipeline_for_images')) {
        outputLog += "MATCHED PHASE 5 FINAL\\n";
        const newExec = `if USE_Z_IMAGE:
    run_phase_1_z_image()
else:
    run_phase_1_flux()

if UPSCALE_MODE in ["upscaled_only", "both"]:
    run_phase_1c_upscale()

run_phase_2_audio()

def run_pipeline_for_images(img_dir_path, suffix_name):
    pass
`;
        const startIndex = c.source.findIndex(line => line.includes('if USE_Z_IMAGE:'));
        const endIndex = c.source.findIndex(line => line.includes('run_phase_5_final(stitched)'));
        outputLog += "startIndex: " + startIndex + " endIndex: " + endIndex + "\\n";
        if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
            outputLog += "SPLICING IN EXEC BLOCK\\n";
            const execLines = newExec.split('\n').map((line, idx, arr) => idx === arr.length - 1 ? line : line + '\n');
            c.source.splice(startIndex, endIndex - startIndex + 1, ...execLines);
        } else {
            outputLog += "FAILED CONDITION!\\n";
        }
    }
  }
}

fs.writeFileSync('test_output.txt', outputLog);

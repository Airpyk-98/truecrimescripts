const fs = require('fs');

const notebookRaw = fs.readFileSync('Youtube-Truecrime-FLUX-Zai-KokoroTTS-T4.ipynb', 'utf8');
const notebookData = JSON.parse(notebookRaw);

for (let i = 0; i < notebookData.cells.length; i++) {
  const c = notebookData.cells[i];
  if (c.cell_type === 'code') {
    let srcStr = c.source.join("");
    if (srcStr.includes('run_phase_5_final(stitched)') && !srcStr.includes('run_pipeline_for_images')) {
        console.log("MATCH FOUND IN CELL", i);
        
        const newExec = `if USE_Z_IMAGE:
    run_phase_1_z_image()
else:
    run_phase_1_flux()

if UPSCALE_MODE in ["upscaled_only", "both"]:
    run_phase_1c_upscale()

run_phase_2_audio()

def run_pipeline_for_images(img_dir_path, suffix_name):
    global IMAGES_DIR
    orig_images = IMAGES_DIR
    IMAGES_DIR = img_dir_path
    
    run_phase_3_effects()
    stitched_vids = run_phase_4_stitch()
    
    final_out = os.path.join(OUTPUT_DIR, f"FINAL_AUTOMATED_OUTPUT_{ASPECT_RATIO.replace(':','_')}_{suffix_name}.mp4")
    default_out = os.path.join(OUTPUT_DIR, f"FINAL_AUTOMATED_OUTPUT_{ASPECT_RATIO.replace(':','_')}.mp4")
    
    run_phase_5_final(stitched_vids)
    
    if os.path.exists(default_out):
        os.rename(default_out, final_out)
        print(f"--> Saved {suffix_name} video to: {final_out}")
        
    IMAGES_DIR = orig_images

if UPSCALE_MODE == "both":
    print("\\n--> Running pipeline for NORMAL images...")
    run_pipeline_for_images(IMAGES_DIR, "normal")
    print("\\n--> Running pipeline for UPSCALED images...")
    run_pipeline_for_images(IMAGES_DIR_UPSCALED, "upscaled")
elif UPSCALE_MODE == "upscaled_only":
    print("\\n--> Running pipeline for UPSCALED images...")
    run_pipeline_for_images(IMAGES_DIR_UPSCALED, "upscaled")
else:
    print("\\n--> Running pipeline for NORMAL images...")
    run_pipeline_for_images(IMAGES_DIR, "normal")`;

        const startIndex = c.source.findIndex(line => line.includes('if USE_Z_IMAGE:'));
        const endIndex = c.source.findIndex(line => line.includes('run_phase_5_final(stitched)'));
        console.log("startIndex:", startIndex, "endIndex:", endIndex);
        if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
            console.log("SPLICING...");
            const execLines = newExec.split('\n').map((line, idx, arr) => idx === arr.length - 1 ? line : line + '\n');
            c.source.splice(startIndex, endIndex - startIndex + 1, ...execLines);
            console.log("SPLICED LENGTH:", execLines.length);
            
            // Check if it worked
            let newSrc = c.source.join("");
            if (newSrc.includes("run_pipeline_for_images")) {
                console.log("SUCCESS!");
            }
        }
    }
  }
}

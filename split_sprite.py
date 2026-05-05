#!/usr/bin/env python3
from PIL import Image
import os

# Input and output paths
input_path = "/Users/pengyuang/Desktop/play/crown-competition/client/src/assets/copilot/gibbon-sprite-reference.png"
output_dir = "/Users/pengyuang/Desktop/play/crown-competition/client/src/assets/copilot"

# Delete temp files first
for i in range(6):
    temp_file = os.path.join(output_dir, f"temp-{i}.png")
    if os.path.exists(temp_file):
        os.remove(temp_file)
        print(f"Removed {temp_file}")

# Open the sprite image
img = Image.open(input_path)
total_width, height = img.size

print(f"Image size: {total_width}x{height}")

frame_width = 500

# Final, carefully chosen positions:
# - idle1-4: the 4 standing ones
# - wave: the one waving (5th from left)
# - jump: the one jumping (rightmost)

centers = [170, 530, 890, 1250, 1660, 2040]
frame_names = [
    "gibbon-idle-1.png",
    "gibbon-idle-2.png",
    "gibbon-idle-3.png",
    "gibbon-idle-4.png",
    "gibbon-wave.png",
    "gibbon-jump.png",
]

# Crop each frame
for i, center in enumerate(centers):
    left = center - frame_width // 2
    right = left + frame_width

    # Stay within image bounds
    if left < 0:
        left = 0
        right = frame_width
    if right > total_width:
        right = total_width
        left = total_width - frame_width

    frame = img.crop((left, 0, right, height))
    output_path = os.path.join(output_dir, frame_names[i])
    frame.save(output_path)
    print(f"Saved: {output_path} ({right-left}x{height})")

print("\nDone! Successfully generated 6 images, all 500x724 pixels.")

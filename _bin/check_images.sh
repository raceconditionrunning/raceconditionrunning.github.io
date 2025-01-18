#!/usr/bin/env bash

# Check for argument
if [[ -z $1 ]]; then
    echo >&2 "Must pass path to root of site"
    exit 1
fi
assets_root=$1/img

# Ensure ImageMagick's 'identify' command is installed
# command -v identify >/dev/null 2>&1 || { echo >&2 "I need identify from ImageMagick, but it is not installed."; exit 1; }
# echo "Checking $(echo "$imgs" | wc -l) images..."
# All images with .webp, .jpg, .jpeg, .png, .gif, .svg, .avif
find "$assets_root" -type f \( -iname "*.webp" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.gif" -o -iname "*.svg" -o -iname "*.avif" \) |
while IFS= read -r file; do
    #format=$(identify -format '%m' "$file")
    #width=$(identify -format '%w' "$file")
    #height=$(identify -format '%h' "$file")
    filesize=$(du -s "$file" | awk '{print $1}')
    #exif=$(identify -format "%[EXIF:*]" "$file")

    if (( "$filesize" > 3000 )); then
        >&2 echo "Image $file (${filesize}KB) is too large. Should fit within 3MB."
        failed=1
    fi
done

exit $failed
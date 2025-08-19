#!/bin/bash
set -e

# Check which route images need generation based on cache manifest
# Outputs environment variables for use by make/CI
# Also handles updating manifest for successful generations

MANIFEST_FILE=".route-preview-cache-manifest"
CURRENT_MANIFEST=".route-preview-cache-current-manifest"

# Function to update manifest with successful files
update_manifest_with_successful() {
    if [ -f ".route-preview-cache-successful-files" ] && [ -s ".route-preview-cache-successful-files" ]; then
        echo "Updating manifest for successful files only..."

        # Create new manifest entries for successful files
        while read -r gpx_file; do
            if [ -n "$gpx_file" ] && [ -f "$gpx_file" ]; then
                sha256sum "$gpx_file"
            fi
        done < .route-preview-cache-successful-files | sort > .route-preview-cache-successful-manifest

        # Merge with existing manifest (removing old entries for these files)
        if [ -f "$MANIFEST_FILE" ]; then
            # Keep old entries NOT for files we just processed, add new entries
            (grep -v -f .route-preview-cache-successful-files "$MANIFEST_FILE" 2>/dev/null || true; cat .route-preview-cache-successful-manifest) | sort -u > .route-preview-cache-new-manifest
        else
            cp .route-preview-cache-successful-manifest .route-preview-cache-new-manifest
        fi

        mv .route-preview-cache-new-manifest "$MANIFEST_FILE"
        #rm -f .route-preview-cache-successful-manifest
        echo "Manifest updated successfully"
    else
        echo "No successful generations found, manifest unchanged"
    fi

    # Cleanup
    #rm -f .route-preview-cache-successful-files .route-preview-cache-changed-files .route-preview-cache-current-manifest
}

# Handle the update case
if [ "$1" = "update" ]; then
    update_manifest_with_successful
    exit 0
fi

# Normal check case
# Create manifest of current GPX files with their hashes
find routes/_gpx -name "*.gpx" -exec sha256sum {} \; | sort > "$CURRENT_MANIFEST"

if [ -f "$MANIFEST_FILE" ]; then
    # Extract just the file paths for comparison (sha256sum format: "hash  filename")
    awk '{print substr($0, index($0, "  ") + 2)}' "$MANIFEST_FILE" | sort > .cached-paths
    awk '{print substr($0, index($0, "  ") + 2)}' "$CURRENT_MANIFEST" | sort > .current-paths
    
    # Compare with cached manifest to find changes
    CHANGED_FILES=$(comm -13 .cached-paths .current-paths || true)
    DELETED_FILES=$(comm -23 .cached-paths .current-paths || true)
    
    # Clean up temp files
    rm -f .cached-paths .current-paths
else
    # No manifest = generate all
    CHANGED_FILES=$(find routes/_gpx -name "*.gpx")
    DELETED_FILES=""
fi

# Output results
if [ -n "$CHANGED_FILES" ]; then
    echo "NEEDS_GENERATION=true"
    echo "Changed GPX files:"
    echo "$CHANGED_FILES"

    # Write changed files to a temporary file for make to read
    echo "$CHANGED_FILES" > .route-preview-cache-changed-files
else
    echo "NEEDS_GENERATION=false"
    echo "No GPX files changed"
    echo "" > .route-preview-cache-changed-files
fi

# Clean up images for deleted GPX files
if [ -n "$DELETED_FILES" ]; then
    echo "Cleaning up images for deleted GPX files:"
    echo "$DELETED_FILES" | while read -r gpx_file; do
        if [ -n "$gpx_file" ]; then
            route_key=$(basename "$gpx_file" .gpx)
            img_file="_site/img/routes/${route_key}.jpg"
            if [ -f "$img_file" ]; then
                echo "Removing $img_file"
                rm -f "$img_file"
            fi
        fi
    done
fi

# For GitHub Actions output
if [ "$GITHUB_OUTPUT" ]; then
    if [ -n "$CHANGED_FILES" ]; then
        echo "needs_generation=true" >> "$GITHUB_OUTPUT"
        echo "changed_files<<EOF" >> "$GITHUB_OUTPUT"
        echo "$CHANGED_FILES" >> "$GITHUB_OUTPUT"
        echo "EOF" >> "$GITHUB_OUTPUT"
    else
        echo "needs_generation=false" >> "$GITHUB_OUTPUT"
    fi
fi
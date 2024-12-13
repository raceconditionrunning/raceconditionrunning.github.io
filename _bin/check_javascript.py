import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright


def find_html_files(build_dir):
    """Recursively find all .html files in the build directory."""
    html_files = []
    for root, _, files in os.walk(build_dir):
        for file in files:
            if file.endswith(".html"):
                full_path = os.path.join(root, file)
                html_files.append(full_path)
    return html_files


def local_file_to_url(build_dir, file_path):
    """Convert a local file path to a URL for a locally served site."""
    relative_path = os.path.relpath(file_path, build_dir)
    url = f"http://localhost:4000/{relative_path.replace(os.path.sep, '/')}"
    return url


def test_pages(build_dir):
    """Test all pages for JavaScript errors."""
    html_files = find_html_files(build_dir)
    pages = [local_file_to_url(build_dir, f) for f in html_files]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        results = []

        for page_url in pages:
            errors = []
            page = browser.new_page()

            # Capture console errors
            def on_console_message(msg):
                if msg.type == "error":
                    errors.append(msg.text)

            page.on("console", on_console_message)

            try:
                print(f"Testing {page_url}...")
                page.goto(page_url, wait_until="load")
            except Exception as e:
                errors.append(f"Failed to load page: {e}")

            results.append({"page_url": page_url, "errors": errors})
            page.close()

        browser.close()

        # Output results
        for result in results:

            if not result["errors"]:
                pass
                # Quiet
                #print(f"\nPage: {result['page_url']}")
                #print("✔ No JavaScript errors.")
            else:
                print(f"\nPage: {result['page_url']}")
                print("✖ JavaScript errors:")
                for error in result["errors"]:
                    print(f"  - {error}")

        # Exit with non-zero code if errors found
        if any(result["errors"] for result in results):
            exit(1)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python test_site.py <build_directory>")
        sys.exit(1)

    build_directory = sys.argv[1]

    if not os.path.isdir(build_directory):
        print(f"Error: {build_directory} is not a valid directory.")
        sys.exit(1)

    print(f"Testing all .html files in: {build_directory}")
    print("Make sure a local server is running on http://localhost:4000")
    test_pages(build_directory)
#!/usr/bin/env python3
"""
Generate OpenGraph images for route maps.
This script:
1. Finds all GPX route files
2. Starts a local HTTP server to serve the compiled site
3. For each route, renders the corresponding HTML page via HTTP
4. Captures the map element as an image
5. Optimizes and saves to img/routes/[key].jpg
"""

import os
import glob
import pathlib
import time
import argparse
from PIL import Image
import io
import logging
import threading
import http.server
import socketserver
import socket
import random

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Parse arguments
parser = argparse.ArgumentParser(description='Generate OpenGraph images for routes')
parser.add_argument('--site-dir', type=pathlib.Path, default='_site', help='Path to the compiled site directory')
parser.add_argument('--gpx-dir', type=pathlib.Path, default='routes/_gpx', help='Path to the GPX files directory')
parser.add_argument('--output-dir', type=pathlib.Path, default='_site/img/routes', help='Path to save generated images')
parser.add_argument('--quality', type=int, default=85, help='JPEG quality (1-100)')
parser.add_argument('--port', type=int, default=0, help='Port for local server (0 = auto-select)')
parser.add_argument('--incremental', action='store_true', help='Only generate images for new/changed routes')
args = parser.parse_args()

os.makedirs(args.output_dir, exist_ok=True)

def find_free_port():
    """Find a free port to use for the local server"""
    if args.port != 0:
        return args.port

    # Try a random port between 8000-9000 first
    preferred_port = random.randint(8000, 9000)
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(('', preferred_port))
        s.close()
        return preferred_port
    except:
        # If random port fails, let OS choose
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(('', 0))
        port = s.getsockname()[1]
        s.close()
        return port

def start_http_server(directory, port):
    """Start a local HTTP server in a separate thread"""
    os.chdir(directory)
    handler = http.server.SimpleHTTPRequestHandler

    class QuietHTTPRequestHandler(handler):
        def log_message(self, format, *args):
            # Suppress server logs to avoid cluttering the output
            pass

    with socketserver.TCPServer(("", port), QuietHTTPRequestHandler) as httpd:
        logger.info(f"Started local server at http://localhost:{port}")
        httpd.serve_forever()


from playwright.sync_api import sync_playwright

def generate_route_images():
    port = find_free_port()

    # Server needs to run out of the working dir
    original_dir = os.getcwd()

    # Start HTTP server in a separate thread
    server_thread = threading.Thread(
        target=start_http_server,
        args=(args.site_dir, port),
        daemon=True
    )
    server_thread.start()

    # Small delay to ensure server is up
    time.sleep(1)

    gpx_files = glob.glob(f"{original_dir}/{args.gpx_dir}/*.gpx")
    logger.info(f"Found {len(gpx_files)} GPX files")

    generated_images = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            args=[
                "--disable-web-security",  # Disable CORS
                "--enable-webgl",
            ]
        )
        page = browser.new_page(viewport={"width": 1920, "height": 1080})

        page.on("console", lambda msg: logger.debug(f"Browser console: {msg.text}"))

        for gpx_file in gpx_files:
            # Get route key from filename (without extension)
            route_key = os.path.splitext(os.path.basename(gpx_file))[0]
            output_path = original_dir / args.output_dir / f"{route_key}.jpg"

            # Skip if image exists and we're in incremental mode
            if args.incremental and os.path.exists(output_path):
                gpx_modified = os.path.getmtime(gpx_file)
                img_modified = os.path.getmtime(output_path)
                if gpx_modified <= img_modified:
                    logger.info(f"Skipping {route_key} (unchanged)")
                    continue


            url = f"http://localhost:{port}/routes/{route_key}/"
            logger.info(f"Processing {route_key} from {url}")

            try:
                page.goto(url, wait_until="networkidle", timeout=30000)
                page.wait_for_selector("#map", timeout=10000)
                page.evaluate("""
                    () => {
                        const container = document.getElementById('route-map');
                        if (container) {
                            container.classList.add('preview-mode');
                        }
                    }
                """)

                map_info = page.evaluate("""
                    () => {
                        const map = document.getElementById('map');
                        return {
                            exists: !!map,
                            height: map ? map.offsetHeight : 0,
                            width: map ? map.offsetWidth : 0,
                            mapObjExists: typeof window.map !== 'undefined'
                        };
                    }
                """)
                logger.debug(f"Map info: {map_info}")


                # Take screenshot of just the map element
                map_element = page.query_selector("#map")
                if map_element:
                    screenshot_bytes = map_element.screenshot()
                    image = Image.open(io.BytesIO(screenshot_bytes))
                    image.save(output_path, "JPEG", quality=args.quality, optimize=True)
                    logger.info(f"Saved OpenGraph image to {output_path}")
                    generated_images.append(output_path)
                else:
                    logger.error(f"Could not find map element for {route_key}")

            except Exception as e:
                logger.error(f"Error processing {route_key}: {str(e)}")

        browser.close()

    return generated_images


if __name__ == "__main__":
    generated_images = generate_route_images()
    logger.info(f"Generated {len(generated_images)} OpenGraph images")

#!/usr/bin/env python3
"""
Generate OpenGraph images for route maps with parallelization.
This script:
1. Finds all GPX route files
2. Starts a local HTTP server to serve the compiled site
3. Processes routes in parallel using a thread pool
4. For each route, renders the corresponding HTML page via HTTP
5. Captures the map element as an image
6. Optimizes and saves to img/routes/[key].jpg
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
import concurrent.futures
from dataclasses import dataclass
from typing import List, Optional

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
parser.add_argument('--workers', type=int, default=4, help='Number of parallel workers')
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

    with socketserver.TCPServer(("", port), handler) as httpd:
        logger.info(f"Started local server at http://localhost:{port}")
        httpd.serve_forever()

@dataclass
class RouteTask:
    route_key: str
    gpx_path: str
    output_path: pathlib.Path
    url: str

from playwright.sync_api import sync_playwright

# We won't use a browser pool since Playwright objects aren't thread-safe
# Instead, each worker thread will have its own browser instance

class PlaywrightThread(threading.local):
    """Thread-local storage for Playwright instances"""
    def __init__(self):
        self.playwright = None
        self.browser = None
        self.page = None

    def initialize(self):
        """Initialize Playwright for this thread"""
        if self.playwright is None:
            self.playwright = sync_playwright().start()
            self.browser = self.playwright.chromium.launch(
                headless=True,
                args=[
                    "--disable-web-security",  # Disable CORS
                    "--enable-webgl",
                ]
            )
            self.page = self.browser.new_page(viewport={"width": 1920, "height": 1080})
            self.page.on("console", lambda msg: logger.warning(f"Browser console: {msg.text}"))

    def cleanup(self):
        """Clean up resources for this thread"""
        if self.browser:
            self.browser.close()
            self.browser = None
        if self.playwright:
            self.playwright.stop()
            self.playwright = None

# Create a thread-local instance
playwright_context = PlaywrightThread()


def get_file_size_str(file_path):
    """Get human-readable file size"""
    size_bytes = os.path.getsize(file_path)
    if size_bytes < 1024:
        return f"{size_bytes} bytes"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.2f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.2f} MB"


def process_route(task: RouteTask, quality: int) -> Optional[pathlib.Path]:
    """Process a single route task using a thread-local browser instance"""
    try:
        # Initialize Playwright in this thread if not already done
        playwright_context.initialize()
        page = playwright_context.page

        logger.info(f"Processing {task.route_key} from {task.url}")

        page.goto(task.url, wait_until="networkidle", timeout=30000)
        page.wait_for_selector("#map", timeout=10000)
        page.evaluate("""
            () => {
                const container = document.getElementById('route-map');
                if (container) {
                    container.classList.add('preview-mode');
                }
            }
        """)

        # Take screenshot of just the map element
        map_element = page.query_selector("#map")
        if map_element:
            screenshot_bytes = map_element.screenshot()
            image = Image.open(io.BytesIO(screenshot_bytes))
            image.save(task.output_path, "JPEG", quality=quality, optimize=True)

            # Get and log the file size
            file_size_bytes = os.path.getsize(task.output_path)
            file_size_str = get_file_size_str(task.output_path)
            logger.info(f"Saved OpenGraph image to {task.output_path} (Size: {file_size_str}, {file_size_bytes} bytes)")

            # Optional: Log a warning if file size is suspiciously small (possibly empty map)
            if file_size_bytes < 10000:  # Less than 10KB might indicate a problem
                logger.warning(f"WARNING: Image size for {task.route_key} is very small ({file_size_str}). Map may not have loaded properly!")

            return task.output_path
        else:
            logger.error(f"Could not find map element for {task.route_key}")
            return None

    except Exception as e:
        logger.error(f"Error processing {task.route_key}: {str(e)}")
        return None


def generate_route_images():
    port = find_free_port()
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

    # Create tasks for all routes
    tasks = []
    for gpx_file in gpx_files:
        route_key = os.path.splitext(os.path.basename(gpx_file))[0]
        output_path = original_dir / args.output_dir / f"{route_key}.jpg"

        # Skip if image exists and we're in incremental mode
        if args.incremental and os.path.exists(output_path):
            gpx_modified = os.path.getmtime(gpx_file)
            img_modified = os.path.getmtime(output_path)
            if gpx_modified <= img_modified:
                if os.path.exists(output_path):
                    file_size_str = get_file_size_str(output_path)
                    logger.info(f"Skipping {route_key} (unchanged, current size: {file_size_str})")
                else:
                    logger.info(f"Skipping {route_key} (unchanged)")
                continue

        url = f"http://localhost:{port}/routes/{route_key}/"
        tasks.append(RouteTask(route_key, gpx_file, output_path, url))

    if not tasks:
        logger.info("No routes to process")
        return []

    # Process all tasks in parallel
    generated_images = []
    logger.info(f"Processing {len(tasks)} routes with {args.workers} workers")

    # Using ThreadPoolExecutor with thread-local storage for Playwright
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        # Submit all tasks
        future_to_task = {
            executor.submit(process_route, task, args.quality): task
            for task in tasks
        }

        # Process completed tasks
        for future in concurrent.futures.as_completed(future_to_task):
            task = future_to_task[future]
            try:
                output_path = future.result()
                if output_path:
                    generated_images.append(output_path)
            except Exception as e:
                logger.error(f"Exception processing {task.route_key}: {str(e)}")

    return generated_images


def cleanup_resources():
    """Cleanup function to ensure Playwright resources are properly released"""
    try:
        playwright_context.cleanup()
    except:
        pass

if __name__ == "__main__":
    try:
        start_time = time.time()
        generated_images = generate_route_images()
        elapsed_time = time.time() - start_time

        if generated_images:
            logger.info(f"Generated {len(generated_images)} OpenGraph images in {elapsed_time:.2f} seconds")
        else:
            logger.info(f"No new images generated in {elapsed_time:.2f} seconds")
    finally:
        # Make sure we clean up resources even if there's an exception
        cleanup_resources()
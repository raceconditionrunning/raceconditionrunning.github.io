#!/usr/bin/env python3
"""
Generate preview images for route maps using switchRoute function.
This script:
1. Finds all GPX route files
2. Starts a local HTTP server to serve the compiled site
3. Loads a single route page once
4. For each additional route, calls switchRoute() instead of loading new pages
5. Captures the map element as an image after each switch
6. Optimizes and saves to img/routes/[key].jpg
7. Retries failed routes up to max_retries times
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
from dataclasses import dataclass
from typing import List, Optional

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Parse arguments
parser = argparse.ArgumentParser(description='Generate preview images for routes using switchRoute')
parser.add_argument('--site-dir', type=pathlib.Path, default='_site', help='Path to the compiled site directory')
parser.add_argument('--gpx-dir', type=pathlib.Path, default='routes/_gpx', help='Path to the GPX files directory')
parser.add_argument('--output-dir', type=pathlib.Path, default='_site/img/routes', help='Path to save generated images')
parser.add_argument('--quality', type=int, default=85, help='JPEG quality (1-100)')
parser.add_argument('--port', type=int, default=0, help='Port for local server (0 = auto-select)')
parser.add_argument('--base-path', type=str, default='', help='Base path for serving content (e.g., __rcr__)')
parser.add_argument('--initial-route', type=str, help='Route key to load initially (if not specified, uses first route)')
parser.add_argument('--max-retries', type=int, default=2, help='Maximum number of retries for failed routes')
parser.add_argument('--specific-files', nargs='*', help='Process only these specific GPX files (used by manifest-based incremental system)')
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

def start_http_server(directory, port, base_path=''):
    """Start a local HTTP server in a separate thread"""
    os.chdir(directory)

    # Create a custom handler that can handle base path
    class BasePathHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
        def translate_path(self, path):
            """
            Translate request path to actual file path, handling base path if present
            """
            # Handle the root case first
            if path == '/':
                return super().translate_path('/')

            # Special case: If base_path is just '/', all paths are served from root
            if base_path == '/':
                return super().translate_path(path)

            # If base_path is specified and not empty
            if base_path:
                # Handle exact path match (with or without trailing slash)
                if path == f'/{base_path}' or path == f'/{base_path}/':
                    return super().translate_path('/')

                # Handle subpaths - make sure there's a / after base_path
                prefix = f'/{base_path}/'
                if path.startswith(prefix):
                    # Remove the base path prefix and provide the rest to the parent method
                    path = '/' + path[len(prefix):]

            # Use the standard translation method from parent class
            return super().translate_path(path)

        def log_message(self, format, *args):
            # Suppress server logs to avoid cluttering the output
            pass

    with socketserver.TCPServer(("", port), BasePathHTTPRequestHandler) as httpd:
        base_url = f"http://localhost:{port}"
        if base_path:
            logger.info(f"Started local server at {base_url}/{base_path}")
        else:
            logger.info(f"Started local server at {base_url}")
        httpd.serve_forever()

@dataclass
class RouteTask:
    route_key: str
    gpx_path: str
    output_path: pathlib.Path
    geojson_url: str

from playwright.sync_api import sync_playwright

def get_file_size_str(file_path):
    """Get human-readable file size"""
    size_bytes = os.path.getsize(file_path)
    if size_bytes < 1024:
        return f"{size_bytes} bytes"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.2f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.2f} MB"

def capture_route_image(page, route_key: str, output_path: pathlib.Path, quality: int) -> Optional[pathlib.Path]:
    """Capture the current map state as an image"""
    try:
        # Wait for the map to finish loading the new route
        page.wait_for_selector("#map.loading-complete", timeout=30000)

        # Add a small delay to ensure rendering is complete
        time.sleep(0.5)

        # Set preview mode
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
            image.save(output_path, "JPEG", quality=quality, optimize=True)

            # Get and log the file size
            file_size_bytes = os.path.getsize(output_path)
            file_size_str = get_file_size_str(output_path)
            logger.info(f"Saved preview image for {route_key} to {output_path} (Size: {file_size_str})")

            # Optional: Log a warning if file size is suspiciously small
            if file_size_bytes < 10000:  # Less than 10KB might indicate a problem
                logger.warning(f"WARNING: Image size for {route_key} is very small ({file_size_str}). Map may not have loaded properly!")

            return output_path
        else:
            logger.error(f"Could not find map element for {route_key}")
            return None

    except Exception as e:
        logger.error(f"Error capturing image for {route_key}: {str(e)}")
        return None

def switch_to_route(page, route_key: str, geojson_url: str) -> bool:
    """Switch to a new route using the switchRoute function"""
    try:
        logger.info(f"Switching to route {route_key}")

        # Remove loading-complete class to indicate we're loading a new route
        page.evaluate("""
            () => {
                const map = document.querySelector("#map");
                if (map) {
                    map.classList.remove("loading-complete");
                }
            }
        """)

        # Call switchRoute function
        result = page.evaluate(f"""
            () => {{
                if (typeof window.switchRoute === 'function') {{
                    window.switchRoute('{geojson_url}');
                    return true;
                }} else {{
                    console.error('switchRoute function not found');
                    return false;
                }}
            }}
        """)

        if not result:
            logger.error(f"switchRoute function not available for {route_key}")
            return False

        return True

    except Exception as e:
        logger.error(f"Error switching to route {route_key}: {str(e)}")
        return False

def process_route_with_retry(page, task: RouteTask, is_initial_route: bool = False, max_retries: int = 2) -> Optional[pathlib.Path]:
    """Process a single route with retry logic"""
    for attempt in range(max_retries + 1):
        try:
            # For the first route, we might already be on it
            if is_initial_route and attempt == 0:
                logger.info(f"Already on route {task.route_key}, capturing image")
            else:
                # Switch to the new route
                if not switch_to_route(page, task.route_key, task.geojson_url):
                    if attempt < max_retries:
                        logger.warning(f"Failed to switch to route {task.route_key} (attempt {attempt + 1}/{max_retries + 1}), retrying...")
                        time.sleep(2)  # Wait before retry
                        continue
                    else:
                        logger.error(f"Failed to switch to route {task.route_key} after {max_retries + 1} attempts")
                        return None

            # Capture the image
            output_path = capture_route_image(page, task.route_key, task.output_path, args.quality)
            if output_path:
                if attempt > 0:
                    logger.info(f"Successfully processed {task.route_key} on attempt {attempt + 1}")
                return output_path
            else:
                if attempt < max_retries:
                    logger.warning(f"Failed to capture image for {task.route_key} (attempt {attempt + 1}/{max_retries + 1}), retrying...")
                    time.sleep(2)  # Wait before retry
                    continue
                else:
                    logger.error(f"Failed to capture image for {task.route_key} after {max_retries + 1} attempts")
                    return None

        except Exception as e:
            if attempt < max_retries:
                logger.warning(f"Exception processing {task.route_key} (attempt {attempt + 1}/{max_retries + 1}): {str(e)}, retrying...")
                time.sleep(2)  # Wait before retry
                continue
            else:
                logger.error(f"Exception processing {task.route_key} after {max_retries + 1} attempts: {str(e)}")
                return None

    return None

def generate_route_images():
    port = find_free_port()
    original_dir = os.getcwd()

    base_path = args.base_path
    if base_path and base_path != '/':
        base_path = base_path.strip('/')

    # Start HTTP server in a separate thread
    server_thread = threading.Thread(
        target=start_http_server,
        args=(args.site_dir, port, base_path),
        daemon=True
    )
    server_thread.start()

    # Small delay to ensure server is up
    time.sleep(1)

    if args.specific_files:
        # Use specific files provided
        gpx_files = []
        for file_path in args.specific_files:
            if os.path.isabs(file_path):
                gpx_files.append(file_path)
            else:
                gpx_files.append(os.path.join(original_dir, file_path))

        # Filter to only existing files
        gpx_files = [f for f in gpx_files if os.path.exists(f) and f.endswith('.gpx')]
        logger.info(f"Processing {len(gpx_files)} specific GPX files")
    else:
        # Use all files in directory
        gpx_files = glob.glob(f"{original_dir}/{args.gpx_dir}/*.gpx")
        logger.info(f"Found {len(gpx_files)} GPX files")

    # Create tasks for all routes
    tasks = []
    for gpx_file in gpx_files:
        route_key = os.path.splitext(os.path.basename(gpx_file))[0]
        output_path = pathlib.Path(original_dir) / args.output_dir / f"{route_key}.jpg"

        # Construct the geojson URL for switchRoute
        if base_path == '/' or not base_path:
            geojson_url = f"/routes/geojson/{route_key}.geojson"
        else:
            geojson_url = f"/{base_path}/routes/geojson/{route_key}.geojson"

        tasks.append(RouteTask(route_key, gpx_file, output_path, geojson_url))

    if not tasks:
        logger.info("No routes to process")
        return []

    # Determine which route to load initially
    initial_route_key = args.initial_route
    if not initial_route_key and tasks:
        initial_route_key = tasks[0].route_key

    # Start Playwright
    generated_images = []
    failed_routes = []

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--disable-web-security",  # Disable CORS
                "--enable-webgl",
                "--ignore-certificate-errors",
                "--allow-insecure-localhost",
                "--enable-unsafe-webgl",
                "--enable-unsafe-swiftshader"
            ]
        )
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        page.on("console", lambda msg: logger.warning(f"Browser console: {msg.text}"))

        try:
            # Load the initial route page
            if base_path == '/' or not base_path:
                initial_url = f"http://localhost:{port}/routes/{initial_route_key}/"
            else:
                initial_url = f"http://localhost:{port}/{base_path}/routes/{initial_route_key}/"

            logger.info(f"Loading initial route page: {initial_url}")
            page.goto(initial_url, wait_until="networkidle", timeout=30000)
            page.wait_for_selector("#map.loading-complete", timeout=60000)

            logger.info(f"Processing {len(tasks)} routes using switchRoute (max retries: {args.max_retries})")

            # Process each route
            for i, task in enumerate(tasks):
                is_initial_route = (i == 0 and task.route_key == initial_route_key)
                output_path = process_route_with_retry(page, task, is_initial_route, args.max_retries)

                if output_path:
                    generated_images.append(output_path)
                else:
                    failed_routes.append(task.route_key)

        finally:
            browser.close()

    # Log summary of results
    if failed_routes:
        logger.warning(f"Failed to process {len(failed_routes)} routes after {args.max_retries + 1} attempts: {', '.join(failed_routes)}")

    # Write successful files to manifest for error handling
    if generated_images:
        successful_files = []
        for img_path in generated_images:
            route_key = img_path.stem  # Remove .jpg extension
            gpx_path = pathlib.Path(original_dir) / "routes" / "_gpx" / f"{route_key}.gpx"
            if gpx_path.exists():
                # Use relative path for portability
                relative_path = f"routes/_gpx/{route_key}.gpx"
                successful_files.append(relative_path)

        successful_files_path = pathlib.Path(original_dir) / '.route-preview-cache-successful-files'
        with open(successful_files_path, 'w') as f:
            for gpx_file in successful_files:
                f.write(f"{gpx_file}\n")

        logger.info(f"Wrote {len(successful_files)} successful files to .route-preview-cache-successful-files")

    return generated_images

if __name__ == "__main__":
    try:
        start_time = time.time()
        generated_images = generate_route_images()
        elapsed_time = time.time() - start_time

        if generated_images:
            logger.info(f"Generated {len(generated_images)} preview images in {elapsed_time:.2f} seconds")
        else:
            logger.info(f"No new images generated in {elapsed_time:.2f} seconds")
    except Exception as e:
        logger.error(f"Script failed: {str(e)}")
        raise
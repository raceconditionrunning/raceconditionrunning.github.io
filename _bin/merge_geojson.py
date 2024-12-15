import sys


def main():
    if len(sys.argv) < 3:
        print("Usage: merge_geojson.py <geojson1> <geojson2> ... <output.geojson>")
        sys.exit(1)
    inpaths = sys.argv[1:-1]
    outputh = sys.argv[-1]

    # generate a merged geojson of all routes
    all_geojsons = []
    for inpath in inpaths:
        with open(inpath) as f:
            all_geojsons.append(''.join(f.readlines()))

    with open(outputh, 'w') as f:
        f.write('{"type": "FeatureCollection", "features": [\n')
        for i, geojson in enumerate(all_geojsons):
            f.write(geojson)
            if i < len(all_geojsons) - 1:
                f.write(',\n')
            else:
                f.write('\n')
        f.write("]}")


if __name__ == '__main__':
    main()

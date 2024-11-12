# King County Metro: https://www.soundtransit.org/GTFS-KCM/google_transit.zip
# Pierce: https://www.soundtransit.org/GTFS-PT/gtfs.zip
# Intercity: https://gtfs.sound.obaweb.org/prod/19_gtfs.zip
# Community Transit: https://www.soundtransit.org/GTFS-CT/current.zip
# Sound Transit: https://www.soundtransit.org/GTFS-rail/40_gtfs.zip
# Washington State Ferries: https://gtfs.sound.obaweb.org/prod/95_gtfs.zip
# Seattle Center Monorail: https://gtfs.sound.obaweb.org/prod/96_gtfs.zip
# Everett Transit: https://gtfs.sound.obaweb.org/prod/97_gtfs.zip
# https://gtfs.sound.obaweb.org/prod/gtfs_puget_sound_consolidated.zip

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

LIGHT_RAIL_PATH=https://www.soundtransit.org/GTFS-rail/40_gtfs.zip
BUS_PATH=https://www.soundtransit.org/GTFS-KCM/google_transit.zip
FERRY_PATH=https://gtfs.sound.obaweb.org/prod/95_gtfs.zip

mkdir -p $SCRIPT_DIR/tmp/

wget -c $BUS_PATH -O $SCRIPT_DIR/tmp/bus.zip
unzip $SCRIPT_DIR/tmp/bus.zip $SCRIPT_DIR/tmp/bus
mv $SCRIPT_DIR/tmp/bus/stops.txt $SCRIPT_DIR/seattle_transit_data/bus.csv

wget -c $LIGHT_RAIL_PATH -O $SCRIPT_DIR/tmp/light_rail.zip
unzip $SCRIPT_DIR/tmp/light_rail.zip $SCRIPT_DIR/tmp/light_rail
mv $SCRIPT_DIR/tmp/light_rail/stops.txt $SCRIPT_DIR/seattle_transit_data/light_rail.csv

rm -rf $SCRIPT_DIR/tmp/
python $SCRIPT_DIR/extract_locs_info.py
python $SCRIPT_DIR/extract_routes_info.py
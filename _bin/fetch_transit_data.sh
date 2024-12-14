set -xe
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

mkdir -p $SCRIPT_DIR/tmp/ $SCRIPT_DIR/../routes/transit_data/

wget -c $FERRY_PATH -O $SCRIPT_DIR/tmp/ferry.zip
unzip -o $SCRIPT_DIR/tmp/ferry.zip -d $SCRIPT_DIR/tmp/ferry
mv $SCRIPT_DIR/tmp/ferry/stops.txt $SCRIPT_DIR/../routes/transit_data/ferry.csv

wget -c $BUS_PATH -O $SCRIPT_DIR/tmp/bus.zip
unzip -o $SCRIPT_DIR/tmp/bus.zip -d $SCRIPT_DIR/tmp/bus
mv $SCRIPT_DIR/tmp/bus/stops.txt $SCRIPT_DIR/../routes/transit_data/bus.csv

wget -c $LIGHT_RAIL_PATH -O $SCRIPT_DIR/tmp/light_rail.zip
unzip -o $SCRIPT_DIR/tmp/light_rail.zip -d $SCRIPT_DIR/tmp/light_rail
mv $SCRIPT_DIR/tmp/light_rail/stops.txt $SCRIPT_DIR/../routes/transit_data/light_rail.csv

rm -rf $SCRIPT_DIR/tmp/
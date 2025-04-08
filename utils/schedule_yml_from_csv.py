import pandas
import yaml
import argparse

URL_PREFIX = "https://raceconditionrunning.com/routes/"

def schedule_csv_to_yml(csv_file, yaml_file):
    df = pandas.read_csv(csv_file)
    df['date'] = pandas.to_datetime(df['Date']).dt.strftime('%Y-%m-%d')
    out_rows = []
    for _, row in df.iterrows():
        print(row["date"])
        if row['date'] and not pandas.isnull(row['date']):
            new_week = {
                'date': row['date'],
                'plan': []
            }
            out_rows.append(new_week)
        else:
            leg_dict = {
                'time': row['Time'],
            }
            if URL_PREFIX in str(row["URL"]):
                leg_dict['route_id'] = str(row["URL"]).replace(URL_PREFIX, "")
            else:
                leg_dict['route'] = {'route_name': row['URL']}
            out_rows[-1]['plan'].append(leg_dict)
    out_df = pandas.DataFrame(out_rows)

    with open(yaml_file, 'w') as outfile:
        yaml.dump(
            # out_df.to_dict(orient='records'),
            out_rows,
            outfile,
            sort_keys=False,
            width=72,
            indent=4
    )

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv_file", type=str, required=True, help="Path to the input CSV file")
    parser.add_argument("--yaml_file", type=str, required=True, help="Path to the output YAML file")
    args = parser.parse_args()
    schedule_csv_to_yml(args.csv_file, args.yaml_file)
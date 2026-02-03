import glob
import os
import pandas as pd
from pathlib import Path

# Configuration
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
HEALTH_DIR = BASE_DIR / "health"

HR_PATTERN = str(HEALTH_DIR / "Health Sync Heart rate" / "*.csv")
STEPS_PATTERN = str(HEALTH_DIR / "Health Sync Steps" / "*.csv")
ACTIVITIES_PATTERN = str(HEALTH_DIR / "Health Sync Activities" / "*.csv")

def merge_csvs(pattern, output_filename, type_name):
    print(f"Finding {type_name} files...")
    files = glob.glob(pattern)
    print(f"Found {len(files)} files.")

    dfs = []
    for f in files:
        try:
            df = pd.read_csv(f)
            dfs.append(df)
        except Exception as e:
            print(f"Error reading {f}: {e}")

    if not dfs:
        print(f"No data found for {type_name}.")
        return

    print(f"Merging {type_name} data...")
    merged_df = pd.concat(dfs, ignore_index=True)
    
    # Normalize column names slightly (strip whitespace)
    merged_df.columns = [c.strip() for c in merged_df.columns]

    # Normalize Date column if it exists
    if 'Date' in merged_df.columns:
        print("Normalizing dates...")
        # Handle dot notation (e.g. 2024.12.30)
        merged_df['Date'] = merged_df['Date'].astype(str).str.replace('.', '-')
        # Parse dates (allow fuzzy for mixed formats)
        merged_df['Date'] = pd.to_datetime(merged_df['Date'], errors='coerce')
    
    # Normalize Time column if it exists (replace dots with colons)
    if 'Time' in merged_df.columns:
        print("Normalizing times...")
        merged_df['Time'] = merged_df['Time'].astype(str).str.replace('.', ':')

    # Deduplicate based on Date and Time if they exist
    if 'Date' in merged_df.columns and 'Time' in merged_df.columns:
        print("Deduplicating...")
        merged_df.drop_duplicates(subset=['Date', 'Time'], inplace=True)
        
        # Sort (ensure columns are sortable)
        print("Sorting...")
        try:
            merged_df.sort_values(by=['Date', 'Time'], inplace=True)
        except Exception as e:
            print(f"Warning: Could not sort by Date/Time: {e}")

    output_path = DATA_DIR / output_filename
    print(f"Saving to {output_path}...")
    merged_df.to_csv(output_path, index=False)
    print(f"Saved {len(merged_df)} rows.")

def main():
    print("Starting data merge...")
    
    # Merge Heart Rate
    merge_csvs(HR_PATTERN, "hr.csv", "Heart Rate")
    
    # Merge Steps
    merge_csvs(STEPS_PATTERN, "steps.csv", "Steps")

    # Merge Activities
    merge_csvs(ACTIVITIES_PATTERN, "activities.csv", "Activities")
    
    print("Done!")

if __name__ == "__main__":
    main()

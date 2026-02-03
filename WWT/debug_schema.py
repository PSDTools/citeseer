import duckdb

conn = duckdb.connect("data/analytics.duckdb")
tables = ["hr", "steps", "activities"]

for t in tables:
    try:
        print(f"--- Schema for {t} ---")
        print(conn.execute(f"DESCRIBE {t}").fetchdf())
        print("\n")
        
        # Sample date values
        print(f"--- Sample Date values for {t} ---")
        print(conn.execute(f"SELECT Date FROM {t} LIMIT 5").fetchdf())
        print("\n")
    except Exception as e:
        print(f"Error checking {t}: {e}")

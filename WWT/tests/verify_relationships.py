import os
from src.ingestion.profiler import profile_tables, generate_schema_context, detect_relationships

def test_relationship_discovery():
    print("Testing Relationship Discovery...")
    
    # Use the real data files in ./data
    db_path = "data/analytics.duckdb"
    
    # 1. Profile Tables
    print("1. Profiling tables...")
    profiles = profile_tables(db_path)
    
    # 2. Detect Relationships
    print("2. Detecting relationships...")
    relationships = detect_relationships(profiles)
    
    found_event_shipment_link = False
    
    for rel in relationships:
        print(f"   Found: {rel.source_table}.{rel.source_column} -> {rel.target_table}.{rel.target_column} ({rel.type})")
        
        if (rel.source_table == "events" and 
            rel.source_column == "entity_id" and 
            rel.target_table == "shipments" and 
            rel.type == "polymorphic"):
            found_event_shipment_link = True
            
    if found_event_shipment_link:
        print("   ✅ SUCCESS: Automatically discovered 'events' -> 'shipments' polymorphic link.")
    else:
        print("   ❌ FAILURE: Did not find 'events' -> 'shipments' link.")
        exit(1)

    # 3. Generate Schema Context
    print("3. Generating Schema Context...")
    context = generate_schema_context(profiles)
    
    if "@rel{from:\"events.entity_id\" to:\"shipments.id\" type:polymorphic}" in context:
         print("   ✅ SUCCESS: Relationship included in schema context string.")
    else:
         print("   ❌ FAILURE: Relationship missing from schema context string.")
         print(context)
         exit(1)

if __name__ == "__main__":
    test_relationship_discovery()

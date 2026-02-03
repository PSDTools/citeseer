"""Generate sample CSV data for the analytics platform."""

import csv
import random
from datetime import datetime, timedelta
from pathlib import Path

# Seed for reproducibility
random.seed(42)

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# Configuration
ORIGINS = ["Los Angeles", "Chicago", "Houston", "New York", "Seattle", "Miami", "Atlanta"]
DESTINATIONS = ["Boston", "Denver", "Phoenix", "Detroit", "Portland", "Dallas", "Minneapolis"]
CARRIERS = ["FastFreight", "QuickShip", "ReliableLogistics", "ExpressHaul", "PrimeTransit"]
STATUSES = ["delivered", "in_transit", "delayed", "cancelled"]
LOCATIONS = ["Warehouse-A", "Warehouse-B", "Warehouse-C", "Distribution-Center-1", "Distribution-Center-2"]
SKUS = [f"SKU-{i:04d}" for i in range(1, 101)]
EVENT_TYPES = ["shipment_created", "shipment_departed", "shipment_arrived", "delay_reported",
               "inventory_updated", "inventory_low", "carrier_assigned", "customs_cleared"]

# Delay patterns: certain origins/carriers have higher delay rates
DELAY_PRONE_ORIGINS = {"Houston": 0.35, "Miami": 0.30, "Chicago": 0.20}
DELAY_PRONE_CARRIERS = {"QuickShip": 0.40, "ExpressHaul": 0.25}


def generate_shipments(n: int = 1000) -> list[dict]:
    """Generate shipment records with realistic delay patterns."""
    shipments = []
    base_date = datetime(2024, 1, 1)

    for i in range(1, n + 1):
        origin = random.choice(ORIGINS)
        destination = random.choice(DESTINATIONS)
        carrier = random.choice(CARRIERS)

        # Calculate delay probability based on origin and carrier
        delay_prob = 0.10  # Base delay rate
        delay_prob += DELAY_PRONE_ORIGINS.get(origin, 0)
        delay_prob += DELAY_PRONE_CARRIERS.get(carrier, 0)
        delay_prob = min(delay_prob, 0.60)  # Cap at 60%

        # Determine status
        rand = random.random()
        if rand < delay_prob * 0.7:
            status = "delayed"
        elif rand < delay_prob:
            status = "cancelled"
        elif rand < 0.85:
            status = "delivered"
        else:
            status = "in_transit"

        # Generate dates
        ship_date = base_date + timedelta(days=random.randint(0, 365))
        expected_days = random.randint(2, 7)

        if status == "delivered":
            actual_days = expected_days + random.randint(-1, 2)
            deliver_date = ship_date + timedelta(days=max(1, actual_days))
        elif status == "delayed":
            actual_days = expected_days + random.randint(3, 10)
            deliver_date = ship_date + timedelta(days=actual_days)
        else:
            deliver_date = None

        shipments.append({
            "id": f"SHP-{i:06d}",
            "origin": origin,
            "destination": destination,
            "carrier": carrier,
            "status": status,
            "ship_date": ship_date.strftime("%Y-%m-%d"),
            "deliver_date": deliver_date.strftime("%Y-%m-%d") if deliver_date else "",
            "weight_kg": round(random.uniform(10, 5000), 2),
            "value_usd": round(random.uniform(100, 50000), 2),
        })

    return shipments


def generate_inventory(n: int = 500) -> list[dict]:
    """Generate inventory records."""
    inventory = []
    base_date = datetime(2024, 6, 1)

    for i in range(n):
        location = random.choice(LOCATIONS)
        sku = random.choice(SKUS)

        # Some SKUs have low stock
        if random.random() < 0.15:
            quantity = random.randint(0, 20)
        else:
            quantity = random.randint(50, 1000)

        last_updated = base_date + timedelta(
            days=random.randint(0, 180),
            hours=random.randint(0, 23),
            minutes=random.randint(0, 59)
        )

        inventory.append({
            "id": f"INV-{i+1:06d}",
            "location": location,
            "sku": sku,
            "quantity": quantity,
            "reorder_point": random.randint(20, 100),
            "last_updated": last_updated.strftime("%Y-%m-%d %H:%M:%S"),
        })

    return inventory


def generate_events(n: int = 2000) -> list[dict]:
    """Generate event log records."""
    events = []
    base_date = datetime(2024, 1, 1)

    for i in range(n):
        event_type = random.choice(EVENT_TYPES)

        # Determine entity type based on event
        if event_type.startswith("shipment") or event_type in ["delay_reported", "carrier_assigned", "customs_cleared"]:
            entity_type = "shipment"
            entity_id = f"SHP-{random.randint(1, 1000):06d}"
        else:
            entity_type = "inventory"
            entity_id = f"INV-{random.randint(1, 500):06d}"

        timestamp = base_date + timedelta(
            days=random.randint(0, 365),
            hours=random.randint(0, 23),
            minutes=random.randint(0, 59),
            seconds=random.randint(0, 59)
        )

        # Generate relevant details
        if event_type == "delay_reported":
            details = random.choice([
                "Weather delay - severe storms",
                "Customs hold - documentation issue",
                "Carrier capacity issue",
                "Traffic congestion",
                "Vehicle breakdown",
                "Port congestion",
            ])
        elif event_type == "inventory_low":
            details = f"Stock below reorder point"
        elif event_type == "carrier_assigned":
            details = f"Assigned to {random.choice(CARRIERS)}"
        else:
            details = ""

        events.append({
            "id": f"EVT-{i+1:06d}",
            "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            "entity_type": entity_type,
            "entity_id": entity_id,
            "event_type": event_type,
            "details": details,
        })

    # Sort by timestamp
    events.sort(key=lambda x: x["timestamp"])

    return events


def write_csv(filename: str, data: list[dict]):
    """Write data to CSV file."""
    if not data:
        return

    filepath = DATA_DIR / filename
    with open(filepath, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)

    print(f"Written {len(data)} rows to {filepath}")


def main():
    """Generate all sample data files."""
    print("Generating sample data...")

    shipments = generate_shipments(1000)
    write_csv("shipments.csv", shipments)

    inventory = generate_inventory(500)
    write_csv("inventory.csv", inventory)

    events = generate_events(2000)
    write_csv("events.csv", events)

    print("Done!")

    # Print summary stats
    delayed = sum(1 for s in shipments if s["status"] == "delayed")
    print(f"\nShipment stats: {delayed} delayed out of {len(shipments)} ({delayed/len(shipments)*100:.1f}%)")

    low_stock = sum(1 for i in inventory if i["quantity"] < i["reorder_point"])
    print(f"Inventory stats: {low_stock} items below reorder point")


if __name__ == "__main__":
    main()

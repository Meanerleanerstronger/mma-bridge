import json

# STEP 3: load fighters.json
with open("fighters.json", "r") as f:
    fighters = json.load(f)

print("fighters loaded:", len(fighters))


# STEP 4: search function (PUT THIS BELOW THE LOAD CODE)
def search_fighter(query):
    query = query.lower().strip()
    results = []

    for fighter in fighters:
        if query in fighter["name"].lower():
            results.append(fighter)

    return results

def search_by_weight(weight):
    weight = weight.lower().strip()
    results = []

    for fighter in fighters:
        if fighter["weight"].lower() == weight:
            results.append(fighter)

    return results

def top_fighters_by_wins(limit=5):
    sorted_fighters = sorted(
        fighters,
        key=lambda f: f["wins"],
        reverse=True
    )
    return sorted_fighters[:limit]

def write_top_fighters_json(filename="../data/top_fighters.json", limit=10):
    top = top_fighters_by_wins(limit)
    with open(filename, "w") as f:
        json.dump(top, f, indent=2)
    print("wrote:", filename)






# STEP 5: test + nicer output (PUT THIS AT THE VERY BOTTOM)
top = top_fighters_by_wins(3)

for f in top:
    print(f"{f['name']} | Wins: {f['wins']}")

write_top_fighters_json(limit=3)

import json, csv, zipfile
import pandas as pd
from collections import defaultdict, deque
from io import TextIOWrapper
import bisect

city = "boston"
filepath = f"../rawdata/{city}.zip"
jsonpath = f"../processeddata/{city}.json"

defaultroutecolor="BDBDBD"

gtfs_data = dict()
necessary_files = ("stops.txt", "stop_times.txt", "routes.txt", "trips.txt", "calendar.txt", "shapes.txt")

with zipfile.ZipFile(filepath) as gtfs_zip:
  try:
    gtfs_zip.getinfo("frequencies.txt")
  except KeyError:
    pass
  else:
    raise NotImplementedError("frequency based schedules not supported")
  for filename in necessary_files:
    with gtfs_zip.open(filename) as tmp_csv:
      gtfs_data[filename] = pd.read_csv(tmp_csv)
    print(f"read in {filename}")

def convert_time(str_time):
  ret = 0
  for chunk in str_time.split(":"):
    ret *= 60
    ret += int(chunk)
  return ret

centroid = [gtfs_data["stops.txt"]["stop_lon"].mean(), gtfs_data["stops.txt"]["stop_lat"].mean()]
print("calculated centroid")


shapes_points = defaultdict(dict)
for row in gtfs_data["shapes.txt"].to_dict(orient="records"):
  shapes_points[row["shape_id"]][row["shape_pt_sequence"]] = ((row["shape_pt_lon"],row["shape_pt_lat"]), row["shape_dist_traveled"])
print(f"processed {len(gtfs_data['shapes.txt'])} shape points")

shapes = dict()
for shape_id in shapes_points:
  shapes[shape_id] = {"pt_coords":[], "pt_dists":[]}
  for sortingorder, data in sorted(shapes_points[shape_id].items()):
    shapes[shape_id]["pt_coords"].extend(data[0])
    shapes[shape_id]["pt_dists"].append(data[1])
print(f"processed {len(shapes)} shapes")

routes = dict()
for row in gtfs_data["routes.txt"].to_dict(orient="records"):
  route = dict()
  routes[row["route_id"]] = route

  # prefer long name
  if "route_long_name" not in row or pd.isna(row["route_long_name"]) or row["route_long_name"] == "":
    name = row["route_short_name"]
  else:
    name = row["route_long_name"]
  route["name"] = name
  
  vehicletype = row["route_type"]
  if vehicletype == 3 or vehicletype == 11:
    route["vehicle_type"] = "bus"
  elif vehicletype < 3 or vehicletype == 5 or vehicletype == 7 or vehicletype == 12:
    route["vehicle_type"] = "train"
  elif vehicletype == 4:
    route["vehicle_type"] = "boat"
  else:
    raise NotImplementedError("unsupported transit type")

  if pd.isna(row["route_url"]):
    route["url"] = ""
  else:
    route["url"] = row["route_url"]
  route["color"] = row["route_color"]
  route["text_color"] = row["route_text_color"]
print(f"processed {len(routes)} routes")

services = dict()
for row in gtfs_data["calendar.txt"].itertuples(index=False):
  services[row[0]] = (row[7],)+row[1:7]
print(f"processed {len(services)} weekly schedules")

gtfs_data["stop_times.txt"]["shape_dist_traveled"] = pd.to_numeric(gtfs_data["stop_times.txt"]["shape_dist_traveled"]).fillna(0)
stop_times_points = defaultdict(dict)
for row in gtfs_data["stop_times.txt"].to_dict(orient="records"):
  curstop = dict()
  stop_times_points[row["trip_id"]][row["stop_sequence"]] = curstop
  curstop["arrival_time"] = convert_time(row["arrival_time"])
  curstop["departure_time"] = convert_time(row["departure_time"])
  curstop["shape_dist_traveled"] = row["shape_dist_traveled"]
  
stop_times = dict()
for trip_id, data in stop_times_points.items():
  stop_times[trip_id] = {"arrival_relative":[], "departure_relative":[], "dists_traveled":[]}
  mintime = None
  for k, v in sorted(data.items()):
    if mintime is None:
      mintime = v["arrival_time"]
      stop_times[trip_id]["begin_abs"] = mintime
    stop_times[trip_id]["arrival_relative"].append(v["arrival_time"]-mintime)
    stop_times[trip_id]["departure_relative"].append(v["departure_time"]-mintime)
    stop_times[trip_id]["dists_traveled"].append(v["shape_dist_traveled"])
  stop_times[trip_id]["end_abs"] = v["departure_time"]
print(f"processed {len(gtfs_data['stop_times.txt'])} stop times")

def lerp_latlon(point1, point2, dist_along_shape):
  point1x, point1y = point1["coords"]
  point2x, point2y = point2["coords"]
  point1weight = (dist_along_shape - point1["dist"])/(point2["dist"]-point1["dist"])
  point2weight = 1.0 - point1weight
  return ((point1x*point1weight+point2x*point2weight), (point1y*point1weight+point2y*point2weight))

trips = []
skipcount = 0
nodays = 0
shapecolors = defaultdict(set)
for row in gtfs_data["trips.txt"].to_dict(orient="records"):
  if row["service_id"] not in services:
    skipcount += 1
    continue
  trip = dict()
  if not any(services[row["service_id"]]):
    nodays += 1
    continue
  trips.append(trip)
  trip["schedule_id"] = row["service_id"]
  trip["route_id"] = row["route_id"]
  trip["headsign"] = row["trip_headsign"]
  trip["stops"] = stop_times[row["trip_id"]]
  trip["begin_abs"] = trip["stops"]["begin_abs"]
  trip["end_abs"] = trip["stops"]["end_abs"]
  del trip["stops"]["begin_abs"]
  del trip["stops"]["end_abs"]
  trip["shape_id"] = row["shape_id"]
  shapecolors[row["shape_id"]].add(
    routes[row["route_id"]]["color"]
  )
print(f"added {len(trips)} trips, skipped {nodays} because irregular schedule, skipped {skipcount} because not in calendar.txt")

for shape_id, actual_shape in shapes.items():
  if len(shapecolors[shape_id]) != 1:
    actual_shape["color"] = defaultroutecolor
  else:
    actual_shape["color"] = shapecolors[shape_id].pop()
print("gave all shapes colors")

print("serializing json...")
with open(jsonpath, mode="w") as outfile:
  json.dump({
    "shapes":shapes,
    "routes":routes,
    "trips":trips,
    "city":city,
    "centroid": centroid,
    "schedules":services
  }, outfile, allow_nan=False, separators=(',', ':'))
print(f"done, saved to {jsonpath}")
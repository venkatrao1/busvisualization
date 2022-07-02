'use strict';

var gtfs_json = null;
var old_date = null;
var trips_today = null;
var trips_rn = null;

const MS_PER_FRAME = 50; // TODO: get it down to 16 through optimization
const FADE_TIME_SECONDS = 3;
const SECONDS_PER_DAY = 86400;

function handleMessage(msg){
  self.gtfs_json = msg.data;
  setInterval(animate, MS_PER_FRAME);
}

function animate(){
  const new_date = curtime();
  const dayOfWeek = new_date.getDay();
  const secondOfDay = (new_date.getHours()*3600)+(new_date.getMinutes()*60)+new_date.getSeconds()+(new_date.getMilliseconds()/1000);
  const yesterday = (dayOfWeek||7)-1;
  const date_changed = !old_date || (old_date.getDay() != dayOfWeek);
  const minute_changed = !old_date || (old_date.getMinutes() != new_date.getMinutes());
  old_date = new_date;

  if(date_changed){
    console.debug("started filtering trips for today");
    const new_trips_today = gtfs_json.trips.filter(
      trip => (gtfs_json.schedules[trip.schedule_id][dayOfWeek])
    );
    const trips_from_yesterday = gtfs_json.trips.filter(
      trip => (gtfs_json.schedules[trip.schedule_id][yesterday]) && (trip.end_abs > SECONDS_PER_DAY)
    );
    // adjust trips from yesterday to be 24 hours back
    trips_today = new_trips_today.concat(trips_from_yesterday.map(
      (yest_trip) => {
        const ret = Object.assign({}, yest_trip);
        ret.begin_abs -= SECONDS_PER_DAY;
        ret.end_abs -= SECONDS_PER_DAY;
        return ret;
      }
    ));
    console.debug(trips_today.length+" trips today");
  }

  if(minute_changed){
    trips_rn = trips_today.filter((trip)=>(trip.begin_abs-FADE_TIME_SECONDS <= secondOfDay+60) && (trip.end_abs+FADE_TIME_SECONDS >= secondOfDay));
    console.debug(trips_rn.length +" trips this minute");
  }

  const msg = trips_rn.map((trip)=>{
    // we need: position, angle, color/opacity, icon name, tooltip?
    const route = gtfs_json.routes[trip.route_id];
    const stops = trip.stops;
    const ret = {
      vehicle_type: route.vehicle_type,
      color: getShapeColor(route),
      tooltip: route.name + ": " + trip.headsign
    };

    let distAlongShape;
    let opacity = 255; // default, will apply to 99% of trips anyway
    if(secondOfDay<trip.begin_abs){
      opacity = Math.floor(255*(trip.begin_abs-secondOfDay)/FADE_TIME_SECONDS); 
      distAlongShape = stops.dists_traveled[0];
    }
    else if(secondOfDay>trip.end_abs){
      opacity = Math.floor(255*(secondOfDay-trip.end_abs)/FADE_TIME_SECONDS);
      distAlongShape = stops.dists_traveled[stops.dists_traveled.length-1];
    }
    else{
      // interpolate dist along shape
      const relativeTime = secondOfDay - trip.begin_abs;
      const ind = segBinarySearch(stops.arrival_relative, relativeTime);
      if(relativeTime > stops.departure_relative[ind]){
        // TODO: acceleration?
        distAlongShape = lerp(
          stops.departure_relative[ind], stops.dists_traveled[ind],
          stops.arrival_relative[ind+1], stops.dists_traveled[ind+1],
          relativeTime
        ); // TODO: buses jump to their next stop, is this line why?
      }
      else distAlongShape = stops.dists_traveled[ind];
    }

    const shape = gtfs_json.shapes[trip.shape_id];
    const ind = segBinarySearch(shape.pt_dists, distAlongShape);
    const coordInd = ind << 1; // the coordinates are packed into lon,lat array
    // interpolate position and infer orientation from cur segment
    ret.lonlat = [
      lerp(
        shape.pt_dists[ind], shape.pt_coords[coordInd],
        shape.pt_dists[ind+1], shape.pt_coords[coordInd+2],
        distAlongShape
      ),
      lerp(
        shape.pt_dists[ind], shape.pt_coords[coordInd+1],
        shape.pt_dists[ind+1], shape.pt_coords[coordInd+3],
        distAlongShape
      )
    ];
    ret.orientation = Math.atan2(shape.pt_coords[coordInd+2]-shape.pt_coords[coordInd], shape.pt_coords[coordInd+3]-shape.pt_coords[coordInd+1]) * -180/Math.PI;
    ret.color.push(opacity);
    return ret;
  });

  postMessage(msg);
}

const curtime = () => new Date(); // in global namespace so easy to allow spoofing date

// NOTE: the below function is not a general binary search.
// I use it to find the index in the shape of which segment we should be on. always returns an index from 0 to len-2.
// arr[i] <= val, arr[i+1] >= val
function segBinarySearch(arr, val){
  let l = 0;
  let r = arr.length-2;
  while(l<r){
    const m = (l+r+1)>>1;
    const cand = arr[m];
    if(val==cand) return m;
    else if(val < cand) r = m-1;
    else l=m;
  }
  return l;
}

function lerp(x1, y1, x2, y2, x3){ // find y3
  return y1 + ((y2-y1)*(x3-x1)/(x2-x1));
}

function getShapeColor(shape){
  return shape.color.match(/.{1,2}/g).map(h => parseInt(h, 16));
}

addEventListener('message', handleMessage);
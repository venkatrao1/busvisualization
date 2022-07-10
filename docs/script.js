'use strict';

var gtfsworker = null;

const ICON_MAPPING = {
  marker: {x: 0, y: 0, width: 128, height: 128, mask: true}
};

function gotJSON(gtfs_json){
  self.gtfs_json = gtfs_json;
  self.routeLayer = new deck.PathLayer({
    id:"route-layer",
    data: Object.values(gtfs_json.shapes),
    getPath: v => v.pt_coords,
    positionFormat: "XY",
    widthMinPixels:1,
    widthScale:5,
    jointRounded: true,
    getColor: getShapeColor,
    parameters: {depthTest:false, blend:false},
    opacity: 0.2,
    pickable: false
  });
  self.deckgl = new deck.DeckGL({
    initialViewState: {
      latitude: gtfs_json.centroid[1],
      longitude: gtfs_json.centroid[0],
      zoom: 12,
      pitch: 0,
      bearing: 0
    }, 
    controller:{
      dragRotate:false,
      touchRotate:false,
      keyboard:false
    },
    mapboxApiAccessToken: "pk.eyJ1IjoidmVua2F0cmFvMSIsImEiOiJjbDR6eG15a2gzNjBqM3Buc2U4emlmenRiIn0.0OgClKY8zHVpuJsCFVtRMQ",
    mapStyle: "mapbox://styles/venkatrao1/cl5fm4vew001t15o5izxe2jxs",
    getTooltip: ({object}) => (object && object.tooltip),
    layers:[
      routeLayer
    ]
  });
  if(!self.gtfsworker){
    self.gtfsworker = new Worker("./gtfsworker.js");
    gtfsworker.onmessage = handleWorkerMessage;
    gtfsworker.postMessage(gtfs_json);
  }
}

function getShapeColor(shape){
  return shape.color.match(/.{1,2}/g).map(h => parseInt(h, 16));
}

function handleWorkerMessage(msg){
  self.vehicleLayer = new deck.IconLayer({
    id: 'vehicle-layer',
    data: msg.data,
    pickable: true,
    iconAtlas: 'bus.png',
    iconMapping: ICON_MAPPING,
    getIcon: d => 'marker',
    sizeUnits: "meters",
    getSize: 20,
    sizeMinPixels: 10,
    getPosition: d => d.lonlat,
    getColor: d => d.color,
    getAngle: d => d.orientation,
  });
  deckgl.setProps({layers:[routeLayer, vehicleLayer]});
}

$.ajax({
  url: "data/houston.json",
  dataType: "json",
  success: gotJSON
});


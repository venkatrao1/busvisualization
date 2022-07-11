'use strict';

var gtfsworker = null;
var tooltips = null;
var map = null;

// TODO: add train icon (and maybe boat)
const ICON_MAPPING = {
  marker: {x: 0, y: 0, width: 128, height: 128, mask: true}
};

function gotJSON(gtfs_json){
  map = new mapboxgl.Map({
    container:"main-map",
    accessToken: "pk.eyJ1IjoidmVua2F0cmFvMSIsImEiOiJjbDR6eG15a2gzNjBqM3Buc2U4emlmenRiIn0.0OgClKY8zHVpuJsCFVtRMQ",
    center: gtfs_json.centroid,
    doubleClickZoom: false,
    dragRotate: false,
    keyboard: false,
    style: "mapbox://styles/venkatrao1/cl5fm4vew001t15o5izxe2jxs",
    touchPitch: false,
    touchZoomRotate:false,
    zoom:12
  });
  // use DeckOverlay
  self.routeLayer = new deck.PathLayer({
    id:"route-layer",
    data: Object.values(gtfs_json.shapes),
    getPath: v => v.pt_coords,
    positionFormat: "XY",
    widthMinPixels:1,
    widthScale:10,
    jointRounded: true,
    capRounded: true,
    getColor: getShapeColor,
    parameters: {depthTest:false, blend:false},
    opacity: 0.2,
    pickable: false
  });

  self.deckGLOverlay = new deck.MapboxOverlay({
    layers: [ routeLayer ],
    getTooltip: ({index}) => (index && tooltips && tooltips[index])
  });

  map.addControl(deckGLOverlay);
  map.addControl(new mapboxgl.NavigationControl({
    showCompass: false,
    showZoom: true
  }), "top-right");

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
  const bindata = msg.data;
  tooltips = bindata.tooltip;
  const vehicleLayer = new deck.IconLayer({
    id: 'vehicle-layer',
    data: {
      length: bindata.vehicle_type.length,
      attributes: {
        getPosition: {value: bindata.lonlat, size:2},
        getColor: {value:bindata.color, size:4},
        getAngle: {value:bindata.orientation, size:1},
      }
    },
    pickable: true,
    iconAtlas: 'bus.png',
    iconMapping: ICON_MAPPING,
    getIcon: idx => 'marker',
    sizeUnits: "meters",
    getSize: 40,
    sizeMinPixels: 10,
  });
  deckGLOverlay.setProps({layers:[routeLayer, vehicleLayer]});
}

$.ajax({
  url: "data/houston.json",
  dataType: "json",
  success: gotJSON
});
'use strict';

var gtfsworker = null;
var tooltips = null;
var map = null;

// TODO: add train icon (and maybe boat)
const urlSearchParams = new URLSearchParams(window.location.search);
const ICON_MAPPING = {
  marker: {x: 0, y: 0, width: 128, height: 128, mask: true}
};
const THEMES = {
  "light": { url:"mapbox://styles/venkatrao1/cl5fm4vew001t15o5izxe2jxs" },
  "dark": { 
    url:"mapbox://styles/venkatrao1/cl5fmve75002q15l7mhltuikw",
    routeOpacity: 0.00001
  },
  "blueprint": { 
    url: "mapbox://styles/venkatrao1/cl5g3nn1k001u15qvhowga8ww",
    forceBusColor: "000000", // I should fix this
    renderRoutes: false,
    forceBusSize: 60
  },
  "streets": {
    url: "mapbox://styles/venkatrao1/cl5g6p8f2002k15ldkqcpf25q",
    renderRoutes: false,
    forceBusSize: 60
  }
};
const DEFAULT_THEME = "light";
const CUR_THEME = THEMES[urlSearchParams.get("theme") || DEFAULT_THEME];

function gotJSON(gtfs_json){
  map = new mapboxgl.Map({
    container:"main-map",
    accessToken: "pk.eyJ1IjoidmVua2F0cmFvMSIsImEiOiJjbDR6eG15a2gzNjBqM3Buc2U4emlmenRiIn0.0OgClKY8zHVpuJsCFVtRMQ",
    center: gtfs_json.centroid,
    doubleClickZoom: false,
    dragRotate: false,
    //keyboard: false,
    style: CUR_THEME.url,
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
    opacity: CUR_THEME.routeOpacity ||  0.2,
    pickable: false
  });

  self.deckGLOverlay = new deck.MapboxOverlay({
    layers: CUR_THEME.renderRoutes!==false ? [ routeLayer ] : [],
    getTooltip: ({index}) => (index && tooltips && tooltips[index])
  });

  map.addControl(deckGLOverlay);
  map.addControl(new mapboxgl.NavigationControl({
    showCompass: false,
    showZoom: true
  }), "top-right");

  if(CUR_THEME.forceBusColor){
    for(const [route_id, route] of Object.entries(gtfs_json.routes)) route.color=CUR_THEME.forceBusColor;
  }

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
    getSize: CUR_THEME.forceBusSize || 40,
    sizeMinPixels: 10,
  });
  deckGLOverlay.setProps({layers: CUR_THEME.renderRoutes!==false ? [routeLayer, vehicleLayer] : [vehicleLayer]});
}

$.ajax({
  url: "data/houston.json",
  dataType: "json",
  success: gotJSON
});
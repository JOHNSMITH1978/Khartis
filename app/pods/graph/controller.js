import Ember from 'ember';
import d3 from 'd3';
import projector from 'mapp/utils/projector';
import config from 'mapp/config/environment';
import GraphLayer from 'mapp/models/graph-layer';
import Mapping from 'mapp/models/mapping/mapping';
import Projection from 'mapp/models/projection';
import topojson from 'npm:topojson';
import {concatBuffers, uint32ToStr, calcCRC, build_pHYs, build_tEXt, tracePNGChunks} from 'mapp/utils/png-utils';

export default Ember.Controller.extend({
  
  queryParams: ['currentTab'],
  currentTab: null,

  states: [
    "visualizations",
    "export"
  ],
  state: "visualizations",
  
  basemapData: null,

  sidebarSubExpanded: false,
  
  editedLayer: null,
  editedColumn: null,

  onCurrentTabChange: function() {
    if (this.get('states').indexOf(this.get('currentTab')) !== -1) {
      this.set('state', this.get('currentTab'));
    }
  }.observes('currentTab').on("init"),
  
  availableProjections: function() {
    return this.get('Dictionnary.data.projections')
      .filter( p => p.id !== "lambert_azimuthal_equal_area");
  }.property('Dictionnary.data.projections'),
  
  isInStateVisualization: function() {
    return this.get('state') === "visualizations";
  }.property('state'),
  
  isInStateExport: function() {
    return this.get('state') === "export";
  }.property('state'),
  
  sidebarPartial: function() {
    return `graph/_sidebar/${this.get('state')}`;
  }.property('state'),

  sidebarActiveTab: function() {
    return this.get('state');
  }.property('state'),

  hasNextState: function() {
    return this.get('states').indexOf(this.get('state')) < (this.get('states').length - 1);
  }.property('state'),

  helpTemplate: function() {
    return `help/{locale}/graph/${this.get('state')}`;
  }.property('state'),
  
  setup() {
    this.loadBasemap(this.get('model.graphLayout.basemap'))
      .then( (json) => {
        let j = JSON.parse(json),
            partition = j.objects.land.geometries
              .reduce( (part, g) => {
                part[g.properties.square ? "left" : "right"].push(g);
                return part;
              }, {left: [], right: []});

        this.set('basemapData', {
          land: topojson.merge(j, partition.right),
          squares: topojson.mesh(j, {type: "GeometryCollection", geometries: partition.left}),
          lands: topojson.feature(j, j.objects.land),
          borders: topojson.mesh(j, j.objects.border, function(a, b) {
              return a.properties.featurecla === "International";
            }),
          bordersDisputed: topojson.mesh(j, j.objects.border, function(a, b) { 
              return a.properties.featurecla === "Disputed"; 
            }),
          centroids: topojson.feature(j, j.objects.centroid)
        });
      });
  },
  
  //TODO : basemap selection
  loadBasemap(basemap) {
    
    return new Promise((res, rej) => {
      
      var xhr = new XMLHttpRequest();
      xhr.open('GET', `${config.rootURL}data/map/${basemap}`, true);

      xhr.onload = (e) => {
        
        if (e.target.status == 200) {
          res(e.target.response);
        }
        
      };

      xhr.send();
      
    });
    
  },
  
  layoutChange: function() {
    this.send('onAskVersioning', 'freeze');
  }.observes('model.graphLayout.width', 'model.graphLayout.height', 'model.graphLayout.zoom',
    'model.graphLayout.tx', 'model.graphLayout.ty',
    'model.graphLayout.backgroundColor', 'model.graphLayout.backMapColor',
    'model.graphLayout.showGrid', 'model.graphLayout.showLegend', 'model.graphLayout.showBorders',
    'model.graphLayout.title', 'model.graphLayout.author', 'model.graphLayout.dataSource', 'model.graphLayout.comment'),
  
  layersChange: function() {

    if (this.get('model.graphLayout.showLegend') === null && this.get('model.graphLayers').length) {
      this.set('model.graphLayout.showLegend', true);
    } else if (!this.get('model.graphLayers').length) {
      this.set('model.graphLayout.showLegend', null);
    }
    this.send('onAskVersioning', 'freeze');

  }.observes('model.graphLayers.[]', 'model.graphLayers.@each._defferedChangeIndicator'),

  exportSVG() {
    var blob = new Blob([this.exportAsHTML()], {type: "image/svg+xml"});
    saveAs(blob, "export_mapp.svg");
  },

  exportPNG() {

    let _this = this;

    var svgString = this.exportAsHTML();

    var fact = 4.16;
    var canvas = document.getElementById("export-canvas");
    canvas.width = this.get('model.graphLayout.width')*fact;
    canvas.height = this.get('model.graphLayout.height')*fact;
    var ctx = canvas.getContext("2d");
    ctx.scale(fact, fact);
    var DOMURL = self.URL || self.webkitURL || self;
    var img = new Image();
    var svg = new Blob([svgString], {type: "image/svg+xml"});
    var url = DOMURL.createObjectURL(svg);
    

    img.onload = function() {
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(function(blob) {

          var arrayBuffer;
          var fileReader = new FileReader();
          fileReader.onload = function() {

              arrayBuffer = this.result;
              let dv = new DataView(arrayBuffer),
                  firstIDATChunkPos = undefined,
                  pos = 8,
                  getUint32 = function() {
                    var data = dv.getUint32(pos, false);
                    pos += 4;
                    return data;
                  };
              
              //find first IDAT chunk
              while (pos < dv.buffer.byteLength) {
                let size = getUint32(),
                    name = uint32ToStr(getUint32());
                if (name === "IDAT" && !firstIDATChunkPos) {
                  firstIDATChunkPos = pos - 8;
                  break;
                } else {
                  pos += size;
                }
                getUint32(); //crc
              }

              let left = arrayBuffer.slice(0, firstIDATChunkPos),
                  right = arrayBuffer.slice(firstIDATChunkPos);

              let extraBuffer = build_pHYs(300);

              let meta = {
                "Comment": "Made from Khartis",
                "Software": "Khartis"
              };

              for (let k in meta) {
                extraBuffer = concatBuffers(build_tEXt(k, meta[k]), extraBuffer);
              }

              let pngBuffer = concatBuffers(concatBuffers(left, extraBuffer), right);

              //tracePNGChunks(pngBuffer);

            saveAs(new Blob([pngBuffer], {type: "image/png"}), "export_mapp.png");
            DOMURL.revokeObjectURL(url);

          };
          fileReader.readAsArrayBuffer(blob);

        }, "image/png", 1);

        
    };
    img.src = url;

  },

  exportAsHTML() {
    
    try {
        var isFileSaverSupported = !!new Blob();
    } catch (e) {
        alert("blob not supported");
    }

    let node = d3.select("svg.map-editor")
        .node().cloneNode(true);
        
    let d3Node = d3.select(node);
    
    let x = parseInt(d3Node.selectAll("g.offset line.vertical-left").attr("x1")),
        y = parseInt(d3Node.selectAll("g.offset line.horizontal-top").attr("y1")),
        w = this.get('model.graphLayout.width'),
        h = this.get('model.graphLayout.height');
    
    d3Node.attr({
      width: this.get('model.graphLayout.width'),
      height: this.get('model.graphLayout.height'),
      viewBox: `${x} ${y} ${w} ${h}`
    });

    d3Node.selectAll("g.margin,g.offset").remove();
    d3Node.selectAll("rect.fg").remove();

    d3Node.append("text")
      .text("Made from Khartis")
      .attr({
        "x": x+w,
        "y": y+h,
        "dy": "-0.81em",
        "dx": "-0.81em",
        "font-size": "0.8em",
        "text-anchor": "end"
      });
      
    d3Node.select(".outer-map")
      .attr("clip-path", "url(#viewport-clip)");
              
    let html = d3Node.node()
      .outerHTML
      .replace(/http:[^\)"]*?#/g, "#")
      .replace(/&quot;/, "")
      .replace(/NS\d+\:/g, "xlink:");

    d3Node.remove();

    return html;
    
  },
  
  freeze: function() {
    this.get('store').versions().freeze(this.get('model').export());
  },
  
  invertSliderFn: function() {
    let fn = function(val) {
      return -val;
    }
    fn.invert = function(val) {
      return -val;
    }

    return fn;
  }.property(),
  
  actions: {
    
    bindProjection(proj) {
      this.set('model.graphLayout.projection', Projection.create(proj.export()));
      this.send('onAskVersioning', 'freeze');
    },
    
    editColumn(col) {
      if (col.get('incorrectCells.length')) {
        this.transitionToRoute('graph.column', col.get('_uuid'));
      }
    },
    
    addLayer(col) {
      let layer = GraphLayer.createDefault(col, this.get('model.geoDef'));
      this.get('model.graphLayers').unshiftObject(layer);
      this.transitionToRoute('graph.layer', layer.get('_uuid'));
    },
    
    editLayer(layerIndex) {
      let layer = this.get('model.graphLayers').objectAt(layerIndex);
      if (layer != this.get('editedLayer')) {
        this.transitionToRoute('graph.layer.edit', layer.get('_uuid'));
      } else {
        this.transitionToRoute('graph');
      }
    },
    
    removeLayer(layer) {
      this.get('ModalManager')
        .show('confirm', "Êtes vous sur de vouloir supprimer ce calque ?",
          "Confirmation de suppression", 'Oui', 'Annuler')
        .then(() => {
          this.get('model.graphLayers').removeObject(layer);
        });
    },
    
    toggleLayerVisibility(layer) {
      layer.toggleProperty('visible');
    },
    
    bindLayerMapping(type) {
      this.set('editedLayer.mapping', Mapping.create({
        type: type,
        varCol: this.get('editedLayer.mapping.varCol'),
        geoDef: this.get('editedLayer.mapping.geoDef')
      }));
    },
    
    bindMappingPattern(layer, pattern) {
      layer.set('mapping.pattern', pattern);
    },
    
    bindMappingShape(layer, shape) {
      layer.set('mapping.shape', shape);
    },
    
    bindMappingLabelCol(layer, col) {
      layer.set('mapping.labelCol', col);
    },
    
    bindScaleIntervalType(scale, type) {
      scale.set('intervalType', type);
    },
    
    bind(root, prop, value) {
      root.set(prop, value);
    },
    
    toggleRuleVisibility(rule) {
      rule.toggleProperty('visible');
    },

    toggleBordersVisibility() {
      this.toggleProperty('model.graphLayout.showBorders');
    },

    toggleGridVisibility() {
      this.toggleProperty('model.graphLayout.showGrid');
    },

    toggleLegendVisibility() {
      this.toggleProperty('model.graphLayout.showLegend');
    },
    
    resetTranslate() {
      this.get('model.graphLayout').setProperties({
        zoom: 1,
        tx: 0,
        ty: 0
      });
    },
    
    zoomPlus() {
      if (this.get('model.graphLayout.zoom') < 12) {
        this.incrementProperty('model.graphLayout.zoom');
      }
    },
    
    zoomMoins() {
      if (this.get('model.graphLayout.zoom') > 0) {
        this.decrementProperty('model.graphLayout.zoom');
      }
    },

    onIntervalTypeTabChange(id) {
      if (id === "linear-tab") {
        this.send('bindScaleIntervalType', this.get('editedLayer.mapping.scale'), 'linear');
      } else if (this.get('editedLayer.mapping.scale.intervalType') === "linear") {
        this.send('bindScaleIntervalType', this.get('editedLayer.mapping.scale'), 'regular');
      }
    },

    updateValueBreak(val) {
      console.log("hello", val);
      if (Ember.isEmpty(val)) {
        this.set('editedLayer.mapping.scale.valueBreak', null);
      } else {
        this.set('editedLayer.mapping.scale.valueBreak', val);
        this.get('editedLayer.mapping').clampValueBreak();
      }
    },

    randomizeRules() {
      this.get('editedLayer.mapping').generateRules(true);
    },
    
    export(format) {
      if (format === "svg") {
        this.exportSVG();
      } else {
        this.exportPNG();
      }
    },
    
    selectState(state) {
      this.set('state', state);
      this.transitionToRoute('graph');
    },
    
    next() {
      this.set('state', this.get('states')[this.get('states').indexOf(this.get('state'))+1]);
    },
    
    back() {
      if (this.get('states').indexOf(this.get('state')) > 0) {
        this.set('state', this.get('states')[this.get('states').indexOf(this.get('state'))-1]);
      } else {
        this.send('navigateToProject');
      }
    },

    closeSidebarSub() {
      this.transitionToRoute('graph');
    },

    navigateToProject() {
      this.transitionToRoute('project.step2', this.get('model._uuid'));
    },

    navigateToVisualizations() {
      this.send('selectState', 'visualizations');
    },

    navigateToExport() {
      this.send('selectState', 'export');
    },
    
    onAskVersioning(type) {
      switch (type) {
        case "undo":
          this.get('store').versions().undo();
          break;
        case "redo": 
          this.get('store').versions().redo();
          break;
        case "freeze":
          Ember.run.debounce(this, this.freeze, 1000);
          break;
      }
    }
    
  }
  
});
